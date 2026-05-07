import { useCallback, useEffect, useRef, useState } from 'react'
import { usePaperTrading, type PaperTrade } from '../hooks/usePaperTrading'
import { useLivePrice } from '../hooks/useLivePrice'

// ── Constants ──────────────────────────────────────────────────────────────────

const START_CASH  = 10_000
const HIST_KEY    = 'bnb_dash_pf_hist_v1'
const MAX_HIST    = 120        // 2 hours at 1 snap/min

const TOKEN_COLOR: Record<string, string> = {
  cash: '#22c55e',
  tBNB: '#f0b90b',
  WBNB: '#eab308',
  USDT: '#26a17b',
  BUSD: '#f0b90b',
  CAKE: '#d1884f',
}
const FALLBACK_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

// ── Helpers ────────────────────────────────────────────────────────────────────

function tokenColor(sym: string, idx: number) {
  return TOKEN_COLOR[sym] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function loadHist(): { t: number; v: number }[] {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) ?? '[]') } catch { return [] }
}
function saveHist(h: { t: number; v: number }[]) {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-MAX_HIST))) } catch { /* noop */ }
}

// Average cost basis using a running weighted-average approach
function avgCost(trades: PaperTrade[], symbol: string): number {
  const sorted = [...trades]
    .filter(t => t.symbol === symbol)
    .sort((a, b) => a.timestamp - b.timestamp)
  let qty = 0, cost = 0
  for (const t of sorted) {
    if (t.side === 'buy') {
      cost += t.total; qty += t.amount
    } else {
      if (qty > 0) cost *= Math.max(0, (qty - t.amount) / qty)
      qty = Math.max(0, qty - t.amount)
    }
  }
  return qty > 0 ? cost / qty : 0
}

// ── Donut canvas ───────────────────────────────────────────────────────────────

function drawDonut(
  canvas: HTMLCanvasElement,
  slices: { label: string; value: number; color: string }[],
  total: number,
) {
  const SIZE = 180
  const dpr  = window.devicePixelRatio || 1
  canvas.width  = SIZE * dpr; canvas.height = SIZE * dpr
  canvas.style.width = SIZE + 'px'; canvas.style.height = SIZE + 'px'
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, SIZE, SIZE)

  const cx = SIZE / 2, cy = SIZE / 2
  const R  = SIZE * 0.42, r = SIZE * 0.24
  let angle = -Math.PI / 2

  for (const s of slices) {
    if (s.value <= 0) continue
    const sweep = (s.value / total) * 2 * Math.PI
    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, R, angle, angle + sweep)
    ctx.closePath(); ctx.fillStyle = s.color; ctx.fill()
    // thin separator
    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, R, angle, angle + sweep)
    ctx.closePath(); ctx.strokeStyle = '#111318'; ctx.lineWidth = 1.5; ctx.stroke()
    angle += sweep
  }

  // Hole
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI)
  ctx.fillStyle = '#111318'; ctx.fill()

  // Center label
  const label = total >= 10000
    ? '$' + (total / 1000).toFixed(1) + 'k'
    : '$' + fmt(total, 0)
  ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = 'bold 13px monospace'
  ctx.fillText(label, cx, cy)
}

// ── History line chart ─────────────────────────────────────────────────────────

function drawHistory(
  canvas: HTMLCanvasElement,
  history: { t: number; v: number }[],
) {
  const H   = 180
  const dpr = window.devicePixelRatio || 1
  const pw  = canvas.parentElement?.clientWidth ?? 400
  canvas.width  = pw * dpr; canvas.height = H * dpr
  canvas.style.width = pw + 'px'; canvas.style.height = H + 'px'
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#111318'; ctx.fillRect(0, 0, pw, H)

  if (history.length < 2) {
    ctx.fillStyle = '#5a6480'; ctx.font = '12px monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('Building history… (snapshots every 60 s)', pw / 2, H / 2)
    return
  }

  const PAD = { t: 16, b: 24, l: 62, r: 10 }
  const cw  = pw - PAD.l - PAD.r
  const ch  = H  - PAD.t - PAD.b
  const vals   = history.map(h => h.v)
  const minV   = Math.min(...vals, START_CASH) * 0.998
  const maxV   = Math.max(...vals, START_CASH) * 1.002
  const range  = maxV - minV || 1
  const xOf    = (i: number) => PAD.l + (i / (history.length - 1)) * cw
  const yOf    = (v: number) => PAD.t + ch - ((v - minV) / range) * ch

  // Grid
  ctx.strokeStyle = '#1e2230'; ctx.lineWidth = 0.5
  for (let i = 0; i <= 4; i++) {
    const v = minV + range * (i / 4), y = yOf(v)
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(pw - PAD.r, y); ctx.stroke()
    ctx.fillStyle = '#5a6480'; ctx.font = '9px monospace'; ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText('$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : fmt(v, 0)), PAD.l - 3, y)
  }

  // Start-capital reference
  const refY = yOf(START_CASH)
  ctx.setLineDash([5, 4]); ctx.strokeStyle = '#5a6480'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD.l, refY); ctx.lineTo(pw - PAD.r, refY); ctx.stroke()
  ctx.setLineDash([])

  const isUp    = history[history.length - 1].v >= START_CASH
  const lineClr = isUp ? '#22c55e' : '#ef4444'
  const fillClr = isUp ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)'

  // Fill
  ctx.beginPath()
  ctx.moveTo(xOf(0), yOf(history[0].v))
  for (let i = 1; i < history.length; i++) ctx.lineTo(xOf(i), yOf(history[i].v))
  ctx.lineTo(xOf(history.length - 1), PAD.t + ch)
  ctx.lineTo(xOf(0), PAD.t + ch)
  ctx.closePath(); ctx.fillStyle = fillClr; ctx.fill()

  // Line
  ctx.beginPath()
  ctx.moveTo(xOf(0), yOf(history[0].v))
  for (let i = 1; i < history.length; i++) ctx.lineTo(xOf(i), yOf(history[i].v))
  ctx.strokeStyle = lineClr; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke()

  // Time labels
  ctx.fillStyle = '#5a6480'; ctx.font = '9px monospace'; ctx.textBaseline = 'alphabetic'
  const toHM = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
  ctx.textAlign = 'left';  ctx.fillText(toHM(history[0].t),                 PAD.l,        H - 6)
  ctx.textAlign = 'right'; ctx.fillText(toHM(history[history.length - 1].t), pw - PAD.r, H - 6)
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PortfolioTracker() {
  const { portfolio, totalValue, reset } = usePaperTrading()
  const { usd: bnbPrice } = useLivePrice()
  const [cakePrice,    setCakePrice]    = useState(0)
  const [history,      setHistory]      = useState<{ t: number; v: number }[]>(loadHist)
  const [confirmReset, setConfirmReset] = useState(false)

  const donutCanvas = useRef<HTMLCanvasElement>(null)
  const histCanvas  = useRef<HTMLCanvasElement>(null)
  const valueRef    = useRef(0)

  // Fetch CAKE price once
  useEffect(() => {
    fetch('/api/kucoin/api/v1/market/orderbook/level1?symbol=CAKE-USDT', { signal: AbortSignal.timeout(6000) })
      .then(r => r.json())
      .then(d => setCakePrice(parseFloat(d?.data?.price ?? '0')))
      .catch(() => { /* use 0 */ })
  }, [])

  // Price lookup per symbol
  function priceOf(sym: string): number {
    if (sym === 'tBNB' || sym === 'WBNB') return bnbPrice ?? 0
    if (sym === 'USDT' || sym === 'BUSD') return 1
    if (sym === 'CAKE') return cakePrice
    return 0
  }

  // Build slices for donut
  const holdingEntries = Object.entries(portfolio.holdings).filter(([, q]) => q > 0)
  const totalVal = totalValue(bnbPrice)
  valueRef.current = totalVal

  const slices = [
    { label: 'Cash', value: portfolio.cash, color: tokenColor('cash', 0) },
    ...holdingEntries.map(([sym, qty], i) => ({
      label: sym,
      value: qty * priceOf(sym),
      color: tokenColor(sym, i + 1),
    })),
  ].filter(s => s.value > 0)

  const totalPnl    = totalVal - START_CASH
  const totalPnlPct = (totalPnl / START_CASH) * 100

  // Snapshot every 60 s
  useEffect(() => {
    const id = setInterval(() => {
      const v = valueRef.current
      if (v === 0) return
      setHistory(prev => {
        const next = [...prev, { t: Date.now(), v }].slice(-MAX_HIST)
        saveHist(next); return next
      })
    }, 60_000)
    // Initial snapshot if history empty or last snap > 2 min old
    const last = loadHist()
    if (last.length === 0 || Date.now() - last[last.length - 1].t > 120_000) {
      setTimeout(() => {
        const v = valueRef.current
        if (v > 0) setHistory(prev => {
          const next = [...prev, { t: Date.now(), v }].slice(-MAX_HIST)
          saveHist(next); return next
        })
      }, 2000)
    }
    return () => clearInterval(id)
  }, [])

  // Draw donut
  const drawD = useCallback(() => {
    if (donutCanvas.current && slices.length > 0)
      drawDonut(donutCanvas.current, slices, totalVal)
  }, [slices, totalVal])

  useEffect(() => { drawD() }, [drawD])

  // Draw history
  const drawH = useCallback(() => {
    if (histCanvas.current) drawHistory(histCanvas.current, history)
  }, [history])

  useEffect(() => { drawH() }, [drawH])

  // Resize → redraw both
  useEffect(() => {
    const els = [donutCanvas.current?.parentElement, histCanvas.current?.parentElement].filter(Boolean)
    const ro = new ResizeObserver(() => { drawD(); drawH() })
    els.forEach(el => el && ro.observe(el))
    return () => ro.disconnect()
  }, [drawD, drawH])

  const handleReset = () => {
    reset()
    setHistory([])
    saveHist([])
    setConfirmReset(false)
  }

  return (
    <div className="card portfolio-card">
      {/* ── Header ── */}
      <div className="portfolio-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ marginBottom: 0 }}>Paper Portfolio</h2>
          <span className="badge badge-paper">Paper</span>
        </div>
        {!confirmReset
          ? <button className="btn-text danger-text" onClick={() => setConfirmReset(true)}>Reset</button>
          : <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12 }}>Reset to $10,000?</span>
              <button className="btn-text danger-text" onClick={handleReset}>Yes</button>
              <button className="btn-text" onClick={() => setConfirmReset(false)}>No</button>
            </div>
        }
      </div>

      {/* ── Stats row ── */}
      <div className="portfolio-stats">
        <div className="pf-stat">
          <span className="pf-stat-label">Total Value</span>
          <span className="pf-stat-val">${fmt(totalVal, 2)}</span>
        </div>
        <div className="pf-stat">
          <span className="pf-stat-label">Total P&amp;L</span>
          <span className="pf-stat-val" style={{ color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totalPnl >= 0 ? '+' : ''}${fmt(Math.abs(totalPnl), 2)}
            <span style={{ fontSize: 12, marginLeft: 6 }}>
              ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)
            </span>
          </span>
        </div>
        <div className="pf-stat">
          <span className="pf-stat-label">Cash</span>
          <span className="pf-stat-val">${fmt(portfolio.cash, 2)}</span>
        </div>
        <div className="pf-stat">
          <span className="pf-stat-label">Positions</span>
          <span className="pf-stat-val">{holdingEntries.length}</span>
        </div>
        <div className="pf-stat">
          <span className="pf-stat-label">Trades</span>
          <span className="pf-stat-val">{portfolio.trades.length}</span>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="portfolio-charts">
        {/* Donut + legend */}
        <div className="pf-donut-wrap">
          <canvas ref={donutCanvas} />
          <div className="pf-donut-legend">
            {slices.map(s => (
              <div key={s.label} className="pf-legend-row">
                <span className="pf-legend-dot" style={{ background: s.color }} />
                <span className="pf-legend-label">{s.label}</span>
                <span className="pf-legend-pct muted">
                  {totalVal > 0 ? ((s.value / totalVal) * 100).toFixed(1) : '0'}%
                </span>
                <span className="pf-legend-val">${fmt(s.value, 0)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* History chart */}
        <div className="pf-history-wrap">
          <span className="pf-section-label">Portfolio Value History</span>
          <div className="canvas-wrap">
            <canvas ref={histCanvas} style={{ width: '100%', display: 'block' }} />
          </div>
          <p className="footnote" style={{ marginTop: 4 }}>
            Snapshots every 60 s · dashed line = $10,000 start · {history.length} points
          </p>
        </div>
      </div>

      {/* ── Holdings table ── */}
      {holdingEntries.length > 0 && (
        <div className="pf-holdings">
          <div className="pf-holdings-head">
            <span>Token</span>
            <span style={{ textAlign: 'right' }}>Qty</span>
            <span style={{ textAlign: 'right' }}>Price</span>
            <span style={{ textAlign: 'right' }}>Value</span>
            <span style={{ textAlign: 'right' }}>Alloc</span>
            <span style={{ textAlign: 'right' }}>Avg Cost</span>
            <span style={{ textAlign: 'right' }}>Unreal P&amp;L</span>
          </div>
          {holdingEntries.map(([sym, qty], i) => {
            const price  = priceOf(sym)
            const value  = qty * price
            const cost   = avgCost(portfolio.trades, sym)
            const pnl    = cost > 0 ? (price - cost) * qty : 0
            const pnlPct = cost > 0 ? ((price - cost) / cost) * 100 : 0
            const alloc  = totalVal > 0 ? (value / totalVal) * 100 : 0
            return (
              <div key={sym} className="pf-holdings-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="pf-token-dot" style={{ background: tokenColor(sym, i) }} />
                  <span style={{ fontWeight: 700 }}>{sym}</span>
                </div>
                <span style={{ textAlign: 'right' }} className="mono">{qty.toFixed(4)}</span>
                <span style={{ textAlign: 'right' }} className="mono">${fmt(price, 2)}</span>
                <span style={{ textAlign: 'right' }} className="mono">${fmt(value, 2)}</span>
                <span style={{ textAlign: 'right' }} className="muted">{alloc.toFixed(1)}%</span>
                <span style={{ textAlign: 'right' }} className="mono muted">
                  {cost > 0 ? '$' + fmt(cost, 2) : '—'}
                </span>
                <span
                  style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                  className={pnl >= 0 ? 'tx-ok' : 'tx-fail'}
                >
                  {cost > 0
                    ? `${pnl >= 0 ? '+' : ''}$${fmt(Math.abs(pnl), 2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`
                    : '—'}
                </span>
              </div>
            )
          })}

          {/* Cash row */}
          <div className="pf-holdings-row pf-cash-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="pf-token-dot" style={{ background: tokenColor('cash', 99) }} />
              <span style={{ fontWeight: 700 }}>Cash</span>
            </div>
            <span style={{ textAlign: 'right' }} className="mono">{fmt(portfolio.cash, 2)}</span>
            <span style={{ textAlign: 'right' }} className="muted">$1.00</span>
            <span style={{ textAlign: 'right' }} className="mono">${fmt(portfolio.cash, 2)}</span>
            <span style={{ textAlign: 'right' }} className="muted">
              {totalVal > 0 ? ((portfolio.cash / totalVal) * 100).toFixed(1) : '0'}%
            </span>
            <span style={{ textAlign: 'right' }} className="muted">—</span>
            <span style={{ textAlign: 'right' }} className="muted">—</span>
          </div>
        </div>
      )}

      {holdingEntries.length === 0 && (
        <p className="muted" style={{ fontSize: 13, paddingTop: 4 }}>
          No open positions — use Paper mode in the Trading Panel to place trades.
        </p>
      )}
    </div>
  )
}
