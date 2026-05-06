import { useEffect, useRef, useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrderBook {
  bids: [number, number][]   // [price, qty] sorted desc
  asks: [number, number][]   // [price, qty] sorted asc
  fetchedAt: number
}

interface Kline {
  low: number; high: number; close: number; volume: number
}

type Tab = 'depth' | 'profile'

// ── Theme ──────────────────────────────────────────────────────────────────────

const T = {
  bg:      '#111318',
  surface: '#161920',
  border:  '#1e2230',
  text:    '#e2e8f0',
  muted:   '#5a6480',
  up:      '#22c55e',
  dn:      '#ef4444',
  upFill:  'rgba(34,197,94,0.15)',
  dnFill:  'rgba(239,68,68,0.15)',
  accent:  '#f0b90b',
  poc:     '#f0b90b',    // Point of Control
  va:      'rgba(240,185,11,0.08)',  // Value Area fill
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function fetchDepth(limit = 100): Promise<OrderBook> {
  const r = await fetch(
    `https://api.binance.com/api/v3/depth?symbol=BNBUSDT&limit=${limit}`,
    { signal: AbortSignal.timeout(8000) }
  )
  if (!r.ok) throw new Error(`Binance ${r.status}`)
  const d = await r.json()
  return {
    bids: (d.bids as string[][]).map(([p, q]) => [+p, +q] as [number, number]).sort((a, b) => b[0] - a[0]),
    asks: (d.asks as string[][]).map(([p, q]) => [+p, +q] as [number, number]).sort((a, b) => a[0] - b[0]),
    fetchedAt: Date.now(),
  }
}

async function fetchKlines(days: number): Promise<Kline[]> {
  const cfg: Record<number, { interval: string; limit: number }> = {
    1: { interval: '30m', limit: 48 },
    7: { interval: '4h',  limit: 42 },
    30:{ interval: '1d',  limit: 30 },
  }
  const { interval, limit } = cfg[days]
  const r = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=BNBUSDT&interval=${interval}&limit=${limit}`,
    { signal: AbortSignal.timeout(8000) }
  )
  if (!r.ok) throw new Error(`Binance ${r.status}`)
  const raw: string[][] = await r.json()
  return raw.map(k => ({ low: +k[3], high: +k[2], close: +k[4], volume: +k[5] }))
}

// ── Volume Profile math ────────────────────────────────────────────────────────

interface VPBucket {
  priceFrom: number; priceTo: number; priceMid: number; vol: number
}

function buildVolumeProfile(klines: Kline[], buckets = 28): VPBucket[] {
  const lo   = Math.min(...klines.map(k => k.low))
  const hi   = Math.max(...klines.map(k => k.high))
  const step = (hi - lo) / buckets

  const vols = new Array(buckets).fill(0)
  for (const k of klines) {
    const range = k.high - k.low || 0.001
    for (let i = 0; i < buckets; i++) {
      const bLo = lo + i * step, bHi = lo + (i + 1) * step
      const overlap = Math.max(0, Math.min(k.high, bHi) - Math.max(k.low, bLo))
      vols[i] += k.volume * (overlap / range)
    }
  }

  return Array.from({ length: buckets }, (_, i) => ({
    priceFrom: lo + i * step,
    priceTo:   lo + (i + 1) * step,
    priceMid:  lo + (i + 0.5) * step,
    vol:       vols[i],
  }))
}

function valueArea(profile: VPBucket[], targetPct = 0.7) {
  const poc     = profile.reduce((best, b) => b.vol > best.vol ? b : best)
  const total   = profile.reduce((s, b) => s + b.vol, 0)
  const target  = total * targetPct
  let   sum     = poc.vol
  let   lo      = profile.indexOf(poc)
  let   hi      = lo

  while (sum < target && (lo > 0 || hi < profile.length - 1)) {
    const addLo = lo > 0              ? profile[lo - 1].vol : -Infinity
    const addHi = hi < profile.length - 1 ? profile[hi + 1].vol : -Infinity
    if (addLo >= addHi) { sum += profile[--lo].vol }
    else                { sum += profile[++hi].vol }
  }

  return { poc, val: profile[lo], vah: profile[hi] }
}

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function setupCanvas(canvas: HTMLCanvasElement, h: number) {
  const dpr  = window.devicePixelRatio || 1
  const w    = canvas.parentElement?.clientWidth ?? 600
  canvas.width  = w * dpr
  canvas.height = h * dpr
  canvas.style.width  = w + 'px'
  canvas.style.height = h + 'px'
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  return { ctx, w, h }
}

// ── Depth chart drawing ────────────────────────────────────────────────────────

function drawDepth(canvas: HTMLCanvasElement, book: OrderBook) {
  const H = 220
  const { ctx, w } = setupCanvas(canvas, H)
  const PAD = { t: 10, r: 60, b: 30, l: 10 }
  const cw = w - PAD.l - PAD.r
  const ch = H - PAD.t - PAD.b

  ctx.fillStyle = T.bg
  ctx.fillRect(0, 0, w, H)

  const bestBid = book.bids[0][0]
  const bestAsk = book.asks[0][0]
  const mid     = (bestBid + bestAsk) / 2
  const spread  = bestAsk - bestBid
  const wing    = mid * 0.025   // ±2.5% around mid

  const minP = mid - wing, maxP = mid + wing
  const xOf  = (p: number) => PAD.l + ((p - minP) / (maxP - minP)) * cw

  // Cumulative sums
  const cumBids: [number, number][] = []
  let s = 0
  for (const [p, q] of book.bids) { if (p < minP) break; s += q; cumBids.push([p, s]) }

  const cumAsks: [number, number][] = []
  s = 0
  for (const [p, q] of book.asks) { if (p > maxP) break; s += q; cumAsks.push([p, s]) }

  const maxVol = Math.max(
    cumBids.length ? cumBids[cumBids.length - 1][1] : 0,
    cumAsks.length ? cumAsks[cumAsks.length - 1][1] : 0,
  ) || 1
  const yOf = (v: number) => PAD.t + ch - (v / maxVol) * ch

  // Grid lines (horizontal)
  ctx.strokeStyle = T.border; ctx.lineWidth = 0.5
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + (ch / 4) * i
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke()
    const label = ((1 - i / 4) * maxVol).toFixed(0)
    ctx.fillStyle = T.muted; ctx.font = '10px monospace'; ctx.textAlign = 'right'
    ctx.fillText(label, w - 4, y + 3)
  }

  // Bid area (green, step from bestBid leftward)
  if (cumBids.length > 1) {
    ctx.beginPath()
    ctx.moveTo(xOf(bestBid), PAD.t + ch)
    for (const [p, v] of cumBids) ctx.lineTo(xOf(p), yOf(v))
    ctx.lineTo(xOf(cumBids[cumBids.length - 1][0]), PAD.t + ch)
    ctx.closePath()
    ctx.fillStyle = T.upFill; ctx.fill()
    ctx.beginPath()
    ctx.moveTo(xOf(bestBid), PAD.t + ch)
    for (const [p, v] of cumBids) ctx.lineTo(xOf(p), yOf(v))
    ctx.strokeStyle = T.up; ctx.lineWidth = 1.5; ctx.stroke()
  }

  // Ask area (red, step from bestAsk rightward)
  if (cumAsks.length > 1) {
    ctx.beginPath()
    ctx.moveTo(xOf(bestAsk), PAD.t + ch)
    for (const [p, v] of cumAsks) ctx.lineTo(xOf(p), yOf(v))
    ctx.lineTo(xOf(cumAsks[cumAsks.length - 1][0]), PAD.t + ch)
    ctx.closePath()
    ctx.fillStyle = T.dnFill; ctx.fill()
    ctx.beginPath()
    ctx.moveTo(xOf(bestAsk), PAD.t + ch)
    for (const [p, v] of cumAsks) ctx.lineTo(xOf(p), yOf(v))
    ctx.strokeStyle = T.dn; ctx.lineWidth = 1.5; ctx.stroke()
  }

  // Mid / spread dashed line
  const mx = xOf(mid)
  ctx.setLineDash([4, 4]); ctx.strokeStyle = T.accent + '88'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(mx, PAD.t); ctx.lineTo(mx, PAD.t + ch); ctx.stroke()
  ctx.setLineDash([])

  // Price labels (bottom)
  ctx.fillStyle = T.muted; ctx.font = '10px monospace'; ctx.textAlign = 'center'
  const priceTicks = [minP, minP + wing * 0.5, mid, mid + wing * 0.5, maxP]
  for (const p of priceTicks) {
    ctx.fillText('$' + p.toFixed(1), xOf(p), H - 6)
  }

  // Mid label
  ctx.fillStyle = T.accent; ctx.font = 'bold 10px monospace'
  ctx.fillText('mid $' + mid.toFixed(2), mx, PAD.t + 14)

  // Spread info box (top-right)
  ctx.fillStyle = T.surface
  ctx.fillRect(w - PAD.r - 130, PAD.t, 128, 46)
  ctx.strokeStyle = T.border; ctx.lineWidth = 0.5
  ctx.strokeRect(w - PAD.r - 130, PAD.t, 128, 46)
  ctx.fillStyle = T.text; ctx.font = '10px monospace'; ctx.textAlign = 'left'
  ctx.fillText(`Bid  $${bestBid.toFixed(3)}`, w - PAD.r - 126, PAD.t + 14)
  ctx.fillText(`Ask  $${bestAsk.toFixed(3)}`, w - PAD.r - 126, PAD.t + 28)
  ctx.fillStyle = spread / mid < 0.001 ? T.up : T.muted
  ctx.fillText(`Sprd ${(spread / mid * 100).toFixed(4)}%`, w - PAD.r - 126, PAD.t + 42)
}

// ── Volume Profile drawing ─────────────────────────────────────────────────────

function drawVolumeProfile(canvas: HTMLCanvasElement, profile: VPBucket[], currentPrice: number) {
  const H = 220
  const { ctx, w } = setupCanvas(canvas, H)
  const PAD = { t: 10, r: 10, b: 30, l: 70 }
  const cw = w - PAD.l - PAD.r
  const ch = H - PAD.t - PAD.b

  ctx.fillStyle = T.bg
  ctx.fillRect(0, 0, w, H)

  if (!profile.length) return

  const { poc, val, vah } = valueArea(profile)
  const maxVol = Math.max(...profile.map(p => p.vol)) || 1
  const minP   = profile[0].priceFrom
  const maxP   = profile[profile.length - 1].priceTo
  const yOf    = (price: number) => PAD.t + ch - ((price - minP) / (maxP - minP)) * ch
  const barH   = ch / profile.length

  // Value area background
  const vahY = yOf(vah.priceTo), valY = yOf(val.priceFrom)
  ctx.fillStyle = T.va
  ctx.fillRect(PAD.l, vahY, cw, valY - vahY)

  // Bars
  for (const bucket of profile) {
    const y   = yOf(bucket.priceTo)
    const bw  = (bucket.vol / maxVol) * cw
    const isPOC = bucket === poc
    const isVA  = bucket.priceFrom >= val.priceFrom && bucket.priceTo <= vah.priceTo

    ctx.fillStyle = isPOC
      ? T.poc
      : isVA
        ? 'rgba(240,185,11,0.35)'
        : 'rgba(96,165,250,0.35)'
    ctx.fillRect(PAD.l, y, bw, barH - 1)

    if (isPOC) {
      ctx.strokeStyle = T.poc; ctx.lineWidth = 1
      ctx.strokeRect(PAD.l, y, bw, barH - 1)
    }
  }

  // Current price line
  if (currentPrice >= minP && currentPrice <= maxP) {
    const cy = yOf(currentPrice)
    ctx.setLineDash([4, 3]); ctx.strokeStyle = T.text + '99'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD.l, cy); ctx.lineTo(w - PAD.r, cy); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = T.text; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right'
    ctx.fillText('$' + currentPrice.toFixed(2), PAD.l - 2, cy + 4)
  }

  // Price axis (left)
  ctx.fillStyle = T.muted; ctx.font = '10px monospace'; ctx.textAlign = 'right'
  const tickCount = 6
  for (let i = 0; i <= tickCount; i++) {
    const price = minP + (maxP - minP) * (i / tickCount)
    const y     = yOf(price)
    ctx.fillText('$' + price.toFixed(0), PAD.l - 4, y + 3)
    ctx.strokeStyle = T.border; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke()
  }

  // POC label
  const pocY = yOf(poc.priceMid)
  ctx.fillStyle = T.poc; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
  ctx.fillText('POC $' + poc.priceMid.toFixed(2), PAD.l + 4, pocY - 3)

  // VAH / VAL labels
  ctx.fillStyle = T.accent + 'bb'; ctx.font = '9px monospace'
  ctx.fillText('VAH', PAD.l + 4, yOf(vah.priceTo) + 10)
  ctx.fillText('VAL', PAD.l + 4, yOf(val.priceFrom) - 3)
}

// ── Component ──────────────────────────────────────────────────────────────────

type VPRange = '1D' | '7D' | '30D'
const VP_DAYS: Record<VPRange, number> = { '1D': 1, '7D': 7, '30D': 30 }

export function MarketDepth() {
  const [tab, setTab]           = useState<Tab>('depth')
  const depthCanvas             = useRef<HTMLCanvasElement>(null)
  const profileCanvas           = useRef<HTMLCanvasElement>(null)

  // Depth state
  const [book,         setBook]         = useState<OrderBook | null>(null)
  const [depthLoading, setDepthLoading] = useState(true)
  const [depthError,   setDepthError]   = useState<string | null>(null)
  const [countdown,    setCountdown]    = useState(5)

  // Volume profile state
  const [vpRange,     setVpRange]     = useState<VPRange>('1D')
  const [profile,     setProfile]     = useState<VPBucket[]>([])
  const [lastPrice,   setLastPrice]   = useState(0)
  const [vpLoading,   setVpLoading]   = useState(false)
  const [vpError,     setVpError]     = useState<string | null>(null)

  // ── Depth: auto-refresh every 5 s ─────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'depth') return
    let cancelled = false

    async function load() {
      setDepthLoading(prev => book === null ? true : prev)
      setDepthError(null)
      try {
        const data = await fetchDepth(100)
        if (!cancelled) { setBook(data); setCountdown(5) }
      } catch (e) {
        if (!cancelled) setDepthError((e as Error).message)
      } finally {
        if (!cancelled) setDepthLoading(false)
      }
    }

    load()
    const fetchId = setInterval(load, 5000)
    const tickId  = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)

    return () => { cancelled = true; clearInterval(fetchId); clearInterval(tickId) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ── Depth: draw on canvas when data arrives ───────────────────────────────
  useEffect(() => {
    if (book && depthCanvas.current) drawDepth(depthCanvas.current, book)
  }, [book])

  // ── Volume Profile: fetch when tab or range changes ───────────────────────
  useEffect(() => {
    if (tab !== 'profile') return
    let cancelled = false
    setVpLoading(true); setVpError(null)

    fetchKlines(VP_DAYS[vpRange])
      .then(klines => {
        if (cancelled) return
        setProfile(buildVolumeProfile(klines))
        setLastPrice(klines[klines.length - 1]?.close ?? 0)
        setVpLoading(false)
      })
      .catch(e => { if (!cancelled) { setVpError((e as Error).message); setVpLoading(false) } })

    return () => { cancelled = true }
  }, [tab, vpRange])

  // ── Volume Profile: draw ──────────────────────────────────────────────────
  useEffect(() => {
    if (profile.length && profileCanvas.current)
      drawVolumeProfile(profileCanvas.current, profile, lastPrice)
  }, [profile, lastPrice])

  // ── Redraw on resize ──────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    if (book && depthCanvas.current)     drawDepth(depthCanvas.current, book)
    if (profile.length && profileCanvas.current) drawVolumeProfile(profileCanvas.current, profile, lastPrice)
  }, [book, profile, lastPrice])

  useEffect(() => {
    const ro = new ResizeObserver(redraw)
    if (depthCanvas.current?.parentElement)   ro.observe(depthCanvas.current.parentElement)
    if (profileCanvas.current?.parentElement) ro.observe(profileCanvas.current.parentElement)
    return () => ro.disconnect()
  }, [redraw])

  const bestBid = book?.bids[0][0]
  const bestAsk = book?.asks[0][0]
  const spread  = bestBid && bestAsk ? ((bestAsk - bestBid) / bestAsk * 100).toFixed(4) : null

  return (
    <div className="card market-depth-card">
      {/* ── Header ── */}
      <div className="depth-header">
        <div className="depth-tabs">
          <button
            className={`depth-tab ${tab === 'depth' ? 'depth-tab-active' : ''}`}
            onClick={() => setTab('depth')}
          >
            Order Book Depth
          </button>
          <button
            className={`depth-tab ${tab === 'profile' ? 'depth-tab-active' : ''}`}
            onClick={() => setTab('profile')}
          >
            Volume Profile
          </button>
        </div>

        {tab === 'depth' && (
          <div className="depth-meta">
            {spread && <span className="muted" style={{ fontSize: 11 }}>Spread {spread}%</span>}
            <span className="muted" style={{ fontSize: 11 }}>Refresh in {countdown}s</span>
          </div>
        )}

        {tab === 'profile' && (
          <div className="chart-range-btns">
            {(['1D', '7D', '30D'] as VPRange[]).map(r => (
              <button
                key={r}
                className={`range-btn ${vpRange === r ? 'range-btn-active' : ''}`}
                onClick={() => setVpRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Depth legend ── */}
      {tab === 'depth' && (
        <div className="depth-legend">
          <span><span className="depth-dot" style={{ background: '#22c55e' }} />Bids (buy orders)</span>
          <span><span className="depth-dot" style={{ background: '#ef4444' }} />Asks (sell orders)</span>
          <span className="muted">BNBUSDT · Binance · top 100 levels</span>
        </div>
      )}

      {tab === 'profile' && (
        <div className="depth-legend">
          <span><span className="depth-dot" style={{ background: '#f0b90b' }} />POC (highest volume)</span>
          <span><span className="depth-dot" style={{ background: 'rgba(240,185,11,0.4)' }} />Value Area 70%</span>
          <span><span className="depth-dot" style={{ background: 'rgba(96,165,250,0.4)' }} />Outside VA</span>
        </div>
      )}

      {/* ── Canvas panels ── */}
      <div className="canvas-wrap">
        <canvas
          ref={depthCanvas}
          style={{ display: tab === 'depth' ? 'block' : 'none', width: '100%' }}
        />
        <canvas
          ref={profileCanvas}
          style={{ display: tab === 'profile' ? 'block' : 'none', width: '100%' }}
        />
        {((tab === 'depth' && depthLoading && !book) || (tab === 'profile' && vpLoading)) && (
          <div className="chart-overlay">Loading…</div>
        )}
        {tab === 'depth'   && depthError && !depthLoading && <div className="chart-overlay chart-error">{depthError}</div>}
        {tab === 'profile' && vpError    && !vpLoading    && <div className="chart-overlay chart-error">{vpError}</div>}
      </div>

      <p className="footnote">
        {tab === 'depth'
          ? 'Live order book · auto-refreshes every 5s · price axis centered on mid'
          : 'Volume profile · POC = Point of Control · VAH/VAL = 70% Value Area'}
      </p>
    </div>
  )
}
