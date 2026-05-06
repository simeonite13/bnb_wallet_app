import { useLivePrice } from '../hooks/useLivePrice'

interface Props {
  compact?: boolean
}

export function PriceDisplay({ compact }: Props) {
  const { usd, change24h, loading, lastUpdated } = useLivePrice()

  const isUp = (change24h ?? 0) >= 0
  const changeColor = isUp ? 'var(--green)' : 'var(--red)'
  const arrow = isUp ? '▲' : '▼'

  if (compact) {
    return (
      <div className="price-compact">
        <span className="price-label">BNB</span>
        {loading && !usd ? (
          <span className="skeleton">$000.00</span>
        ) : usd ? (
          <>
            <span className="price-value">${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            {change24h !== null && (
              <span className="price-change" style={{ color: changeColor }}>
                {arrow}{Math.abs(change24h).toFixed(2)}%
              </span>
            )}
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
    )
  }

  return (
    <div className="card price-card">
      <div className="price-header">
        <div className="price-token-badge">
          <span className="bnb-dot" />
          BNB / USD
        </div>
        {lastUpdated && (
          <span className="price-updated muted">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="price-main">
        {loading && !usd ? (
          <span className="skeleton price-big">$000.00</span>
        ) : usd ? (
          <span className="price-big">
            ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="price-big muted">Unavailable</span>
        )}

        {change24h !== null && (
          <span className="price-24h" style={{ color: changeColor }}>
            {arrow} {Math.abs(change24h).toFixed(2)}% (24h)
          </span>
        )}
      </div>

      <div className="price-meta muted">
        Live price · BNB Chain Testnet · refreshes every 30s
      </div>
    </div>
  )
}
