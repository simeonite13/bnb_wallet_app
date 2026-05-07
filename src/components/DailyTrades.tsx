import { useEffect, useState } from 'react'

type Signal = {
  id: number
  date: string
  pair: string
  side: 'buy' | 'sell' | 'hold'
  period: number
  close: number
  n_high: number
  n_low: number
  created_at: string
}

type Trade = {
  id: number
  ts: string
  pair: string
  side: 'buy' | 'sell'
  qty_base: number
  qty_quote: number
  price: number
  mode: string
  note: string | null
}

type Equity = {
  id: number
  date: string
  pair: string
  cash_usdt: number
  position_bnb: number
  price: number
  equity_usdt: number
}

type Summary = {
  latest_signal: Signal | null
  latest_equity: Equity | null
  trade_count: number
}

const API_BASE = '/bnb_wallet_app/api/bot'

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

function pillColor(side: string): string {
  if (side === 'buy') return 'var(--green, #16a34a)'
  if (side === 'sell') return 'var(--red, #dc2626)'
  return 'var(--muted, #6b7280)'
}

export function DailyTrades() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [equity, setEquity] = useState<Equity[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [s, sig, tr, eq] = await Promise.all([
          getJSON<Summary>('/summary'),
          getJSON<Signal[]>('/signals?limit=10'),
          getJSON<Trade[]>('/trades?limit=10'),
          getJSON<Equity[]>('/equity?limit=60'),
        ])
        if (cancelled) return
        setSummary(s)
        setSignals(sig)
        setTrades(tr)
        setEquity(eq)
        setError(null)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (loading && !summary) {
    return (
      <div className="card">
        <h2>Daily Strategy (Donchian, Paper)</h2>
        <p className="muted">Loading bot data…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <h2>Daily Strategy (Donchian, Paper)</h2>
        <p style={{ color: 'var(--red, #dc2626)' }}>
          Bot API unreachable: {error}
        </p>
        <p className="muted" style={{ fontSize: 12 }}>
          Expected at <code>{API_BASE}</code> via the Vite proxy → http://127.0.0.1:8055.
          Check <code>systemctl --user status bnb-api.service</code>.
        </p>
      </div>
    )
  }

  const sig = summary?.latest_signal
  const eq = summary?.latest_equity
  const startEquity = equity[0]?.equity_usdt ?? eq?.equity_usdt ?? 1000
  const pnl = eq ? eq.equity_usdt - startEquity : 0
  const pnlPct = startEquity ? (pnl / startEquity) * 100 : 0

  return (
    <div className="card">
      <h2>Daily Strategy (Donchian, Paper)</h2>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        {sig && (
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Latest signal · {sig.date}</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 10px',
                  borderRadius: 999,
                  color: 'white',
                  background: pillColor(sig.side),
                  marginRight: 8,
                  fontSize: 13,
                }}
              >
                {sig.side.toUpperCase()}
              </span>
              {sig.pair} @ ${sig.close.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {sig.period}D high ${sig.n_high.toFixed(2)} · low ${sig.n_low.toFixed(2)}
            </div>
          </div>
        )}

        {eq && (
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Paper equity</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              ${eq.equity_usdt.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="muted" style={{ fontSize: 12, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
            </div>
          </div>
        )}

        <div>
          <div className="muted" style={{ fontSize: 12 }}>Trades executed</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{summary?.trade_count ?? 0}</div>
        </div>
      </div>

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
          Recent signals ({signals.length})
        </summary>
        <table style={{ width: '100%', fontSize: 13, marginTop: 8 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>Date</th><th>Side</th><th>Close</th><th>{sig?.period ?? 20}D Hi</th><th>{sig?.period ?? 20}D Lo</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <tr key={s.id}>
                <td>{s.date}</td>
                <td><span style={{ color: pillColor(s.side) }}>{s.side}</span></td>
                <td>${s.close.toFixed(2)}</td>
                <td>${s.n_high.toFixed(2)}</td>
                <td>${s.n_low.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
          Trades ({trades.length})
        </summary>
        {trades.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No trades yet — strategy in HOLD.</p>
        ) : (
          <table style={{ width: '100%', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>Time</th><th>Side</th><th>Qty (BNB)</th><th>Price</th><th>USDT</th><th>Note</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td>{t.ts.slice(0, 16).replace('T', ' ')}</td>
                  <td><span style={{ color: pillColor(t.side) }}>{t.side}</span></td>
                  <td>{t.qty_base.toFixed(6)}</td>
                  <td>${t.price.toFixed(2)}</td>
                  <td>${t.qty_quote.toFixed(2)}</td>
                  <td className="muted">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  )
}
