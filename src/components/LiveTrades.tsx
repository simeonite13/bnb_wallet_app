import { useEffect, useRef, useState } from 'react'

interface Trade {
  id: number
  time: number
  price: number
  qty: number
  isSell: boolean   // m=true → buyer is maker → sell aggressor
}

type WsStatus = 'connecting' | 'open' | 'closed' | 'error'

const MAX_TRADES = 100
const VISIBLE    = 30
const WS_URL     = 'wss://stream.binance.com:9443/ws/bnbusdt@trade'

function fmt(n: number, dec: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function timeStr(ms: number) {
  return new Date(ms).toLocaleTimeString('en-US', { hour12: false })
}

export function LiveTrades() {
  const [trades,    setTrades]   = useState<Trade[]>([])
  const [status,    setStatus]   = useState<WsStatus>('connecting')
  const [flashIds,  setFlashIds] = useState<Set<number>>(new Set())
  const wsRef       = useRef<WebSocket | null>(null)
  const retryRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef  = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    function connect() {
      if (!mountedRef.current) return
      setStatus('connecting')
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => { if (mountedRef.current) setStatus('open') }

      ws.onmessage = (evt) => {
        if (!mountedRef.current) return
        try {
          const d = JSON.parse(evt.data as string)
          const trade: Trade = {
            id:     d.t,
            time:   d.T,
            price:  parseFloat(d.p),
            qty:    parseFloat(d.q),
            isSell: d.m,       // buyer is maker → aggressive sell
          }
          setTrades(prev => [trade, ...prev].slice(0, MAX_TRADES))
          setFlashIds(prev => {
            const next = new Set(prev)
            next.add(trade.id)
            return next
          })
          setTimeout(() => {
            setFlashIds(prev => {
              const next = new Set(prev)
              next.delete(trade.id)
              return next
            })
          }, 400)
        } catch { /* ignore parse errors */ }
      }

      ws.onerror = () => { if (mountedRef.current) setStatus('error') }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setStatus('closed')
        retryRef.current = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [])

  const visible = trades.slice(0, VISIBLE)

  // Buy/sell stats over last 50 trades
  const last50   = trades.slice(0, 50)
  const buyCnt   = last50.filter(t => !t.isSell).length
  const sellCnt  = last50.filter(t =>  t.isSell).length
  const buyVol   = last50.filter(t => !t.isSell).reduce((s, t) => s + t.qty * t.price, 0)
  const sellVol  = last50.filter(t =>  t.isSell).reduce((s, t) => s + t.qty * t.price, 0)
  const totalVol = buyVol + sellVol || 1
  const buyPct   = (buyVol / totalVol * 100).toFixed(1)
  const sellPct  = (sellVol / totalVol * 100).toFixed(1)

  const statusLabel: Record<WsStatus, string> = {
    connecting: 'Connecting…',
    open:       'Live',
    closed:     'Reconnecting…',
    error:      'Error',
  }
  const statusClass: Record<WsStatus, string> = {
    connecting: 'ws-dot ws-connecting',
    open:       'ws-dot ws-open',
    closed:     'ws-dot ws-closed',
    error:      'ws-dot ws-error',
  }

  return (
    <div className="card live-trades-card">
      {/* Header */}
      <div className="trades-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ marginBottom: 0 }}>Live Trades</h2>
          <span className={statusClass[status]} title={statusLabel[status]} />
          <span className="muted" style={{ fontSize: 11 }}>{statusLabel[status]}</span>
        </div>
        <span className="muted" style={{ fontSize: 11 }}>BNBUSDT · Binance</span>
      </div>

      {/* Buy / Sell pressure bar */}
      {last50.length > 0 && (
        <div className="trades-pressure">
          <div className="pressure-bar">
            <div className="pressure-buy"  style={{ width: buyPct  + '%' }} />
            <div className="pressure-sell" style={{ width: sellPct + '%' }} />
          </div>
          <div className="pressure-labels">
            <span style={{ color: 'var(--green)' }}>
              ▲ Buy {buyPct}% · ${fmt(buyVol, 0)}
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 10 }}>
              last {last50.length} trades
            </span>
            <span style={{ color: 'var(--red)' }}>
              ${fmt(sellVol, 0)} · {sellPct}% Sell ▼
            </span>
          </div>
          <div className="pressure-counts">
            <span style={{ color: 'var(--green)' }}>{buyCnt} buys</span>
            <span style={{ color: 'var(--muted)', fontSize: 10 }}>·</span>
            <span style={{ color: 'var(--red)' }}>{sellCnt} sells</span>
          </div>
        </div>
      )}

      {/* Table header */}
      <div className="trades-table-head">
        <span>Time</span>
        <span>Side</span>
        <span style={{ textAlign: 'right' }}>Price</span>
        <span style={{ textAlign: 'right' }}>Qty</span>
        <span style={{ textAlign: 'right' }}>Total</span>
      </div>

      {/* Trades list */}
      <div className="trades-scroll">
        {visible.length === 0 && (
          <div className="trades-empty">Waiting for trades…</div>
        )}
        {visible.map(t => (
          <div
            key={t.id}
            className={`trades-row ${t.isSell ? 'trade-sell' : 'trade-buy'} ${flashIds.has(t.id) ? 'trade-flash' : ''}`}
          >
            <span className="trade-time">{timeStr(t.time)}</span>
            <span className={`trade-side-badge ${t.isSell ? 'side-sell' : 'side-buy'}`}>
              {t.isSell ? 'SELL' : 'BUY'}
            </span>
            <span className={`trade-price ${t.isSell ? 'trade-price-sell' : 'trade-price-buy'}`}>
              {fmt(t.price, 2)}
            </span>
            <span className="trade-qty">{fmt(t.qty, 4)}</span>
            <span className="trade-total">${fmt(t.price * t.qty, 2)}</span>
          </div>
        ))}
      </div>

      <p className="footnote">Real-time WebSocket stream · newest first · last {VISIBLE} of {trades.length}</p>
    </div>
  )
}
