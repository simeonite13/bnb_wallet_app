import { useAccount, useConnect, useDisconnect } from 'wagmi'

export function ConnectButton() {
  const { isConnected, address } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="connect-wrap">
        <span className="connected-addr mono">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button className="btn btn-disconnect" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    )
  }

  const metamask = connectors.find(c => c.id === 'metaMask' || c.type === 'injected')
  const wc       = connectors.find(c => c.type === 'walletConnect')

  return (
    <div className="connect-wrap">
      <div className="connect-buttons">
        {metamask && (
          <button
            className="btn btn-metamask"
            disabled={isPending}
            onClick={() => connect({ connector: metamask })}
          >
            {isPending
              ? <><span className="spinner" /> Connecting…</>
              : <><MetaMaskIcon /> MetaMask</>
            }
          </button>
        )}
        {wc && (
          <button
            className="btn btn-wc"
            disabled={isPending}
            onClick={() => connect({ connector: wc })}
          >
            {isPending
              ? <><span className="spinner" /> Connecting…</>
              : <><WCIcon /> WalletConnect</>
            }
          </button>
        )}
      </div>
      {error && <p className="connect-error">{error.message.slice(0, 120)}</p>}
    </div>
  )
}

function MetaMaskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 318.6 318.6" fill="none" aria-hidden="true">
      <polygon fill="#E2761B" points="274.1,35.5 174.6,109.4 193,65.8"/>
      <polygon fill="#E4761B" points="44.4,35.5 143.1,110.1 125.6,65.8"/>
      <polygon fill="#E4761B" points="238.3,206.8 211.8,247.4 268.5,263 284.8,207.7"/>
      <polygon fill="#E4761B" points="33.9,207.7 50.1,263 106.8,247.4 80.3,206.8"/>
      <polygon fill="#E4761B" points="103.6,138.2 87.8,162.1 144.1,164.6 142.1,104.1"/>
      <polygon fill="#E4761B" points="214.9,138.2 176,103.4 174.6,164.6 230.8,162.1"/>
      <polygon fill="#E4761B" points="106.8,247.4 140.6,230.9 111.4,208.1"/>
      <polygon fill="#E4761B" points="177.9,230.9 211.8,247.4 207.1,208.1"/>
    </svg>
  )
}

function WCIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 300 185" fill="none" aria-hidden="true">
      <path
        d="M61.4 36.8C109.8-8.3 188.1-8.3 236.5 36.8l5.7 5.6c2.4 2.3 2.4 6.1 0 8.4l-19.6 19.2a3.1 3.1 0 0 1-4.3 0l-7.9-7.7c-33.5-32.7-87.8-32.7-121.3 0l-8.4 8.2a3.1 3.1 0 0 1-4.3 0L56.9 51.3a6 6 0 0 1 0-8.4l4.5-6.1Zm218 40.7 17.4 17.1c2.4 2.3 2.4 6.1 0 8.4l-78.6 77a6.2 6.2 0 0 1-8.7 0L149.7 123a1.6 1.6 0 0 0-2.2 0l-59.4 58.1a6.2 6.2 0 0 1-8.7 0L.8 103a6 6 0 0 1 0-8.4l17.4-17.1a6.2 6.2 0 0 1 8.7 0l59.4 58.1c.6.6 1.6.6 2.2 0l59.4-58.1a6.2 6.2 0 0 1 8.7 0l59.4 58.1c.6.6 1.6.6 2.2 0l59.4-58.1a6.2 6.2 0 0 1 8.8 0Z"
        fill="#3396FF"
      />
    </svg>
  )
}
