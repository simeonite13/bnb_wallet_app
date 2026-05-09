import { useAccount, useBalance, useReadContracts } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { useChainAssets } from '../hooks/useChainAssets'
import { useLivePrice } from '../hooks/useLivePrice'

function fmt(val: string, dec = 4) {
  const n = Number(val)
  if (n === 0) return '0'
  if (n < 0.0001) return '< 0.0001'
  return n.toLocaleString(undefined, { maximumFractionDigits: dec })
}

const TOKEN_ICONS: Record<string, string> = {
  BNB: '⬡',
  tBNB: '⬡',
  USDT: '$',
  BUSD: 'B',
  WBNB: 'W',
  CAKE: '🥞',
}

export function TokenBalanceCards() {
  const { address, isConnected } = useAccount()
  const { tokens: chainTokens, erc20Tokens, explorer, faucetUrl, isMainnet, isTestnet } = useChainAssets()
  const onSupportedChain = isMainnet || isTestnet
  const { usd: bnbPrice } = useLivePrice()

  const { data: bnb, isLoading: bnbLoading } = useBalance({
    address,
    query: { enabled: isConnected && onSupportedChain },
  })

  const contracts = erc20Tokens.map(t => ({
    address: t.address,
    abi: erc20Abi,
    functionName: 'balanceOf' as const,
    args: [address!] as [`0x${string}`],
  }))

  const { data: tokenData, isLoading: tokensLoading } = useReadContracts({
    contracts,
    query: { enabled: isConnected && onSupportedChain && !!address },
  })

  if (!isConnected) return null
  if (!onSupportedChain) return (
    <div className="card">
      <p className="chain-warning">⚠ Switch wallet to BNB Smart Chain (Mainnet 56 or Testnet 97) to see balances.</p>
    </div>
  )

  const tokens = chainTokens.map((t) => {
    if (t.address === 'native') {
      return {
        ...t,
        balance: bnb?.formatted ?? null,
        loading: bnbLoading,
        usdValue: bnbPrice && bnb ? parseFloat(bnb.formatted) * bnbPrice : null,
      }
    }
    const erc20Idx = erc20Tokens.findIndex(b => b.symbol === t.symbol)
    const result = tokenData?.[erc20Idx]
    const raw = result?.status === 'success' ? (result.result as bigint) : null
    const balance = raw !== null ? formatUnits(raw, t.decimals) : null
    const isStable = t.symbol === 'USDT' || t.symbol === 'BUSD'
    const price = isStable ? 1 : (t.symbol === 'WBNB' ? bnbPrice : null)
    return {
      ...t,
      balance,
      loading: tokensLoading,
      usdValue: price && balance ? parseFloat(balance) * price : null,
    }
  })

  return (
    <div className="balances-section">
      <div className="section-header">
        <h2 className="section-title">Token Balances</h2>
        <a
          href={`${explorer}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-text"
        >
          View on BSCScan ↗
        </a>
      </div>

      <div className="balance-cards-grid">
        {tokens.map(token => (
          <div key={token.symbol} className="balance-card">
            <div className="balance-card-top">
              <div className="token-icon">{TOKEN_ICONS[token.symbol] ?? '◈'}</div>
              <div className="token-name-group">
                <span className="token-sym">{token.symbol}</span>
                <span className="token-lbl muted">{token.label}</span>
              </div>
            </div>
            <div className="balance-card-bottom">
              <div className="balance-amount mono">
                {token.loading ? (
                  <span className="skeleton">0.0000</span>
                ) : token.balance !== null ? (
                  fmt(token.balance, 6)
                ) : (
                  '—'
                )}
              </div>
              {token.usdValue !== null && (
                <div className="balance-usd muted">
                  ≈ ${token.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="footnote">
        {isMainnet ? 'Mainnet balances · Real funds — every send is irreversible.' : (
          <>
            Testnet balances · Get test BNB at{' '}
            {faucetUrl && (
              <a href={faucetUrl} target="_blank" rel="noopener noreferrer" className="link-accent">
                BNB Testnet Faucet ↗
              </a>
            )}
          </>
        )}
      </p>
    </div>
  )
}
