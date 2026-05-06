interface Props {
  from: string
  to: string
  amount: string
  symbol: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function TxConfirmModal({
  from,
  to,
  amount,
  symbol,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Review transaction">
        <h3 className="modal-title">Review Transaction</h3>

        <div className="modal-warning">
          ⚠ This action is irreversible. Verify every detail before confirming.
        </div>

        <div className="modal-rows">
          <div className="modal-row">
            <span className="modal-label">From</span>
            <span className="mono">{from.slice(0, 8)}…{from.slice(-6)}</span>
          </div>
          <div className="modal-row modal-row-highlight">
            <span className="modal-label">To</span>
            <span className="mono modal-address">{to}</span>
          </div>
          <div className="modal-row">
            <span className="modal-label">Amount</span>
            <span className="modal-amount">{amount} <strong>{symbol}</strong></span>
          </div>
          <div className="modal-row">
            <span className="modal-label">Network</span>
            <span>BNB Chain Testnet (Chain ID 97)</span>
          </div>
          <div className="modal-row">
            <span className="modal-label">Gas</span>
            <span className="muted">Calculated and shown in your wallet</span>
          </div>
        </div>

        <p className="modal-hint">
          Your wallet app will open next. The transaction is only broadcast after you sign
          it there.
        </p>

        <div className="modal-actions">
          <button
            className="btn btn-disconnect"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <><span className="spinner spinner-light" /> Waiting for wallet…</>
            ) : (
              'Confirm & Sign in Wallet'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
