import { useWaitForTransactionReceipt } from 'wagmi'

interface Props {
  hash: `0x${string}` | undefined
  onDone?: () => void
}

export function TxStatus({ hash, onDone }: Props) {
  const { isLoading, isSuccess, isError, data: receipt } = useWaitForTransactionReceipt({
    hash,
  })

  if (!hash) return null

  return (
    <div className={`tx-status ${isSuccess ? 'tx-success' : isError ? 'tx-error' : 'tx-pending'}`}>
      <div className="tx-status-row">
        {isLoading && (
          <span><span className="spinner" style={{ borderTopColor: 'currentColor' }} /> Waiting for confirmation on-chain…</span>
        )}
        {isSuccess && (
          <span>✓ Confirmed in block {receipt?.blockNumber?.toString()}</span>
        )}
        {isError && (
          <span>✗ Transaction failed or reverted</span>
        )}
      </div>

      <div className="tx-status-row">
        <a
          href={`https://testnet.bscscan.com/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="tx-hash-link"
        >
          {hash.slice(0, 10)}…{hash.slice(-8)} ↗ BSCScan
        </a>
        {(isSuccess || isError) && onDone && (
          <button className="btn-text" onClick={onDone}>Clear</button>
        )}
      </div>
    </div>
  )
}
