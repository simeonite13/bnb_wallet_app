import { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Candle {
  open: number; high: number; low: number; close: number; volume: number
}

type Signal = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL'
const SIG_VAL: Record<Signal, number> = {
  STRONG_BUY: 2, BUY: 1, NEUTRAL: 0, SELL: -1, STRONG_SELL: -2,
}

interface Indicator { name: string; value: string; signal: Signal; hint: string }
type TF = '15m' | '1h' | '4h' | '1d'
const TF_LIMIT: Record<TF, number> = { '15m': 220, '1h': 220, '4h': 220, '1d': 220 }
const TF_OKX_BAR: Record<TF, string> = { '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D' }

// ── Math ───────────────────────────────────────────────────────────────────────

function sma(src: number[], n: number): number[] {
  const r: number[] = []
  for (let i = n - 1; i < src.length; i++)
    r.push(src.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n)
  return r
}

function ema(src: number[], n: number): number[] {
  const k = 2 / (n + 1), r = [src[0]]
  for (let i = 1; i < src.length; i++) r.push(src[i] * k + r[i - 1] * (1 - k))
  return r
}

function wilder(src: number[], n: number): number[] {
  const k = 1 / n, r = [src[0]]
  for (let i = 1; i < src.length; i++) r.push(src[i] * k + r[i - 1] * (1 - k))
  return r
}

function rsi(closes: number[], n = 14): number {
  if (closes.length < n + 2) return 50
  const gains: number[] = [], losses: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gains.push(Math.max(0, d)); losses.push(Math.max(0, -d))
  }
  const ag = wilder(gains, n), al = wilder(losses, n)
  const last = al[al.length - 1]
  return last === 0 ? 100 : 100 - 100 / (1 + ag[ag.length - 1] / last)
}

function macdHist(closes: number[]): number {
  if (closes.length < 35) return 0
  const e12 = ema(closes, 12), e26 = ema(closes, 26)
  const line = closes.map((_, i) => e12[i] - e26[i])
  const sig  = ema(line, 9)
  const hist = line.map((v, i) => v - sig[i])
  return hist[hist.length - 1]
}

function macdHistPrev(closes: number[]): number {
  if (closes.length < 36) return 0
  return macdHist(closes.slice(0, -1))
}

function stoch(candles: Candle[], n = 14, smooth = 3): { k: number; d: number } {
  const kArr: number[] = []
  for (let i = n - 1; i < candles.length; i++) {
    const sl = candles.slice(i - n + 1, i + 1)
    const lo = Math.min(...sl.map(c => c.low))
    const hi = Math.max(...sl.map(c => c.high))
    kArr.push(hi === lo ? 50 : (candles[i].close - lo) / (hi - lo) * 100)
  }
  const dArr = sma(kArr, smooth)
  return { k: kArr[kArr.length - 1] ?? 50, d: dArr[dArr.length - 1] ?? 50 }
}

function williamsR(candles: Candle[], n = 14): number {
  const sl = candles.slice(-n)
  const hi = Math.max(...sl.map(c => c.high))
  const lo = Math.min(...sl.map(c => c.low))
  return hi === lo ? -50 : (hi - candles[candles.length - 1].close) / (hi - lo) * -100
}

function cci(candles: Candle[], n = 20): number {
  if (candles.length < n) return 0
  const sl = candles.slice(-n)
  const tp = sl.map(c => (c.high + c.low + c.close) / 3)
  const mean = tp.reduce((s, v) => s + v, 0) / n
  const md   = tp.reduce((s, v) => s + Math.abs(v - mean), 0) / n
  return md === 0 ? 0 : (tp[tp.length - 1] - mean) / (0.015 * md)
}

function bbPct(closes: number[], n = 20): number {
  if (closes.length < n) return 0.5
  const sl   = closes.slice(-n)
  const mean = sl.reduce((s, v) => s + v, 0) / n
  const std  = Math.sqrt(sl.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  const up = mean + 2 * std, lo = mean - 2 * std
  return up === lo ? 0.5 : (closes[closes.length - 1] - lo) / (up - lo)
}

// ── Signal logic ───────────────────────────────────────────────────────────────

function computeIndicators(candles: Candle[]): Indicator[] {
  if (candles.length < 50) return []
  const closes  = candles.map(c => c.close)
  const vols    = candles.map(c => c.volume)
  const close   = closes[closes.length - 1]
  const prevClose = closes[closes.length - 2]

  // ── RSI ──
  const rsiVal = rsi(closes)
  const rsiSig: Signal = rsiVal < 30 ? 'STRONG_BUY' : rsiVal < 45 ? 'BUY'
    : rsiVal > 70 ? 'STRONG_SELL' : rsiVal > 55 ? 'SELL' : 'NEUTRAL'

  // ── MACD ──
  const h  = macdHist(closes)
  const hp = macdHistPrev(closes)
  const macdSig: Signal = h > 0 && h > hp ? 'BUY' : h < 0 && h < hp ? 'SELL'
    : h > 0 ? 'NEUTRAL' : 'NEUTRAL'

  // ── Stochastic ──
  const { k, d } = stoch(candles)
  const stochSig: Signal = k < 20 ? 'STRONG_BUY' : k < 40 ? 'BUY'
    : k > 80 ? 'STRONG_SELL' : k > 60 ? 'SELL' : 'NEUTRAL'

  // ── Williams %R ──
  const wr = williamsR(candles)
  const wrSig: Signal = wr < -80 ? 'STRONG_BUY' : wr < -60 ? 'BUY'
    : wr > -20 ? 'STRONG_SELL' : wr > -40 ? 'SELL' : 'NEUTRAL'

  // ── CCI ──
  const cciVal = cci(candles)
  const cciSig: Signal = cciVal < -200 ? 'STRONG_BUY' : cciVal < -100 ? 'BUY'
    : cciVal > 200 ? 'STRONG_SELL' : cciVal > 100 ? 'SELL' : 'NEUTRAL'

  // ── EMA 9 vs 21 ──
  const e9  = ema(closes, 9),  e9v  = e9[e9.length - 1],   e9p  = e9[e9.length - 2]
  const e21 = ema(closes, 21), e21v = e21[e21.length - 1],  e21p = e21[e21.length - 2]
  const emaCross: Signal = e9v > e21v && e9p <= e21p ? 'STRONG_BUY'
    : e9v < e21v && e9p >= e21p ? 'STRONG_SELL'
    : e9v > e21v ? 'BUY' : 'SELL'

  // ── EMA 50 vs Price ──
  const e50  = ema(closes, 50), e50v  = e50[e50.length - 1]
  const ema50Sig: Signal = close > e50v * 1.01 ? 'BUY' : close < e50v * 0.99 ? 'SELL' : 'NEUTRAL'

  // ── EMA 200 vs Price ──
  const e200 = ema(closes, 200), e200v = e200[e200.length - 1]
  const ema200Sig: Signal = close > e200v * 1.02 ? 'BUY' : close < e200v * 0.98 ? 'SELL' : 'NEUTRAL'

  // ── Bollinger Bands %B ──
  const bb = bbPct(closes)
  const bbSig: Signal = bb < 0.05 ? 'STRONG_BUY' : bb < 0.25 ? 'BUY'
    : bb > 0.95 ? 'STRONG_SELL' : bb > 0.75 ? 'SELL' : 'NEUTRAL'

  // ── Volume confirmation ──
  const volAvg  = vols.slice(-20).reduce((s, v) => s + v, 0) / 20
  const volLast = vols[vols.length - 1]
  const volRatio = volAvg > 0 ? volLast / volAvg : 1
  const priceUp  = close > prevClose
  const volSig: Signal = volRatio > 1.5 && priceUp ? 'BUY'
    : volRatio > 1.5 && !priceUp ? 'SELL'
    : volRatio > 2.5 && priceUp ? 'STRONG_BUY'
    : volRatio > 2.5 && !priceUp ? 'STRONG_SELL'
    : 'NEUTRAL'

  return [
    { name: 'RSI (14)',       value: rsiVal.toFixed(1),               signal: rsiSig,   hint: rsiVal < 30 ? 'Oversold' : rsiVal > 70 ? 'Overbought' : 'Midrange' },
    { name: 'MACD (12,26,9)', value: (h >= 0 ? '+' : '') + h.toFixed(3), signal: macdSig, hint: h > hp ? 'Histogram rising' : 'Histogram falling' },
    { name: 'Stoch %K (14)',  value: k.toFixed(1),                    signal: stochSig, hint: d > 0 ? `%D ${d.toFixed(1)}` : '' },
    { name: 'Williams %R',    value: wr.toFixed(1),                   signal: wrSig,    hint: wr < -80 ? 'Oversold zone' : wr > -20 ? 'Overbought zone' : '' },
    { name: 'CCI (20)',       value: cciVal.toFixed(0),               signal: cciSig,   hint: Math.abs(cciVal) > 100 ? 'Outside ±100 band' : 'Inside ±100 band' },
    { name: 'EMA 9 × 21',     value: e9v > e21v ? '9 above 21' : '9 below 21', signal: emaCross, hint: e9v > e21v && e9p <= e21p ? 'Golden cross ↑' : e9v < e21v && e9p >= e21p ? 'Death cross ↓' : '' },
    { name: 'EMA 50 vs Price',value: `${close > e50v ? 'Above' : 'Below'} $${e50v.toFixed(2)}`, signal: ema50Sig, hint: '' },
    { name: 'EMA 200 vs Price',value: `${close > e200v ? 'Above' : 'Below'} $${e200v.toFixed(2)}`, signal: ema200Sig, hint: close > e200v ? 'Bullish long-term' : 'Bearish long-term' },
    { name: 'BB %B (20)',     value: (bb * 100).toFixed(1) + '%',     signal: bbSig,    hint: bb < 0.1 ? 'Near lower band' : bb > 0.9 ? 'Near upper band' : `${(bb * 100).toFixed(0)}% within bands` },
    { name: 'Volume',         value: volRatio.toFixed(2) + 'x avg',   signal: volSig,   hint: priceUp ? 'Price rising' : 'Price falling' },
  ]
}

function scoreFromIndicators(inds: Indicator[]): number {
  if (!inds.length) return 0
  const sum = inds.reduce((s, i) => s + SIG_VAL[i.signal], 0)
  return sum / (inds.length * 2)   // → [-1, +1]
}

function overallLabel(score: number): { label: string; color: string } {
  if (score >= 0.6)  return { label: 'STRONG BUY',  color: '#22c55e' }
  if (score >= 0.2)  return { label: 'BUY',          color: '#84cc16' }
  if (score > -0.2)  return { label: 'NEUTRAL',       color: '#eab308' }
  if (score > -0.6)  return { label: 'SELL',          color: '#f97316' }
  return                    { label: 'STRONG SELL',  color: '#ef4444' }
}

// ── Gauge canvas ───────────────────────────────────────────────────────────────

function drawGauge(canvas: HTMLCanvasElement, score: number) {
  const H   = 160
  const dpr = window.devicePixelRatio || 1
  const W   = canvas.parentElement?.clientWidth ?? 320
  canvas.width  = W * dpr;  canvas.height = H * dpr
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#111318'; ctx.fillRect(0, 0, W, H)

  const cx  = W / 2
  const cy  = 138                          // arc center (near bottom)
  const R   = Math.min(W * 0.40, 118)      // radius scales with width
  const TW  = 14                           // track stroke width

  // Arc background track
  ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI, false)
  ctx.strokeStyle = '#1e2230'; ctx.lineWidth = TW; ctx.stroke()

  // Coloured segments
  const segs = [
    { from: 0.00, to: 0.20, color: '#ef4444' },
    { from: 0.20, to: 0.40, color: '#f97316' },
    { from: 0.40, to: 0.60, color: '#eab308' },
    { from: 0.60, to: 0.80, color: '#84cc16' },
    { from: 0.80, to: 1.00, color: '#22c55e' },
  ]
  for (const s of segs) {
    ctx.beginPath()
    ctx.arc(cx, cy, R, Math.PI + s.from * Math.PI, Math.PI + s.to * Math.PI, false)
    ctx.strokeStyle = s.color; ctx.lineWidth = TW; ctx.stroke()
  }

  // Needle
  const norm  = Math.max(0, Math.min(1, (score + 1) / 2))
  const angle = Math.PI + norm * Math.PI
  const NR    = R - TW / 2 - 3

  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(NR, 0)
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, 2 * Math.PI)
  ctx.fillStyle = '#e2e8f0'; ctx.fill()
  ctx.restore()

  // End labels
  ctx.font = 'bold 9px monospace'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ef4444'; ctx.textAlign = 'left'
  ctx.fillText('SELL', cx - R - TW / 2 - 36, cy + 4)
  ctx.fillStyle = '#22c55e'; ctx.textAlign = 'right'
  ctx.fillText('BUY', cx + R + TW / 2 + 36, cy + 4)

  // Tick marks at 20% intervals
  ctx.strokeStyle = '#0a0c10'; ctx.lineWidth = 1
  for (let i = 0; i <= 5; i++) {
    const a  = Math.PI + (i / 5) * Math.PI
    const x1 = cx + (R - TW / 2) * Math.cos(a)
    const y1 = cy + (R - TW / 2) * Math.sin(a)
    const x2 = cx + (R + TW / 2) * Math.cos(a)
    const y2 = cy + (R + TW / 2) * Math.sin(a)
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  // Centre score label
  const { label, color } = overallLabel(score)
  ctx.fillStyle = color; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, cx, cy - R * 0.42)
  ctx.fillStyle = '#5a6480'; ctx.font = '10px monospace'
  ctx.fillText((score >= 0 ? '+' : '') + score.toFixed(2) + ' / 1.00', cx, cy - R * 0.42 + 18)
}

// ── Signal badge helpers ───────────────────────────────────────────────────────

const SIG_STYLE: Record<Signal, { bg: string; text: string; label: string }> = {
  STRONG_BUY:  { bg: 'rgba(34,197,94,0.18)',   text: '#22c55e', label: 'STRONG BUY'  },
  BUY:         { bg: 'rgba(132,204,22,0.15)',   text: '#84cc16', label: 'BUY'         },
  NEUTRAL:     { bg: 'rgba(90,100,128,0.20)',   text: '#94a3b8', label: 'NEUTRAL'     },
  SELL:        { bg: 'rgba(249,115,22,0.15)',   text: '#f97316', label: 'SELL'        },
  STRONG_SELL: { bg: 'rgba(239,68,68,0.18)',    text: '#ef4444', label: 'STRONG SELL' },
}

function SignalBadge({ sig }: { sig: Signal }) {
  const s = SIG_STYLE[sig]
  return (
    <span
      style={{
        background: s.bg, color: s.text,
        fontSize: 10, fontWeight: 700, padding: '2px 7px',
        borderRadius: 4, fontFamily: 'var(--font-mono)',
        letterSpacing: '0.03em', whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export function TradingSignals() {
  const [tf,         setTf]         = useState<TF>('1h')
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [updatedAt,  setUpdatedAt]  = useState<number | null>(null)

  const gaugeRef  = useRef<HTMLCanvasElement>(null)
  const score     = scoreFromIndicators(indicators)
  const { label: overLabel, color: overColor } = overallLabel(score)

  const buys   = indicators.filter(i => i.signal === 'STRONG_BUY' || i.signal === 'BUY').length
  const sells  = indicators.filter(i => i.signal === 'STRONG_SELL' || i.signal === 'SELL').length
  const neuts  = indicators.filter(i => i.signal === 'NEUTRAL').length

  // ── Fetch & compute ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(
        `/api/okx/api/v5/market/candles?instId=BNB-USDT&bar=${TF_OKX_BAR[tf]}&limit=${TF_LIMIT[tf]}`,
        { signal: AbortSignal.timeout(10_000) }
      )
      if (!res.ok) throw new Error(`OKX ${res.status}`)
      const json = await res.json()
      if (json.code !== '0') throw new Error(`OKX ${json.code}: ${json.msg || 'no data'}`)
      // OKX returns newest first → reverse so indicators see chronological order
      const raw: string[][] = (json.data as string[][]).slice().reverse()
      const candles: Candle[] = raw.map(k => ({
        open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      }))
      setIndicators(computeIndicators(candles))
      setUpdatedAt(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tf])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 5 min
  useEffect(() => {
    const id = setInterval(load, 5 * 60_000)
    return () => clearInterval(id)
  }, [load])

  // ── Draw gauge ─────────────────────────────────────────────────────────────
  const drawG = useCallback(() => {
    if (gaugeRef.current && indicators.length > 0)
      drawGauge(gaugeRef.current, score)
  }, [score, indicators.length])

  useEffect(() => { drawG() }, [drawG])

  useEffect(() => {
    const el = gaugeRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(drawG)
    ro.observe(el); return () => ro.disconnect()
  }, [drawG])

  const ageStr = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('en-US', { hour12: false })
    : null

  return (
    <div className="card signals-card">
      {/* Header */}
      <div className="signals-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ marginBottom: 0 }}>Trading Signals</h2>
          <span className="muted" style={{ fontSize: 11 }}>BNBUSDT · Binance</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="chart-range-btns">
            {(['15m', '1h', '4h', '1d'] as TF[]).map(t => (
              <button
                key={t} disabled={loading}
                className={`range-btn ${tf === t ? 'range-btn-active' : ''}`}
                onClick={() => setTf(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <button className="btn-text" onClick={load} disabled={loading} style={{ fontSize: 11 }}>
            {loading ? '…' : '↻ Refresh'}
          </button>
          {ageStr && <span className="muted" style={{ fontSize: 10 }}>Updated {ageStr}</span>}
        </div>
      </div>

      {error && <div className="chart-overlay chart-error" style={{ position: 'relative', padding: '8px 12px', inset: 'unset' }}>{error}</div>}

      {!loading && indicators.length > 0 && (
        <>
          {/* ── Gauge + summary ── */}
          <div className="signals-top">
            <div className="gauge-wrap">
              <canvas ref={gaugeRef} style={{ width: '100%', display: 'block' }} />
            </div>

            <div className="signals-summary">
              <div className="signals-overall" style={{ color: overColor }}>{overLabel}</div>
              <div className="signals-tally">
                <div className="tally-row">
                  <span className="tally-dot" style={{ background: '#22c55e' }} />
                  <span>Buy / Strong Buy</span>
                  <span className="tally-count" style={{ color: '#22c55e' }}>{buys}</span>
                </div>
                <div className="tally-row">
                  <span className="tally-dot" style={{ background: '#94a3b8' }} />
                  <span>Neutral</span>
                  <span className="tally-count" style={{ color: '#94a3b8' }}>{neuts}</span>
                </div>
                <div className="tally-row">
                  <span className="tally-dot" style={{ background: '#ef4444' }} />
                  <span>Sell / Strong Sell</span>
                  <span className="tally-count" style={{ color: '#ef4444' }}>{sells}</span>
                </div>
              </div>
              <div className="signals-bar">
                {buys  > 0 && <div className="sig-bar-buy"  style={{ flex: buys  }} />}
                {neuts > 0 && <div className="sig-bar-neut" style={{ flex: neuts }} />}
                {sells > 0 && <div className="sig-bar-sell" style={{ flex: sells }} />}
              </div>
              <p className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                Based on {indicators.length} indicators · {tf} timeframe
              </p>
            </div>
          </div>

          {/* ── Indicator grid ── */}
          <div className="indicator-grid">
            {indicators.map(ind => (
              <div key={ind.name} className="indicator-card" data-signal={ind.signal}>
                <span className="ind-name">{ind.name}</span>
                <span className="ind-value">{ind.value}</span>
                <SignalBadge sig={ind.signal} />
                {ind.hint && <span className="ind-hint">{ind.hint}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {loading && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Computing {indicators.length > 0 ? 'updated' : ''} signals…
        </div>
      )}

      <p className="footnote">
        Not financial advice · signals are computed from technical analysis of historical price data only
      </p>
    </div>
  )
}
