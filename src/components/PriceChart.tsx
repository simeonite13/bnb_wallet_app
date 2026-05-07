import { useEffect, useRef, useState } from 'react'
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  ColorType, LineStyle,
  type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts'

// ── Types ──────────────────────────────────────────────────────────────────────

type Range     = '1D' | '7D' | '30D'
type Indicator = 'RSI' | 'MACD'

const RANGE_CONFIG: Record<Range, { bar: string; limit: number }> = {
  '1D':  { bar: '30m', limit: 48  },
  '7D':  { bar: '4H',  limit: 42  },
  '30D': { bar: '1D',  limit: 30  },
}

interface Candle {
  time: UTCTimestamp
  open: number; high: number; low: number; close: number
  volume: number
}

// ── EMA config ─────────────────────────────────────────────────────────────────

const EMA_PERIODS = [9, 21, 50, 200] as const
type EmaPeriod = typeof EMA_PERIODS[number]

const EMA_COLOR: Record<EmaPeriod, string> = {
  9:   '#fbbf24',  // amber
  21:  '#60a5fa',  // blue
  50:  '#f97316',  // orange
  200: '#c084fc',  // purple
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function fetchKlines(range: Range): Promise<Candle[]> {
  const { bar, limit } = RANGE_CONFIG[range]
  const res = await fetch(
    `/api/okx/api/v5/market/candles?instId=BNB-USDT&bar=${bar}&limit=${limit}`,
    { signal: AbortSignal.timeout(10_000) }
  )
  if (!res.ok) throw new Error(`OKX ${res.status}`)
  const json = await res.json()
  if (json.code !== '0') throw new Error(`OKX ${json.code}: ${json.msg || 'no data'}`)
  // OKX: [ts, open, high, low, close, vol_base, ...], newest first → reverse
  const raw: string[][] = (json.data as string[][]).slice().reverse()
  return raw.map(([ms, o, h, l, c, v]) => ({
    time: Math.floor(+ms / 1000) as UTCTimestamp,
    open: +o, high: +h, low: +l, close: +c, volume: +v,
  }))
}

// ── Math ───────────────────────────────────────────────────────────────────────

function calcEMA(data: number[], period: number): number[] {
  if (data.length < period) return new Array(data.length).fill(NaN)
  const k   = 2 / (period + 1)
  const out = new Array(data.length).fill(NaN)
  let sum   = 0
  for (let i = 0; i < period; i++) sum += data[i]
  out[period - 1] = sum / period
  for (let i = period; i < data.length; i++) out[i] = data[i] * k + out[i - 1] * (1 - k)
  return out
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(period).fill(null)
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    d > 0 ? (avgGain += d) : (avgLoss -= d)
  }
  avgGain /= period; avgLoss /= period
  out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(0,  d)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period
    out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
  }
  return out
}

function calcMACD(closes: number[], fast = 12, slow = 26, sig = 9) {
  const f     = calcEMA(closes, fast)
  const s     = calcEMA(closes, slow)
  const macd  = closes.map((_, i) => (isNaN(f[i]) || isNaN(s[i])) ? NaN : f[i] - s[i])
  const sigEMA = calcEMA(macd.slice(slow - 1), sig)
  const signal = [...new Array(slow - 1).fill(NaN), ...sigEMA]
  const hist   = macd.map((v, i) => (isNaN(v) || isNaN(signal[i])) ? NaN : v - signal[i])
  return { macd, signal, hist }
}

// Bollinger Bands: SMA(period) ± multiplier × stddev
function calcBB(closes: number[], period = 20, mult = 2) {
  const upper: number[] = new Array(closes.length).fill(NaN)
  const mid:   number[] = new Array(closes.length).fill(NaN)
  const lower: number[] = new Array(closes.length).fill(NaN)
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1)
    const mean  = slice.reduce((a, b) => a + b, 0) / period
    const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period)
    mid[i]   = mean
    upper[i] = mean + mult * std
    lower[i] = mean - mult * std
  }
  return { upper, mid, lower }
}

// ── Colour palette ─────────────────────────────────────────────────────────────

const C = {
  bg:      '#111318',
  text:    '#5a6480',
  grid:    '#1e2230',
  cross:   '#f0b90b55',
  crossLbl:'#1a1400',
  border:  '#1e2230',
  up:      '#22c55e',
  dn:      '#ef4444',
  vol:     (up: boolean) => up ? '#22c55e55' : '#ef444455',
  rsi:     '#a78bfa',
  macdL:   '#60a5fa',
  macdS:   '#f0b90b',
  bbBand:  '#38bdf8',   // sky blue — upper & lower
  bbMid:   '#64748b',   // slate   — middle SMA
}

type EmaPoint = { time: UTCTimestamp; value: number }

// ── Component ──────────────────────────────────────────────────────────────────

export function PriceChart() {
  const mainElRef = useRef<HTMLDivElement>(null)
  const indElRef  = useRef<HTMLDivElement>(null)

  const mainChart = useRef<ReturnType<typeof createChart> | null>(null)
  const indChart  = useRef<ReturnType<typeof createChart> | null>(null)

  const candlesSeries = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volSeries     = useRef<ISeriesApi<'Histogram'>   | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indSeries     = useRef<ISeriesApi<any>[]>([])
  const emaSeries     = useRef<Map<EmaPeriod, ISeriesApi<'Line'>>>(new Map())
  const bbSeries      = useRef<{ upper: ISeriesApi<'Line'>; mid: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'> } | null>(null)

  const [range,       setRange]       = useState<Range>('1D')
  const [indicator,   setIndicator]   = useState<Indicator>('RSI')
  const [enabledEmas, setEnabledEmas] = useState<Set<EmaPeriod>>(new Set([9, 21]))
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [last,        setLast]        = useState<Candle | null>(null)
  const [lo,          setLo]          = useState<number | null>(null)
  const [hi,          setHi]          = useState<number | null>(null)
  const [rsiVal,      setRsiVal]      = useState<number | null>(null)
  const [macdVals,    setMacdVals]    = useState<{ m: number; s: number; h: number } | null>(null)
  const [emaVals,     setEmaVals]     = useState<Partial<Record<EmaPeriod, number>>>({})
  const [bbEnabled,   setBbEnabled]   = useState(false)
  const [bbVals,      setBbVals]      = useState<{ upper: number; mid: number; lower: number } | null>(null)

  // Candle cache — avoids re-fetching when only overlay toggles change
  const candleCache   = useRef<Candle[]>([])
  const bbEnabledRef  = useRef(bbEnabled)
  bbEnabledRef.current = bbEnabled

  // Keep a ref of enabledEmas so the EMA-only effect always sees the latest set
  const enabledEmasRef = useRef(enabledEmas)
  enabledEmasRef.current = enabledEmas

  // ── BB apply helper (used by both fetch + toggle effects) ───────────────────
  function applyBB(data: Candle[], closes: number[], enabled: boolean) {
    const bb = bbSeries.current
    if (!bb) return
    if (!enabled) {
      bb.upper.setData([]); bb.mid.setData([]); bb.lower.setData([])
      setBbVals(null)
      return
    }
    const { upper, mid, lower } = calcBB(closes)
    const toLine = (arr: number[]) =>
      data.map((c, i) => isNaN(arr[i]) ? null : { time: c.time, value: arr[i] })
          .filter((p): p is EmaPoint => p !== null)
    bb.upper.setData(toLine(upper))
    bb.mid.setData(toLine(mid))
    bb.lower.setData(toLine(lower))
    const last = data.length - 1
    const u = upper.filter(v => !isNaN(v)), m = mid.filter(v => !isNaN(v)), l = lower.filter(v => !isNaN(v))
    if (u.length) setBbVals({ upper: u[u.length-1], mid: m[m.length-1], lower: l[l.length-1] })
  }

  // ── Create charts + persistent series once ──────────────────────────────────
  useEffect(() => {
    if (!mainElRef.current || !indElRef.current) return

    const shared = {
      layout:    { background: { type: ColorType.Solid, color: C.bg }, textColor: C.text },
      grid:      { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: {
        vertLine: { color: C.cross, labelBackgroundColor: C.crossLbl },
        horzLine: { color: C.cross, labelBackgroundColor: C.crossLbl },
      },
    }

    const mc = createChart(mainElRef.current, {
      ...shared,
      rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.05, bottom: 0.22 } },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false },
      width: mainElRef.current.clientWidth,
      height: 280,
    })

    const ic = createChart(indElRef.current, {
      ...shared,
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false },
      width: indElRef.current.clientWidth,
      height: 120,
    })

    // Sync time scales
    let syncing = false
    mc.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (syncing || !r) return; syncing = true; ic.timeScale().setVisibleLogicalRange(r); syncing = false
    })
    ic.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (syncing || !r) return; syncing = true; mc.timeScale().setVisibleLogicalRange(r); syncing = false
    })

    candlesSeries.current = mc.addSeries(CandlestickSeries, {
      upColor: C.up, downColor: C.dn,
      borderUpColor: C.up, borderDownColor: C.dn,
      wickUpColor: C.up, wickDownColor: C.dn,
    })

    volSeries.current = mc.addSeries(HistogramSeries, {
      priceScaleId: 'vol', priceFormat: { type: 'volume' }, color: '#22c55e44',
    })

    mc.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

    // Create one LineSeries per EMA period (persisted for the chart's lifetime)
    for (const period of EMA_PERIODS) {
      const s = mc.addSeries(LineSeries, {
        color:     EMA_COLOR[period],
        lineWidth: 1,
        crosshairMarkerVisible: false,
        priceLineVisible: false,
        lastValueVisible: true,
      })
      emaSeries.current.set(period, s)
    }

    // Bollinger Band series (upper + mid + lower) — data set/cleared by toggle
    const bbShared = { crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false }
    bbSeries.current = {
      upper: mc.addSeries(LineSeries, { ...bbShared, color: C.bbBand, lineWidth: 1, lineStyle: LineStyle.Dashed }),
      mid:   mc.addSeries(LineSeries, { ...bbShared, color: C.bbMid,  lineWidth: 1, lineStyle: LineStyle.Dashed }),
      lower: mc.addSeries(LineSeries, { ...bbShared, color: C.bbBand, lineWidth: 1, lineStyle: LineStyle.Dashed }),
    }

    mainChart.current = mc
    indChart.current  = ic

    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width
      mc.applyOptions({ width: w })
      ic.applyOptions({ width: w })
    })
    ro.observe(mainElRef.current)

    return () => { ro.disconnect(); mc.remove(); ic.remove() }
  }, [])

  // ── Rebuild indicator series when type changes ───────────────────────────────
  useEffect(() => {
    const ic = indChart.current
    if (!ic) return
    for (const s of indSeries.current) { try { ic.removeSeries(s) } catch { /* */ } }
    indSeries.current = []

    if (indicator === 'RSI') {
      const s = ic.addSeries(LineSeries, { color: C.rsi, lineWidth: 2 })
      s.createPriceLine({ price: 70, color: C.dn, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,  title: 'OB' })
      s.createPriceLine({ price: 30, color: C.up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,  title: 'OS' })
      s.createPriceLine({ price: 50, color: C.text, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' })
      indSeries.current = [s]
    } else {
      const hist  = ic.addSeries(HistogramSeries, { color: '#22c55e44' })
      const macdL = ic.addSeries(LineSeries, { color: C.macdL, lineWidth: 2 })
      const macdS = ic.addSeries(LineSeries, { color: C.macdS, lineWidth: 1 })
      macdL.createPriceLine({ price: 0, color: C.text, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' })
      indSeries.current = [hist, macdL, macdS]
    }
  }, [indicator])

  // ── Fetch + apply all data ───────────────────────────────────────────────────
  useEffect(() => {
    if (!candlesSeries.current || !volSeries.current) return
    let cancelled = false
    setLoading(true); setError(null)

    fetchKlines(range).then(data => {
      if (cancelled) return

      // Candles + volume
      candlesSeries.current!.setData(data)
      volSeries.current!.setData(
        data.map(c => ({ time: c.time, value: c.volume, color: C.vol(c.close >= c.open) }))
      )
      mainChart.current?.timeScale().fitContent()

      // Cache candles for EMA-only updates, then apply EMAs
      candleCache.current = data
      const closes = data.map(c => c.close)
      const newEmaVals: Partial<Record<EmaPeriod, number>> = {}

      for (const period of EMA_PERIODS) {
        const series = emaSeries.current.get(period)
        if (!series) continue
        if (enabledEmasRef.current.has(period)) {
          const vals = calcEMA(closes, period)
          const pts: EmaPoint[] = data
            .map((c, i) => isNaN(vals[i]) ? null : { time: c.time, value: vals[i] })
            .filter((p): p is EmaPoint => p !== null)
          series.setData(pts)
          if (pts.length) newEmaVals[period] = pts[pts.length - 1].value
        } else {
          series.setData([])
        }
      }
      setEmaVals(newEmaVals)

      // Bollinger Bands
      applyBB(data, closes, bbEnabledRef.current)

      // RSI
      if (indicator === 'RSI' && indSeries.current.length === 1) {
        const rsi = calcRSI(closes)
        const pts = data
          .map((c, i) => rsi[i] !== null ? { time: c.time, value: rsi[i]! } : null)
          .filter((p): p is { time: UTCTimestamp; value: number } => p !== null)
        indSeries.current[0].setData(pts)
        setRsiVal(pts.length ? pts[pts.length - 1].value : null)
        setMacdVals(null)
      }

      // MACD
      if (indicator === 'MACD' && indSeries.current.length === 3) {
        const { macd, signal, hist } = calcMACD(closes)
        const [histS, macdS, sigS] = indSeries.current
        const toPoints = (arr: number[]) =>
          data.map((c, i) => isNaN(arr[i]) ? null : { time: c.time, value: arr[i] })
              .filter((p): p is { time: UTCTimestamp; value: number } => p !== null)
        macdS.setData(toPoints(macd))
        sigS.setData(toPoints(signal))
        histS.setData(
          data.map((c, i) => isNaN(hist[i]) ? null : {
            time: c.time, value: hist[i], color: hist[i] >= 0 ? '#22c55e55' : '#ef444455',
          }).filter((p): p is { time: UTCTimestamp; value: number; color: string } => p !== null)
        )
        const lm = macd.filter(v => !isNaN(v))
        const ls = signal.filter(v => !isNaN(v))
        const lh = hist.filter(v => !isNaN(v))
        if (lm.length) setMacdVals({ m: lm[lm.length-1], s: ls[ls.length-1], h: lh[lh.length-1] })
        setRsiVal(null)
      }

      indChart.current?.timeScale().fitContent()
      if (data.length) {
        setLast(data[data.length-1])
        setLo(Math.min(...data.map(c => c.low)))
        setHi(Math.max(...data.map(c => c.high)))
      }
      setLoading(false)
    }).catch(e => {
      if (!cancelled) { setError(String(e)); setLoading(false) }
    })

    return () => { cancelled = true }
  }, [range, indicator])

  // ── Re-apply overlays from cache when toggles change (no network call) ───────
  useEffect(() => {
    const data = candleCache.current
    if (!data.length) return
    const closes = data.map(c => c.close)
    const newEmaVals: Partial<Record<EmaPeriod, number>> = {}
    for (const period of EMA_PERIODS) {
      const series = emaSeries.current.get(period)
      if (!series) continue
      if (enabledEmas.has(period)) {
        const vals = calcEMA(closes, period)
        const pts: EmaPoint[] = data
          .map((c, i) => isNaN(vals[i]) ? null : { time: c.time, value: vals[i] })
          .filter((p): p is EmaPoint => p !== null)
        series.setData(pts)
        if (pts.length) newEmaVals[period] = pts[pts.length - 1].value
      } else {
        series.setData([])
      }
    }
    setEmaVals(newEmaVals)
    applyBB(data, closes, bbEnabled)
  }, [enabledEmas, bbEnabled])

  function toggleEmaFull(period: EmaPeriod) {
    setEnabledEmas(prev => {
      const next = new Set(prev)
      next.has(period) ? next.delete(period) : next.add(period)
      return next
    })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const fmt  = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtV = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : n.toFixed(0)
  const isUp = last ? last.close >= last.open : true

  const rsiColor = rsiVal !== null ? (rsiVal > 70 ? C.dn : rsiVal < 30 ? C.up : C.rsi) : C.rsi
  const rsiLabel = rsiVal !== null ? (rsiVal > 70 ? ' OB' : rsiVal < 30 ? ' OS' : '') : ''

  return (
    <div className="card price-chart-card">
      {/* ── Header ── */}
      <div className="chart-header">
        <div className="chart-title-group">
          <h2 style={{ marginBottom: 4 }}>BNB / USDT — OKX</h2>
          <div className="chart-ohlc-row">
            {last && (
              <>
                <span className="ohlc-item"><span className="ohlc-label">O</span>${fmt(last.open)}</span>
                <span className="ohlc-item"><span className="ohlc-label">H</span><span style={{ color: C.up }}>${fmt(last.high)}</span></span>
                <span className="ohlc-item"><span className="ohlc-label">L</span><span style={{ color: C.dn }}>${fmt(last.low)}</span></span>
                <span className="ohlc-item"><span className="ohlc-label">C</span><span style={{ color: isUp ? C.up : C.dn }}>${fmt(last.close)}</span></span>
                <span className="ohlc-item"><span className="ohlc-label">V</span><span className="muted">{fmtV(last.volume)}</span></span>
              </>
            )}
            {lo !== null && hi !== null && (
              <span className="ohlc-item muted">Range ${fmt(lo)} – ${fmt(hi)}</span>
            )}
          </div>
        </div>

        <div className="chart-controls">
          {/* EMA toggles */}
          <div className="ema-toggles">
            {EMA_PERIODS.map(p => (
              <button
                key={p}
                className={`ema-btn ${enabledEmas.has(p) ? 'ema-btn-on' : ''}`}
                style={enabledEmas.has(p) ? { borderColor: EMA_COLOR[p], color: EMA_COLOR[p] } : {}}
                onClick={() => toggleEmaFull(p)}
              >
                {p}
              </button>
            ))}
          </div>
          {/* Bollinger Bands toggle */}
          <button
            className={`ema-btn bb-toggle-btn ${bbEnabled ? 'ema-btn-on' : ''}`}
            style={bbEnabled ? { borderColor: C.bbBand, color: C.bbBand, borderRadius: 'var(--radius-sm)' } : { borderRadius: 'var(--radius-sm)' }}
            onClick={() => setBbEnabled(v => !v)}
          >
            BB(20)
          </button>
          {/* Indicator toggle */}
          <div className="chart-range-btns">
            {(['RSI', 'MACD'] as Indicator[]).map(ind => (
              <button
                key={ind}
                className={`range-btn ${indicator === ind ? 'range-btn-active' : ''}`}
                onClick={() => setIndicator(ind)}
              >
                {ind}
              </button>
            ))}
          </div>
          {/* Range toggle */}
          <div className="chart-range-btns">
            {(['1D', '7D', '30D'] as Range[]).map(r => (
              <button
                key={r}
                className={`range-btn ${range === r ? 'range-btn-active' : ''}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Overlay legend (EMA + BB) ── */}
      {([...enabledEmas].length > 0 || bbEnabled) && (
        <div className="ema-legend">
          {EMA_PERIODS.filter(p => enabledEmas.has(p)).map(p => (
            <span key={p} className="ema-legend-item">
              <span className="ema-legend-dot" style={{ background: EMA_COLOR[p] }} />
              <span style={{ color: EMA_COLOR[p] }}>EMA{p}</span>
              {emaVals[p] !== undefined && <span className="muted"> ${fmt(emaVals[p]!)}</span>}
            </span>
          ))}
          {bbEnabled && bbVals && (
            <span className="ema-legend-item">
              <span className="ema-legend-dot" style={{ background: C.bbBand }} />
              <span style={{ color: C.bbBand }}>BB(20,2)</span>
              <span style={{ color: C.bbBand }}> ↑${fmt(bbVals.upper)}</span>
              <span style={{ color: C.bbMid }}>  ~${fmt(bbVals.mid)}</span>
              <span style={{ color: C.bbBand }}>  ↓${fmt(bbVals.lower)}</span>
            </span>
          )}
        </div>
      )}

      {/* ── Main chart ── */}
      <div className="chart-wrap">
        <div ref={mainElRef} />
        {loading && <div className="chart-overlay">Loading…</div>}
        {error && !loading && <div className="chart-overlay chart-error">Data unavailable</div>}
      </div>

      {/* ── Indicator pane ── */}
      <div className="indicator-pane">
        <div className="indicator-pane-label">
          {indicator === 'RSI' && (
            <span>
              <span style={{ color: C.rsi }}>RSI(14)</span>
              {rsiVal !== null && <span style={{ color: rsiColor }}> {rsiVal.toFixed(1)}{rsiLabel}</span>}
            </span>
          )}
          {indicator === 'MACD' && (
            <span>
              <span style={{ color: C.macdL }}>MACD</span>
              <span className="muted"> (12,26,9)</span>
              {macdVals && (
                <>
                  <span style={{ color: C.macdL }}> M:{macdVals.m.toFixed(2)}</span>
                  <span style={{ color: C.macdS }}> S:{macdVals.s.toFixed(2)}</span>
                  <span style={{ color: macdVals.h >= 0 ? C.up : C.dn }}> H:{macdVals.h.toFixed(2)}</span>
                </>
              )}
            </span>
          )}
        </div>
        <div ref={indElRef} />
      </div>

      <p className="footnote">
        OKX BNB-USDT · 1D=30m · 7D=4H · 30D=1D · EMA calculated on close prices
      </p>
    </div>
  )
}
