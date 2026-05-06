export function SecurityBanner() {
  return (
    <div className="security-banner">
      <span className="security-icon">🔒</span>
      <div>
        <strong>Read-only mode</strong> — This app only reads your wallet address and token
        balances. No transactions will ever be initiated without a separate, explicit confirmation
        step. Your seed phrase and private key are never requested, stored, or accessible.
        WalletConnect connection can be revoked at any time from your wallet app.
      </div>
    </div>
  )
}
