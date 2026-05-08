import { useEffect, useState } from 'react'

type Side = 'buy' | 'sell' | 'hold'

interface Status {
  ok: boolean
  enable_real_trading: boolean
  max_trade_usdt: number
  max_drawdown_pct: number
  start_equity_usdt: number
  kill_switch_active: boolean
  latest_signal: {
    date: string; side: Side; close: number; pair: string
  } | null
  latest_trade: {
    ts: string; side: 'buy' | 'sell'; qty_quote: number; price: number; mode: string
  } | null
  latest_equity: {
    date: string; equity_usdt: number; cash_usdt: number; position_bnb: number
  } | null
}

const API_BASE = '/bnb_wallet_app/api/bot'
const POLL_MS = 30_000

function sideColor(side: string): string {
  if (side === 'buy') return 'var(--green, #16a34a)'
  if (side === 'sell') return 'var(--red, #dc2626)'
  return 'var(--muted, #6b7280)'
}

export function BotStatus() {
  const [s, setS] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await window.fetch(`${API_BASE}/status`, {
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as Status
        if (!cancelled) { setS(data); setError(null) }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (error && !s) {
    return (
      <div className="card">
        <h2>Bot Status</h2>
        <p style={{ color: 'var(--red)' }}>● offline — {error}</p>
      </div>
    )
  }
  if (!s) {
    return (
      <div className="card">
        <h2>Bot Status</h2>
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const sig = s.latest_signal
  const tr = s.latest_trade
  const eq = s.latest_equity

  const realLabel = s.enable_real_trading ? 'ON · live trading' : 'OFF · paper-only'
  const realColor = s.enable_real_trading ? 'var(--red)' : 'var(--green)'

  const tsStr = (iso: string) => iso.slice(0, 16).replace('T', ' ')

  return (
    <div className="card">
      <h2>Bot Status</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '140px 1fr',
          rowGap: 6,
          columnGap: 12,
          fontSize: 13,
        }}
      >
        <span className="muted">Health</span>
        <span style={{ color: 'var(--green)' }}>● online</span>

        <span className="muted">Real trading</span>
        <span style={{ color: realColor, fontWeight: 600 }}>{realLabel}</span>

        {s.kill_switch_active && (
          <>
            <span className="muted">Kill switch</span>
            <span style={{ color: 'var(--red)', fontWeight: 600 }}>ACTIVE — halted</span>
          </>
        )}

        <span className="muted">Latest signal</span>
        <span>
          {sig ? (
            <>
              <span style={{ color: sideColor(sig.side), fontWeight: 600 }}>
                {sig.side.toUpperCase()}
              </span>
              {' · '}{sig.date}{' · '}${sig.close.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </>
          ) : (
            <span className="muted">none</span>
          )}
        </span>

        <span className="muted">Latest trade</span>
        <span>
          {tr ? (
            <>
              <span style={{ color: sideColor(tr.side), fontWeight: 600 }}>
                {tr.side.toUpperCase()}
              </span>
              {' · '}{tsStr(tr.ts)}{' · $'}{tr.qty_quote.toFixed(2)}
              {' '}<span className="muted" style={{ fontSize: 11 }}>({tr.mode})</span>
            </>
          ) : (
            <span className="muted">none</span>
          )}
        </span>

        <span className="muted">Equity</span>
        <span>
          {eq ? (
            <>
              ${eq.equity_usdt.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              {' '}<span className="muted" style={{ fontSize: 11 }}>
                paper · cash ${eq.cash_usdt.toFixed(2)} · BNB {eq.position_bnb.toFixed(4)}
              </span>
            </>
          ) : (
            <span className="muted">none</span>
          )}
        </span>

        <span className="muted">Limits</span>
        <span className="muted" style={{ fontSize: 11 }}>
          Max trade ${s.max_trade_usdt.toFixed(2)}{' · '}
          Drawdown halt {s.max_drawdown_pct > 0 ? `−${s.max_drawdown_pct}%` : 'disabled'}
          {s.start_equity_usdt > 0 && (
            <>{' · Baseline $'}{s.start_equity_usdt.toFixed(2)}</>
          )}
        </span>
      </div>
    </div>
  )
}
