import { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface WhaleAlert {
  id: string
  time: number
  price: number
  qty: number
  usd: number
  isSell: boolean
  tier: Tier
}

interface Tier { min: number; emoji: string; label: string; color: string }
interface Snapshot { bids: [number, number][]; asks: [number, number][] }
type WsStatus = 'connecting' | 'open' | 'closed' | 'error'

// ── Constants ──────────────────────────────────────────────────────────────────

const TIERS: Tier[] = [
  { min: 100_000, emoji: '🚀', label: 'Mega',  color: '#f0b90b' },
  { min:  50_000, emoji: '🐳', label: 'Whale', color: '#a78bfa' },
  { min:  10_000, emoji: '🦈', label: 'Shark', color: '#60a5fa' },
]
const MAX_ALERTS  = 60
const MAX_SNAPS   = 200
const DEPTH_LVL   = 20
const SAMPLE_MS   = 100
const WS_PROTO    = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_HOST     = typeof window !== 'undefined' ? window.location.host : ''
const WS_URL      = `${WS_PROTO}//${WS_HOST}/api/bybit-ws/v5/public/spot`
const TRADE_TOPIC = 'publicTrade.BNBUSDT'
const DEPTH_TOPIC = 'orderbook.50.BNBUSDT'
const PING_MS     = 20_000

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTier(usd: number): Tier | null {
  return TIERS.find(t => usd >= t.min) ?? null
}

function fmt(n: number, dec: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function timeStr(ms: number) {
  return new Date(ms).toLocaleTimeString('en-US', { hour12: false })
}

// ── Heatmap canvas ─────────────────────────────────────────────────────────────

function drawHeatmap(canvas: HTMLCanvasElement, history: Snapshot[]) {
  const H   = 260
  const dpr = window.devicePixelRatio || 1
  const pw  = canvas.parentElement?.clientWidth ?? 640
  canvas.width  = pw * dpr
  canvas.height = H  * dpr
  canvas.style.width  = pw + 'px'
  canvas.style.height = H  + 'px'
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  const YPAD = 20   // bottom for time labels
  const XPAD = 58   // left for price labels
  const cw   = pw - XPAD
  const ch   = H  - YPAD

  ctx.fillStyle = '#111318'
  ctx.fillRect(0, 0, pw, H)

  if (history.length < 3) {
    ctx.fillStyle = '#5a6480'; ctx.font = '12px monospace'; ctx.textAlign = 'center'
    ctx.fillText('Collecting order book snapshots…', pw / 2, H / 2)
    return
  }

  // Price range across all snapshots
  let minP = Infinity, maxP = -Infinity
  for (const s of history) {
    for (const [p] of s.bids) { if (p < minP) minP = p; if (p > maxP) maxP = p }
    for (const [p] of s.asks) { if (p < minP) minP = p; if (p > maxP) maxP = p }
  }
  if (minP >= maxP) maxP = minP + 1

  // Max qty for normalisation (sqrt-compressed for perceptual balance)
  let maxQ = 0
  for (const s of history) {
    for (const [, q] of s.bids) if (q > maxQ) maxQ = q
    for (const [, q] of s.asks) if (q > maxQ) maxQ = q
  }
  if (maxQ === 0) maxQ = 1

  const N          = history.length
  const colW       = cw / N
  const priceRange = maxP - minP
  const yOf = (p: number) => ch - ((p - minP) / priceRange) * ch

  // Draw grid
  ctx.strokeStyle = '#1e2230'; ctx.lineWidth = 0.5
  for (let i = 0; i <= 5; i++) {
    const p = minP + priceRange * (i / 5)
    const y = yOf(p)
    ctx.beginPath(); ctx.moveTo(XPAD, y); ctx.lineTo(pw, y); ctx.stroke()
    ctx.fillStyle = '#5a6480'; ctx.font = '9px monospace'; ctx.textAlign = 'right'
    ctx.fillText('$' + p.toFixed(1), XPAD - 3, y + 3)
  }

  // Draw columns — one per snapshot
  for (let c = 0; c < N; c++) {
    const snap = history[c]
    const x    = XPAD + c * colW
    const w    = Math.ceil(colW) + 1  // +1 to avoid sub-pixel gaps

    for (const [p, q] of snap.bids) {
      const y     = yOf(p)
      const rowH  = Math.max(1.5, ch / 60)
      const alpha = Math.pow(q / maxQ, 0.45)
      ctx.fillStyle = `rgba(34,197,94,${(alpha * 0.9).toFixed(3)})`
      ctx.fillRect(x, y - rowH / 2, w, rowH)
    }

    for (const [p, q] of snap.asks) {
      const y     = yOf(p)
      const rowH  = Math.max(1.5, ch / 60)
      const alpha = Math.pow(q / maxQ, 0.45)
      ctx.fillStyle = `rgba(239,68,68,${(alpha * 0.9).toFixed(3)})`
      ctx.fillRect(x, y - rowH / 2, w, rowH)
    }
  }

  // Mid-price dashed line
  const last = history[N - 1]
  if (last.bids[0] && last.asks[0]) {
    const mid = (last.bids[0][0] + last.asks[0][0]) / 2
    const my  = yOf(mid)
    ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(240,185,11,0.75)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(XPAD, my); ctx.lineTo(pw, my); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#f0b90b'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right'
    ctx.fillText('$' + mid.toFixed(2), XPAD - 2, my + 3)
  }

  // Time axis
  ctx.fillStyle = '#5a6480'; ctx.font = '9px monospace'; ctx.textAlign = 'left'
  const ageS = Math.round(N * 0.1)
  ctx.fillText('←' + ageS + 's ago', XPAD + 4, H - 5)
  ctx.textAlign = 'right'
  ctx.fillText('now→', pw - 2, H - 5)

  // Legend
  ctx.fillStyle = 'rgba(34,197,94,0.75)'; ctx.fillRect(XPAD + 4, 8, 9, 9)
  ctx.fillStyle = '#5a6480'; ctx.font = '9px monospace'; ctx.textAlign = 'left'
  ctx.fillText('Bids', XPAD + 16, 17)
  ctx.fillStyle = 'rgba(239,68,68,0.75)'; ctx.fillRect(XPAD + 44, 8, 9, 9)
  ctx.fillText('Asks', XPAD + 56, 17)
}

// ── Component ──────────────────────────────────────────────────────────────────

export function TradeAlerts() {
  const [tab,         setTab]         = useState<'whales' | 'heatmap'>('whales')
  const [alerts,      setAlerts]      = useState<WhaleAlert[]>([])
  const [tradeStatus, setTradeStatus] = useState<WsStatus>('connecting')
  const [heatStatus,  setHeatStatus]  = useState<WsStatus>('connecting')
  const [flashIds,    setFlashIds]    = useState<Set<string>>(new Set())

  const heatCanvas  = useRef<HTMLCanvasElement>(null)
  const historyRef  = useRef<Snapshot[]>([])
  const dirtyRef    = useRef(false)
  const rafRef      = useRef<number>(0)

  // ── Whale alerts: trades stream (Bybit publicTrade) ────────────────────────
  useEffect(() => {
    let ws: WebSocket
    let retryId: ReturnType<typeof setTimeout>
    let pingId: ReturnType<typeof setInterval> | null = null
    let alive = true

    function connect() {
      if (!alive) return
      setTradeStatus('connecting')
      ws = new WebSocket(WS_URL)

      ws.onopen  = () => {
        if (!alive) return
        setTradeStatus('open')
        ws.send(JSON.stringify({ op: 'subscribe', args: [TRADE_TOPIC] }))
        pingId = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }))
        }, PING_MS)
      }
      ws.onerror = () => { if (alive) setTradeStatus('error') }
      ws.onclose = () => {
        if (pingId) { clearInterval(pingId); pingId = null }
        if (!alive) return
        setTradeStatus('closed')
        retryId = setTimeout(connect, 3000)
      }

      ws.onmessage = (evt) => {
        if (!alive) return
        try {
          const msg = JSON.parse(evt.data as string)
          if (msg.topic !== TRADE_TOPIC || !Array.isArray(msg.data)) return
          for (const d of msg.data as { i: string; T: number; p: string; v: string; S: string }[]) {
            const price = parseFloat(d.p)
            const qty   = parseFloat(d.v)
            const usd   = price * qty
            const tier  = getTier(usd)
            if (!tier) continue
            const alert: WhaleAlert = {
              id: d.i, time: d.T, price, qty, usd, isSell: d.S === 'Sell', tier,
            }
            setAlerts(prev => [alert, ...prev].slice(0, MAX_ALERTS))
            setFlashIds(prev => new Set([...prev, alert.id]))
            setTimeout(() => setFlashIds(prev => { const s = new Set(prev); s.delete(alert.id); return s }), 600)
          }
        } catch { /* noop */ }
      }
    }

    connect()
    return () => { alive = false; if (pingId) clearInterval(pingId); ws?.close(); clearTimeout(retryId) }
  }, [])

  // ── Heatmap: depth stream (Bybit orderbook.50, snapshot + delta) ───────────
  useEffect(() => {
    let ws: WebSocket
    let retryId: ReturnType<typeof setTimeout>
    let pingId: ReturnType<typeof setInterval> | null = null
    let alive = true
    const bids = new Map<number, number>()
    const asks = new Map<number, number>()
    let lastSample = 0

    function applySide(side: Map<number, number>, entries: string[][]) {
      for (const [p, q] of entries) {
        const price = +p
        const qty   = +q
        if (qty === 0) side.delete(price)
        else           side.set(price, qty)
      }
    }

    function emitSnapshot() {
      const now = performance.now()
      if (now - lastSample < SAMPLE_MS) return
      lastSample = now
      const top = (m: Map<number, number>, desc: boolean): [number, number][] =>
        [...m.entries()]
          .sort((a, b) => desc ? b[0] - a[0] : a[0] - b[0])
          .slice(0, DEPTH_LVL)
      historyRef.current = [...historyRef.current, { bids: top(bids, true), asks: top(asks, false) }].slice(-MAX_SNAPS)
      dirtyRef.current = true
    }

    function connect() {
      if (!alive) return
      setHeatStatus('connecting')
      bids.clear(); asks.clear()
      ws = new WebSocket(WS_URL)

      ws.onopen  = () => {
        if (!alive) return
        setHeatStatus('open')
        ws.send(JSON.stringify({ op: 'subscribe', args: [DEPTH_TOPIC] }))
        pingId = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }))
        }, PING_MS)
      }
      ws.onerror = () => { if (alive) setHeatStatus('error') }
      ws.onclose = () => {
        if (pingId) { clearInterval(pingId); pingId = null }
        if (!alive) return
        setHeatStatus('closed')
        retryId = setTimeout(connect, 3000)
      }

      ws.onmessage = (evt) => {
        if (!alive) return
        try {
          const msg = JSON.parse(evt.data as string)
          if (msg.topic !== DEPTH_TOPIC || !msg.data) return
          if (msg.type === 'snapshot') { bids.clear(); asks.clear() }
          applySide(bids, msg.data.b ?? [])
          applySide(asks, msg.data.a ?? [])
          emitSnapshot()
        } catch { /* noop */ }
      }
    }

    connect()
    return () => { alive = false; if (pingId) clearInterval(pingId); ws?.close(); clearTimeout(retryId) }
  }, [])

  // ── Heatmap RAF render loop ────────────────────────────────────────────────
  const drawLoop = useCallback(() => {
    if (dirtyRef.current && heatCanvas.current && tab === 'heatmap') {
      drawHeatmap(heatCanvas.current, historyRef.current)
      dirtyRef.current = false
    }
    rafRef.current = requestAnimationFrame(drawLoop)
  }, [tab])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawLoop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [drawLoop])

  // ── Resize → redraw ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = heatCanvas.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => { dirtyRef.current = true })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const buyVol   = alerts.filter(a => !a.isSell).reduce((s, a) => s + a.usd, 0)
  const sellVol  = alerts.filter(a =>  a.isSell).reduce((s, a) => s + a.usd, 0)
  const totalVol = buyVol + sellVol || 1
  const buyPct   = (buyVol  / totalVol * 100).toFixed(1)
  const sellPct  = (sellVol / totalVol * 100).toFixed(1)
  const megaCnt  = alerts.filter(a => a.tier.min >= 100_000).length
  const whaleCnt = alerts.filter(a => a.tier.min >= 50_000 && a.tier.min < 100_000).length
  const sharkCnt = alerts.filter(a => a.tier.min >= 10_000 && a.tier.min < 50_000).length

  const wsStatus = tab === 'heatmap' ? heatStatus : tradeStatus
  const statusClass = wsStatus === 'open' ? 'ws-open' : wsStatus === 'connecting' ? 'ws-connecting' : 'ws-closed'
  const statusLabel = wsStatus === 'open' ? 'Live' : wsStatus === 'connecting' ? 'Connecting…' : 'Reconnecting…'

  return (
    <div className="card trade-alerts-card">
      {/* ── Header ── */}
      <div className="alerts-header">
        <div className="depth-tabs">
          <button className={`depth-tab ${tab === 'whales' ? 'depth-tab-active' : ''}`} onClick={() => setTab('whales')}>
            🐳 Whale Alerts
          </button>
          <button className={`depth-tab ${tab === 'heatmap' ? 'depth-tab-active' : ''}`} onClick={() => setTab('heatmap')}>
            Order Book Heatmap
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`ws-dot ${statusClass}`} />
          <span className="muted" style={{ fontSize: 11 }}>{statusLabel}</span>
        </div>
      </div>

      {/* ── Whale Alerts ── */}
      {tab === 'whales' && (
        <>
          <div className="alerts-summary">
            <div className="alerts-tier-counts">
              <span style={{ color: '#f0b90b' }}>🚀 Mega ×{megaCnt}</span>
              <span style={{ color: '#a78bfa' }}>🐳 Whale ×{whaleCnt}</span>
              <span style={{ color: '#60a5fa' }}>🦈 Shark ×{sharkCnt}</span>
            </div>
            {alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="pressure-bar">
                  <div className="pressure-buy"  style={{ width: buyPct  + '%' }} />
                  <div className="pressure-sell" style={{ width: sellPct + '%' }} />
                </div>
                <div className="pressure-labels">
                  <span style={{ color: 'var(--green)' }}>▲ Buy {buyPct}% · ${fmt(buyVol, 0)}</span>
                  <span style={{ color: 'var(--red)' }}>${fmt(sellVol, 0)} · {sellPct}% Sell ▼</span>
                </div>
              </div>
            )}
          </div>

          <div className="alerts-table-head">
            <span>Time</span>
            <span>Tier</span>
            <span>Side</span>
            <span style={{ textAlign: 'right' }}>Price</span>
            <span style={{ textAlign: 'right' }}>Qty BNB</span>
            <span style={{ textAlign: 'right' }}>Total USD</span>
          </div>

          <div className="alerts-scroll">
            {alerts.length === 0 && (
              <div className="trades-empty">Watching for large trades ≥ $10,000…</div>
            )}
            {alerts.map(a => (
              <div
                key={a.id}
                className={`alerts-row ${a.isSell ? 'trade-sell' : 'trade-buy'} ${flashIds.has(a.id) ? 'trade-flash' : ''}`}
              >
                <span className="trade-time">{timeStr(a.time)}</span>
                <span className="alert-tier" style={{ color: a.tier.color }}>
                  {a.tier.emoji} {a.tier.label}
                </span>
                <span className={`trade-side-badge ${a.isSell ? 'side-sell' : 'side-buy'}`}>
                  {a.isSell ? 'SELL' : 'BUY'}
                </span>
                <span className={`trade-price ${a.isSell ? 'trade-price-sell' : 'trade-price-buy'}`}>
                  {fmt(a.price, 2)}
                </span>
                <span className="trade-qty">{fmt(a.qty, 2)}</span>
                <span className="alert-usd" style={{ color: a.tier.color }}>
                  ${fmt(a.usd, 0)}
                </span>
              </div>
            ))}
          </div>

          <p className="footnote">
            Real-time · 🦈 ≥$10k · 🐳 ≥$50k · 🚀 ≥$100k · {alerts.length} captured
          </p>
        </>
      )}

      {/* ── Heatmap ── */}
      {tab === 'heatmap' && (
        <>
          <div className="depth-legend">
            <span><span className="depth-dot" style={{ background: 'rgba(34,197,94,0.85)' }} />Bid liquidity</span>
            <span><span className="depth-dot" style={{ background: 'rgba(239,68,68,0.85)' }} />Ask liquidity</span>
            <span className="muted">brighter = larger order · top {DEPTH_LVL} levels · 100ms snapshots</span>
          </div>
          <div className="canvas-wrap">
            <canvas ref={heatCanvas} style={{ width: '100%', display: 'block' }} />
            {heatStatus !== 'open' && historyRef.current.length === 0 && (
              <div className="chart-overlay">Connecting to order book stream…</div>
            )}
          </div>
          <p className="footnote">
            Y = price · X = time (newest right) · gold line = mid price · last {MAX_SNAPS} snapshots (~{Math.round(MAX_SNAPS * 0.1)}s)
          </p>
        </>
      )}
    </div>
  )
}
