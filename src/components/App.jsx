import React, { useState, useEffect, useCallback } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import * as rb from 'react-bootstrap'
import { Trans, useTranslation } from 'react-i18next'
import Wallets from './Wallets'
import CreateWallet from './CreateWallet'
import Send from './Send'
import Earn from './Earn'
import Receive from './Receive'
import CurrentWalletMagic from './CurrentWalletMagic'
import CurrentWalletAdvanced from './CurrentWalletAdvanced'
import Settings from './Settings'
import Navbar from './Navbar'
import Layout from './Layout'
import { useSettings } from '../context/SettingsContext'
import {
  useWebsocket,
  useWebsocketState,
  CJ_STATE_TAKER_RUNNING,
  CJ_STATE_MAKER_RUNNING,
} from '../context/WebsocketContext'
import { useCurrentWallet, useSetCurrentWallet, useSetCurrentWalletInfo } from '../context/WalletContext'
import { setSession, clearSession } from '../session'
import * as Api from '../libs/JmWalletApi'
import Onboarding from './Onboarding'

// interval in milliseconds for periodic session requests
const SESSION_REQUEST_INTERVAL = 10_000

export default function App() {
  const { t } = useTranslation()
  const currentWallet = useCurrentWallet()
  const setCurrentWallet = useSetCurrentWallet()
  const setCurrentWalletInfo = useSetCurrentWalletInfo()

  const [makerRunning, setMakerRunning] = useState()
  const [connectionError, setConnectionError] = useState()
  const [websocketConnected, setWebsocketConnected] = useState()
  const [coinjoinInProcess, setCoinjoinInProcess] = useState()
  const [showAlphaWarning, setShowAlphaWarning] = useState(false)
  const settings = useSettings()
  const websocket = useWebsocket()
  const websocketState = useWebsocketState()

  const startWallet = useCallback(
    (name, token) => {
      setSession(name, token)
      setCurrentWallet({ name, token })
    },
    [setCurrentWallet]
  )

  const stopWallet = () => {
    clearSession()
    setCurrentWallet(null)
    setCurrentWalletInfo(null)
  }

  // update maker/taker indicator based on websocket data
  const onWebsocketMessage = useCallback((message) => {
    const data = JSON.parse(message?.data)

    // update the maker/taker indicator according to `coinjoin_state` property
    if (data && typeof data.coinjoin_state === 'number') {
      setCoinjoinInProcess(data.coinjoin_state === CJ_STATE_TAKER_RUNNING)
      setMakerRunning(data.coinjoin_state === CJ_STATE_MAKER_RUNNING)
    }
  }, [])

  useEffect(() => {
    if (!websocket) return

    websocket.addEventListener('message', onWebsocketMessage)

    return () => websocket && websocket.removeEventListener('message', onWebsocketMessage)
  }, [websocket, onWebsocketMessage])

  // update the connection indicator based on the websocket connection state
  useEffect(() => {
    setWebsocketConnected(websocketState === WebSocket.OPEN)
  }, [websocketState])

  useEffect(() => {
    const abortCtrl = new AbortController()

    const resetState = () => {
      setCurrentWallet(null)
      setCurrentWalletInfo(null)
      setMakerRunning(null)
      setCoinjoinInProcess(null)
    }

    const refreshSession = () => {
      Api.getSession({ signal: abortCtrl.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
        .then((data) => {
          const { maker_running, coinjoin_in_process, wallet_name } = data
          const activeWalletName = wallet_name !== 'None' ? wallet_name : null

          setConnectionError(null)
          setMakerRunning(maker_running)
          setCoinjoinInProcess(coinjoin_in_process)
          if (currentWallet && (!activeWalletName || currentWallet.name !== activeWalletName)) {
            setCurrentWallet(null)
            setCurrentWalletInfo(null)
            clearSession()
          }
        })
        .catch((err) => {
          if (!abortCtrl.signal.aborted) {
            setConnectionError(err.message)
            resetState()
          }
        })
    }
    refreshSession()
    const interval = setInterval(refreshSession, SESSION_REQUEST_INTERVAL)
    return () => {
      abortCtrl.abort()
      clearInterval(interval)
    }
  }, [currentWallet, setCurrentWallet, setCurrentWalletInfo])

  if (settings.showOnboarding === true) {
    return (
      <rb.Container className="onboarding my-5">
        <rb.Row className="justify-content-center mt-md-5">
          <rb.Col xs={10} sm={10} md={8} lg={6} xl={4}>
            <Onboarding />
          </rb.Col>
        </rb.Row>
      </rb.Container>
    )
  }

  return (
    <>
      {showAlphaWarning && (
        <div className="warning-card-wrapper">
          <rb.Card className="warning-card translate-middle shadow-lg">
            <rb.Card.Body>
              <rb.Card.Title className="text-center mb-3">{t('footer.warning_alert_title')}</rb.Card.Title>
              <p className="text-secondary">{t('footer.warning_alert_text')}</p>
              <div className="text-center mt-3">
                <rb.Button variant="secondary" onClick={() => setShowAlphaWarning(false)}>
                  {t('footer.warning_alert_button_ok')}
                </rb.Button>
              </div>
            </rb.Card.Body>
          </rb.Card>
        </div>
      )}
      <Navbar coinjoinInProcess={coinjoinInProcess} makerRunning={makerRunning} connectionError={connectionError} />
      <rb.Container as="main" className="py-5">
        {connectionError ? (
          <rb.Alert variant="danger">{t('app.alert_no_connection', { connectionError })}.</rb.Alert>
        ) : (
          <Routes>
            <Route element={<Layout />}>
              <Route exact path="/" element={<Wallets startWallet={startWallet} stopWallet={stopWallet} />} />
              <Route
                path="create-wallet"
                element={<CreateWallet currentWallet={currentWallet} startWallet={startWallet} />}
              />
              {currentWallet && (
                <>
                  <Route
                    path="send"
                    element={<Send makerRunning={makerRunning} coinjoinInProcess={coinjoinInProcess} />}
                  />
                  <Route
                    path="earn"
                    element={
                      <Earn
                        currentWallet={currentWallet}
                        coinjoinInProcess={coinjoinInProcess}
                        makerRunning={makerRunning}
                      />
                    }
                  />
                  <Route path="receive" element={<Receive currentWallet={currentWallet} />} />
                  <Route path="settings" element={<Settings currentWallet={currentWallet} />} />
                </>
              )}
            </Route>
            {currentWallet && !settings.useAdvancedWalletMode && (
              <Route element={<Layout variant="narrow" />}>
                <Route path="wallet" element={<CurrentWalletMagic />} />
              </Route>
            )}
            {currentWallet && settings.useAdvancedWalletMode && (
              <Route element={<Layout variant="wide" />}>
                <Route path="wallet" element={<CurrentWalletAdvanced />} />
              </Route>
            )}
            <Route path="*" element={<Navigate to="/" replace={true} />} />
          </Routes>
        )}
      </rb.Container>
      <rb.Nav as="footer" className="border-top py-2">
        <rb.Container fluid="xl" className="d-flex flex-column flex-md-row justify-content-center py-2 px-4">
          <div className="d-flex flex-1 order-2 order-md-0 flex-column justify-content-center align-items-center align-items-md-start">
            <div className="warning-hint text-start text-secondary d-none d-md-block">
              <Trans i18nKey="footer.warning">
                This is pre-alpha software.
                <rb.Button
                  variant="link"
                  className="warning-hint text-start border-0 p-0 text-secondary"
                  onClick={() => setShowAlphaWarning(true)}
                >
                  Read this before using.
                </rb.Button>
              </Trans>
            </div>
          </div>
          <div className="d-flex order-1 flex-1 flex-grow-0 justify-content-center align-items-center px-4">
            <rb.Nav.Item>
              <a
                href="https://github.com/joinmarket-webui/joinmarket-webui/wiki"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link text-secondary px-2"
              >
                {t('footer.docs')}
              </a>
            </rb.Nav.Item>
            <rb.Nav.Item>
              <a
                href="https://github.com/joinmarket-webui/joinmarket-webui#-features"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link text-secondary px-2"
              >
                {t('footer.features')}
              </a>
            </rb.Nav.Item>
            <rb.Nav.Item>
              <a
                href="https://github.com/joinmarket-webui/joinmarket-webui"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link text-secondary px-2"
              >
                {t('footer.github')}
              </a>
            </rb.Nav.Item>
            <rb.Nav.Item>
              <a
                href="https://twitter.com/joinmarket"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link text-secondary px-2"
              >
                {t('footer.twitter')}
              </a>
            </rb.Nav.Item>
          </div>
          <div className="d-flex order-0 order-md-2 flex-1 justify-content-center justify-content-md-end align-items-center">
            <span className={`mx-1 ${websocketConnected ? 'text-success' : 'text-danger'}`}>•</span>
            <span className="text-secondary">
              {websocketConnected ? t('footer.connected') : t('footer.disconnected')}
            </span>
          </div>
        </rb.Container>
      </rb.Nav>
    </>
  )
}
