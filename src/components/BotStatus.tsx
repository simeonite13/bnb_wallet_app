import { useEffect, useState } from 'react'

type Side = 'buy' | 'sell' | 'hold'

interface Status {
  ok: boolean
  live_trading?: boolean
  enable_real_trading: boolean
  max_trade_usdt: number
  max_risk_per_trade?: number
  daily_max_loss?: number
  max_drawdown_pct: number
  start_equity_usdt: number
  require_manual_approval?: boolean
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

interface EquityRow {
  date: string
  equity_usdt: number
}

// Compact inline SVG sparkline of recent equity values.
function Sparkline({ values, height = 38 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 100
  const last = values[values.length - 1]
  const first = values[0]
  const up = last >= first
  const stroke = up ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  const fill = up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = height - ((v - min) / range) * height
    return [x, y]
  })
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L${w},${height} L0,${height} Z`
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  )
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
  const [history, setHistory] = useState<EquityRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [statusRes, eqRes] = await Promise.all([
          window.fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(8000) }),
          window.fetch(`${API_BASE}/equity?limit=30`, { signal: AbortSignal.timeout(8000) }),
        ])
        if (!statusRes.ok) throw new Error(`status ${statusRes.status}`)
        if (!eqRes.ok) throw new Error(`equity ${eqRes.status}`)
        const data = (await statusRes.json()) as Status
        const eqRows = (await eqRes.json()) as EquityRow[]
        if (!cancelled) { setS(data); setHistory(eqRows); setError(null) }
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

  const liveOn = s.live_trading ?? s.enable_real_trading
  const realLabel = liveOn ? 'ON · live trading' : 'OFF · paper-only'
  const realColor = liveOn ? 'var(--red)' : 'var(--green)'

  const riskPct  = s.max_risk_per_trade ?? 0
  const dailyPct = s.daily_max_loss ?? 0
  const manual   = s.require_manual_approval ?? false

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

        {manual && (
          <>
            <span className="muted">Approval</span>
            <span style={{ color: 'var(--accent, #d97706)', fontWeight: 600 }}>
              MANUAL — auto-broadcast paused
            </span>
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
          Risk/trade {riskPct > 0 ? `${(riskPct * 100).toFixed(2)}%` : 'disabled'}{' · '}
          Daily loss {dailyPct > 0 ? `−${(dailyPct * 100).toFixed(2)}%` : 'disabled'}{' · '}
          Drawdown halt {s.max_drawdown_pct > 0 ? `−${s.max_drawdown_pct}%` : 'disabled'}
          {s.start_equity_usdt > 0 && (
            <>{' · Baseline $'}{s.start_equity_usdt.toFixed(2)}</>
          )}
        </span>
      </div>

      {history.length >= 2 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>Equity (last {history.length} days)</span>
            <span>
              ${history[0].equity_usdt.toFixed(2)} → ${history[history.length - 1].equity_usdt.toFixed(2)}
              {' '}({((history[history.length - 1].equity_usdt / history[0].equity_usdt - 1) * 100).toFixed(2)}%)
            </span>
          </div>
          <Sparkline values={history.map(r => r.equity_usdt)} />
        </div>
      )}
    </div>
  )
}
