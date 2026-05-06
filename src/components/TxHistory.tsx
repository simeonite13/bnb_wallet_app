import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { BSCSCAN_TESTNET, BSCSCAN_TESTNET_API } from '../constants'

interface Tx {
  hash: string
  from: string
  to: string
  value: string
  timeStamp: string
  isError: string
  gasUsed: string
  gasPrice: string
  functionName: string
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function formatValue(wei: string) {
  const bnb = Number(wei) / 1e18
  if (bnb === 0) return '0 tBNB'
  return `${bnb.toFixed(6)} tBNB`
}

function timeAgo(ts: string) {
  const sec = Math.floor(Date.now() / 1000) - parseInt(ts)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

export function TxHistory() {
  const { address, isConnected } = useAccount()
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) { setTxs([]); return }

    let cancelled = false
    setLoading(true)
    setError(null)

    window.fetch(
      `${BSCSCAN_TESTNET_API}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=15&sort=desc&apikey=YourApiKeyToken`
    )
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.status === '1') {
          setTxs(data.result)
        } else if (data.message === 'No transactions found') {
          setTxs([])
        } else {
          setError(data.message ?? 'BSCScan API error')
        }
      })
      .catch(() => {
        if (!cancelled) setError('Network error — check BSCScan API')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [address])

  if (!isConnected) return null

  return (
    <div className="card">
      <div className="card-header-row">
        <h2>Transaction History</h2>
        {address && (
          <a
            href={`${BSCSCAN_TESTNET}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-text"
          >
            BSCScan ↗
          </a>
        )}
      </div>

      {loading && (
        <div className="tx-list-loading">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="tx-row tx-row-skeleton">
              <span className="skeleton" style={{ width: '80px' }} />
              <span className="skeleton" style={{ width: '120px' }} />
              <span className="skeleton" style={{ width: '100px' }} />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <p className="form-error" style={{ marginTop: 8 }}>
          ⚠ {error} — <a href={`${BSCSCAN_TESTNET}/address/${address}`} target="_blank" rel="noopener noreferrer" className="link-accent">View on BSCScan ↗</a>
        </p>
      )}

      {!loading && !error && txs.length === 0 && (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          No transactions found on BNB Testnet yet.
        </p>
      )}

      {!loading && txs.length > 0 && (
        <div className="tx-list">
          <div className="tx-list-header">
            <span>Hash</span>
            <span>Type</span>
            <span>Value</span>
            <span>Status</span>
            <span>Age</span>
          </div>
          {txs.map(tx => {
            const isIn = tx.to.toLowerCase() === address?.toLowerCase()
            const success = tx.isError === '0'
            return (
              <div key={tx.hash} className={`tx-row ${success ? '' : 'tx-row-err'}`}>
                <a
                  href={`${BSCSCAN_TESTNET}/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono tx-hash-link"
                  title={tx.hash}
                >
                  {tx.hash.slice(0, 8)}…
                </a>
                <span className={`tx-direction ${isIn ? 'tx-in' : 'tx-out'}`}>
                  {isIn ? '↓ IN' : '↑ OUT'}
                </span>
                <span className="mono">{formatValue(tx.value)}</span>
                <span className={success ? 'tx-ok' : 'tx-fail'}>
                  {success ? '✓' : '✗'}
                </span>
                <span className="muted">{timeAgo(tx.timeStamp)}</span>
              </div>
            )
          })}
        </div>
      )}

      <p className="footnote">Last 15 transactions · BNB Testnet</p>
    </div>
  )
}
