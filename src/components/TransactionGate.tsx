import { useState } from 'react'

interface Props {
  children: React.ReactNode
}

export function TransactionGate({ children }: Props) {
  const [acknowledged, setAcknowledged] = useState(false)

  if (!acknowledged) {
    return (
      <div className="card tx-gate">
        <div className="tx-gate-header">
          <span className="tx-gate-icon">⚠</span>
          <h2>Transaction Features</h2>
        </div>

        <p className="tx-gate-intro">
          You are about to enable the ability to send tokens. Read each point carefully
          before continuing.
        </p>

        <ul className="tx-warnings">
          <li>
            <strong>Transactions are irreversible.</strong> Once broadcast, they cannot be
            cancelled or reversed by anyone, including wallet providers.
          </li>
          <li>
            <strong>Always verify the full recipient address.</strong> A single wrong
            character means permanent loss of funds. Copy-paste, never type manually.
          </li>
          <li>
            <strong>Your wallet signs every transaction.</strong> This app will never submit
            anything to the network without your explicit approval in MetaMask or your
            connected wallet.
          </li>
          <li>
            <strong>Check the gas estimate</strong> shown in your wallet before confirming.
            Unusually high gas may indicate a problem with the transaction.
          </li>
          <li>
            <strong>Beware of clipboard hijacking.</strong> Malware can silently replace
            copied addresses. Verify the first and last 6 characters after pasting.
          </li>
          <li>
            This app does <strong>not</strong> have access to your private key or seed
            phrase at any point.
          </li>
        </ul>

        <button
          className="btn btn-danger-outline"
          onClick={() => setAcknowledged(true)}
        >
          I have read and understand the risks — enable transactions
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="tx-active-banner">
        <span>⚠ Transaction mode active — verify all addresses carefully</span>
        <button className="btn-text danger-text" onClick={() => setAcknowledged(false)}>
          Hide
        </button>
      </div>
      {children}
    </div>
  )
}
