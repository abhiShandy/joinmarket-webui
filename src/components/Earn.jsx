import React from 'react'
import { useEffect, useState } from 'react'
import * as rb from 'react-bootstrap'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../context/SettingsContext'
import Sprite from './Sprite'
import PageTitle from './PageTitle'
import ToggleSwitch from './ToggleSwitch'
import * as Api from '../libs/JmWalletApi'

const OFFERTYPE_REL = 'sw0reloffer'
const OFFERTYPE_ABS = 'sw0absoffer'

const YieldgenReport = ({ lines, maxAmountOfRows = 25 }) => {
  const { t } = useTranslation()
  const settings = useSettings()

  const empty = !lines || lines.length < 2
  const headers = empty ? [] : lines[0].split(',')

  const linesWithoutHeader = empty
    ? []
    : lines
        .slice(1, lines.length)
        .map((line) => line.split(','))
        .reverse()

  const visibleLines = linesWithoutHeader.slice(0, maxAmountOfRows)

  return (
    <div className="mt-2 mb-3">
      {empty && <rb.Alert variant="info">{t('earn.alert_empty_report')}</rb.Alert>}
      {!empty && (
        <>
          <rb.Table striped bordered hover variant={settings.theme} responsive>
            <thead>
              <tr>
                {headers.map((name, index) => (
                  <th key={`header_${index}`}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleLines.map((line, trIndex) => (
                <tr key={`tr_${trIndex}`}>
                  {line.map((val, tdIndex) => (
                    <td key={`td_${tdIndex}`}>{val}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {headers.map((name, index) => (
                  <th key={`footer_${index}`}>{name}</th>
                ))}
              </tr>
            </tfoot>
          </rb.Table>
          <div className="mt-1 d-flex justify-content-end">
            <small>
              {t('earn.text_report_length', {
                visibleLines: visibleLines.length,
                linesWithoutHeader: linesWithoutHeader.length,
              })}
            </small>
          </div>
        </>
      )}
    </div>
  )
}

export default function Earn({ currentWallet, coinjoinInProcess, makerRunning }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const [validated, setValidated] = useState(false)
  const [alert, setAlert] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const [isWaiting, setIsWaiting] = useState(false)
  const [isWaitingMakerStart, setIsWaitingMakerStart] = useState(false)
  const [isWaitingMakerStop, setIsWaitingMakerStop] = useState(false)
  const [isReportLoading, setIsReportLoading] = useState(false)
  const [isShowReport, setIsShowReport] = useState(false)
  const [offertype, setOffertype] = useState(
    (settings.useAdvancedWalletMode && window.localStorage.getItem('jm-offertype')) || OFFERTYPE_REL
  )
  const [feeRel, setFeeRel] = useState(parseFloat(window.localStorage.getItem('jm-feeRel')) || 0.000_3)
  const [feeAbs, setFeeAbs] = useState(parseInt(window.localStorage.getItem('jm-feeAbs'), 10) || 250)
  const [minsize, setMinsize] = useState(parseInt(window.localStorage.getItem('jm-minsize'), 10) || 100_000)
  const [yieldgenReportLines, setYieldgenReportLines] = useState([])

  const feeRelPercentageMin = 0.0
  const feeRelPercentageMax = 10.0
  const feeRelPercentageStep = 0.0001

  const percentageToFactor = (val, precision = 6) => {
    // Value cannot just be divided
    // e.g. ✗ 0.0027 / 100 == 0.000027000000000000002
    // but: ✓ Number((0.0027 / 100).toFixed(6)) = 0.000027
    return Number((val / 100).toFixed(precision))
  }

  const factorToPercentage = (val, precision = 6) => {
    // Value cannot just be divided
    // e.g. ✗ 0.000027 * 100 == 0.0026999999999999997
    // but: ✓ Number((0.000027 * 100).toFixed(6)) = 0.0027
    return Number((val * 100).toFixed(precision))
  }

  const setAndPersistOffertype = (value) => {
    setOffertype(value)
    window.localStorage.setItem('jm-offertype', value)
  }

  const setAndPersistFeeRel = (value) => {
    setFeeRel(value)
    window.localStorage.setItem('jm-feeRel', value)
  }

  const setAndPersistFeeAbs = (value) => {
    setFeeAbs(value)
    window.localStorage.setItem('jm-feeAbs', value)
  }

  const setAndPersistMinsize = (value) => {
    setMinsize(value)
    window.localStorage.setItem('jm-minsize', value)
  }

  const startMakerService = async (cjfee_a, cjfee_r, ordertype, minsize) => {
    const { name: walletName, token } = currentWallet

    setAlert(null)
    setIsSending(true)
    setIsWaitingMakerStart(false)
    try {
      const res = await Api.postMakerStart(
        { walletName, token },
        {
          cjfee_a,
          cjfee_r,
          ordertype,
          minsize,
        }
      )

      if (res.ok) {
        // There is no response data to check if maker got started:
        // Wait for the websocket or session response!
        setIsWaitingMakerStart(true)
      } else {
        const { message } = await res.json()
        setAlert({ variant: 'danger', message })
      }
    } catch (e) {
      setAlert({ variant: 'danger', message: e.message })
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    setAlert(null)

    const waitingForMakerToStart = isWaitingMakerStart && !makerRunning
    setIsWaitingMakerStart(waitingForMakerToStart)
    waitingForMakerToStart && setAlert({ variant: 'success', message: t('earn.alert_starting') })

    const waitingForMakerToStop = isWaitingMakerStop && makerRunning
    setIsWaitingMakerStop(waitingForMakerToStop)
    waitingForMakerToStop && setAlert({ variant: 'success', message: t('earn.alert_stopping') })

    const waiting = waitingForMakerToStart || waitingForMakerToStop
    setIsWaiting(waiting)
    !waiting && makerRunning && setAlert({ variant: 'success', message: t('earn.alert_running') })
  }, [makerRunning, isWaitingMakerStart, isWaitingMakerStop, t])

  useEffect(() => {
    if (!isShowReport) return

    const abortCtrl = new AbortController()
    setIsReportLoading(true)

    Api.getYieldgenReport({ signal: abortCtrl.signal })
      .then((res) => {
        if (res.ok) return res.json()
        // 404 is returned till the maker is started at least once
        if (res.status === 404) return {}
        return Promise.reject(new Error(res.message || t('earn.error_loading_report_failed')))
      })
      .then((data) => setYieldgenReportLines(data.yigen_data))
      .catch((err) => {
        console.log(`Error while loading yield generator`, err)
      })
      // show the loader a little longer to avoid flickering
      .then((_) => new Promise((r) => setTimeout(r, 200)))
      .finally(() => {
        !abortCtrl.signal.aborted && setIsReportLoading(false)
      })

    return () => abortCtrl.abort()
  }, [makerRunning, isShowReport, t])

  const stopMakerService = async () => {
    const { name: walletName, token } = currentWallet

    setAlert(null)
    setIsSending(true)
    setIsWaitingMakerStop(false)
    try {
      const res = await Api.getMakerStop({ walletName, token })

      if (res.ok) {
        // There is no response data to check if maker got stopped:
        // Wait for the websocket or session response!
        setIsWaitingMakerStop(true)
      } else {
        const { message } = await res.json()
        setAlert({ variant: 'danger', message })
      }
    } catch (e) {
      setAlert({ variant: 'danger', message: e.message })
    } finally {
      setIsSending(false)
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()

    const form = e.currentTarget
    const isValid = form.checkValidity()
    setValidated(true)

    if (isValid) {
      if (makerRunning === false) {
        await startMakerService(feeAbs, feeRel, offertype, minsize)
      } else {
        await stopMakerService()
      }
    }
  }

  const isRelOffer = offertype === OFFERTYPE_REL

  return (
    <div className="earn">
      <rb.Row>
        <rb.Col>
          <PageTitle title={t('earn.title')} subtitle={t('earn.subtitle')} />

          <rb.Fade in={coinjoinInProcess} mountOnEnter={true} unmountOnExit={true}>
            <div className="mb-4 p-3 border border-1 rounded">
              <small className="text-secondary">{t('earn.alert_coinjoin_in_progress')}</small>
            </div>
          </rb.Fade>

          {alert && <rb.Alert variant={alert.variant}>{alert.message}</rb.Alert>}

          {!coinjoinInProcess && (
            <rb.Form onSubmit={onSubmit} validated={validated} noValidate>
              {!makerRunning && !isWaiting && (
                <>
                  {settings.useAdvancedWalletMode && (
                    <rb.Form.Group className="mb-3" controlId="offertype">
                      <ToggleSwitch
                        label={t('earn.toggle_rel_offer')}
                        initialValue={isRelOffer}
                        onToggle={(isToggled) => setAndPersistOffertype(isToggled ? OFFERTYPE_REL : OFFERTYPE_ABS)}
                      />
                    </rb.Form.Group>
                  )}
                  {isRelOffer ? (
                    <rb.Form.Group className="mb-3" controlId="feeRel">
                      <rb.Form.Label className="mb-0">
                        {t('earn.label_rel_fee', {
                          fee: feeRel !== '' ? `(${factorToPercentage(feeRel)}%)` : '',
                        })}
                      </rb.Form.Label>
                      <div className="mb-2">
                        <rb.Form.Text className="text-secondary">{t('earn.description_rel_fee')}</rb.Form.Text>
                      </div>
                      <rb.Form.Control
                        type="number"
                        name="feeRel"
                        value={factorToPercentage(feeRel)}
                        className="slashed-zeroes"
                        min={feeRelPercentageMin}
                        max={feeRelPercentageMax}
                        step={feeRelPercentageStep}
                        required
                        onChange={(e) => setAndPersistFeeRel(percentageToFactor(e.target.value))}
                      />
                      <rb.Form.Control.Feedback type="invalid">
                        {t('feedback_invalid_rel_fee', {
                          feeRelPercentageMin: `${feeRelPercentageMin}%`,
                          feeRelPercentageMax: `${feeRelPercentageMax}%`,
                        })}
                      </rb.Form.Control.Feedback>
                    </rb.Form.Group>
                  ) : (
                    <rb.Form.Group className="mb-3" controlId="feeAbs">
                      <rb.Form.Label className="mb-0">{t('earn.label_abs_fee')}</rb.Form.Label>
                      <div className="mb-2">
                        <rb.Form.Text className="text-secondary">{t('earn.description_abs_fee')}</rb.Form.Text>
                      </div>
                      <rb.Form.Control
                        type="number"
                        name="feeAbs"
                        value={feeAbs}
                        className="slashed-zeroes"
                        min={0}
                        step={1}
                        required
                        onChange={(e) => setAndPersistFeeAbs(e.target.value)}
                      />
                      <rb.Form.Control.Feedback type="invalid">
                        {t('earn.feedback_invalid_abs_fee')}
                      </rb.Form.Control.Feedback>
                    </rb.Form.Group>
                  )}
                  {settings.useAdvancedWalletMode && (
                    <rb.Form.Group className="mb-3" controlId="minsize">
                      <rb.Form.Label>{t('earn.label_min_amount')}</rb.Form.Label>
                      <rb.Form.Control
                        type="number"
                        name="minsize"
                        value={minsize}
                        className="slashed-zeroes"
                        min={0}
                        step={1000}
                        required
                        onChange={(e) => setAndPersistMinsize(e.target.value)}
                      />
                      <rb.Form.Control.Feedback type="invalid">
                        {t('earn.feedback_invalid_min_amount')}
                      </rb.Form.Control.Feedback>
                    </rb.Form.Group>
                  )}
                </>
              )}

              <rb.Button variant="dark" type="submit" disabled={isSending || isWaiting}>
                {isSending ? (
                  <>
                    <rb.Spinner
                      as="span"
                      animation="border"
                      size="sm"
                      role="status"
                      aria-hidden="true"
                      className="me-2"
                    />
                    {makerRunning === true ? t('earn.text_stopping') : t('earn.text_starting')}
                  </>
                ) : makerRunning === true ? (
                  t('earn.button_stop')
                ) : (
                  t('earn.button_start')
                )}
              </rb.Button>
            </rb.Form>
          )}
        </rb.Col>
      </rb.Row>

      {settings.useAdvancedWalletMode && (
        <rb.Row className="mt-5 mb-3">
          <rb.Col>
            <rb.Button
              variant="outline-dark"
              className="border-0 mb-2 d-inline-flex align-items-center"
              onClick={(e) => {
                e.preventDefault()
                setIsShowReport(!isShowReport)
              }}
            >
              <Sprite symbol={isShowReport ? 'hide' : 'show'} width="24" height="24" className="me-2" />
              {isShowReport ? t('earn.button_hide_report') : t('earn.button_show_report')}
              {isReportLoading && (
                <rb.Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="ms-2 me-1"
                />
              )}
            </rb.Button>
          </rb.Col>
          <rb.Fade in={isShowReport} mountOnEnter={true} unmountOnExit={true}>
            <rb.Col md={12}>
              <YieldgenReport lines={yieldgenReportLines} />
            </rb.Col>
          </rb.Fade>
        </rb.Row>
      )}
    </div>
  )
}
