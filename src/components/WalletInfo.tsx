import { useAccount, useChainId } from 'wagmi'
import { bscTestnet } from 'wagmi/chains'

export function WalletInfo() {
  const { address, isConnected, connector } = useAccount()
  const chainId = useChainId()

  if (!isConnected || !address) return null

  const isCorrectChain = chainId === bscTestnet.id
  const networkLabel = isCorrectChain ? 'BNB Chain Testnet' : `Unknown chain (${chainId})`
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <div className="card">
      <h2>Wallet</h2>

      <div className="info-row">
        <span className="label">Address</span>
        <span className="mono address-full" title={address}>{address}</span>
        <span className="mono address-short" title={address}>{short}</span>
      </div>

      <div className="info-row">
        <span className="label">Network</span>
        <span className={`badge ${isCorrectChain ? 'badge-green' : 'badge-red'}`}>
          {isCorrectChain ? '●' : '⚠'} {networkLabel}
        </span>
      </div>

      <div className="info-row">
        <span className="label">Chain ID</span>
        <span className="mono">{chainId}</span>
      </div>

      {connector && (
        <div className="info-row">
          <span className="label">Connected via</span>
          <span>{connector.name}</span>
        </div>
      )}

      {!isCorrectChain && (
        <p className="chain-warning">
          ⚠ Switch your wallet to BNB Chain Testnet (Chain ID 97) to see balances and use real mode.
        </p>
      )}
    </div>
  )
}
