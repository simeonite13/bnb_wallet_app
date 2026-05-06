interface Props {
  action: string      // e.g. "Send 0.5 tBNB"
  to?: string
  onConfirm: () => void
  onCancel: () => void
}

export function SwapWarningModal({ action, to, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="swap-warn-title">
        <div className="modal-icon-row">
          <span className="modal-warn-icon">⚠</span>
          <h3 className="modal-title" id="swap-warn-title">Before You Continue</h3>
        </div>

        <div className="modal-warning">
          <strong>You are about to initiate a real transaction on BNB Testnet.</strong>
          <br />Action: <span className="mono">{action}</span>
          {to && <><br />Recipient: <span className="mono">{to}</span></>}
        </div>

        <ul className="tx-warnings">
          <li>
            <strong>Transactions are irreversible.</strong> Once confirmed on-chain they cannot
            be reversed by anyone.
          </li>
          <li>
            <strong>MetaMask will open next.</strong> The transaction is only broadcast after
            you explicitly confirm it in your wallet.
          </li>
          <li>
            <strong>Verify the recipient address</strong> carefully — one wrong character means
            permanent loss of funds.
          </li>
          <li>
            <strong>This is testnet BNB only.</strong> Funds here have no real-world value, but
            practice good habits anyway.
          </li>
          <li>
            This app <strong>never</strong> has access to your private key or seed phrase.
          </li>
        </ul>

        <div className="modal-actions">
          <button className="btn btn-disconnect" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            I understand — open MetaMask
          </button>
        </div>
      </div>
    </div>
  )
}
