import { useAccount, useBalance, useReadContracts, useChainId } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { bscTestnet } from 'wagmi/chains'
import { BSC_TOKENS } from '../constants'

function fmt(value: string, decimals = 4): string {
  const n = Number(value)
  if (n === 0) return '0'
  if (n < 0.0001) return '< 0.0001'
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals })
}

export function TokenBalances() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const onCorrectChain = chainId === bscTestnet.id

  const { data: bnb, isLoading: bnbLoading } = useBalance({
    address,
    query: { enabled: isConnected && onCorrectChain },
  })

  const contracts = BSC_TOKENS.map((t) => ({
    address: t.address,
    abi: erc20Abi,
    functionName: 'balanceOf' as const,
    args: [address!] as [`0x${string}`],
  }))

  const { data: tokenData, isLoading: tokensLoading } = useReadContracts({
    contracts,
    query: { enabled: isConnected && onCorrectChain && !!address },
  })

  if (!isConnected) return null
  if (!onCorrectChain) return null

  const isLoading = bnbLoading || tokensLoading

  return (
    <div className="card">
      <h2>Token Balances</h2>

      <div className="balance-row">
        <div className="token-info">
          <span className="token-symbol">BNB</span>
          <span className="token-label">Native</span>
        </div>
        <span className="balance-value mono">
          {bnbLoading ? <Skeleton /> : bnb ? fmt(bnb.formatted, 6) : '—'}
        </span>
      </div>

      <div className="divider" />

      {BSC_TOKENS.map((token, i) => {
        const result = tokenData?.[i]
        const raw = result?.status === 'success' ? (result.result as bigint) : null
        const balance =
          raw !== null && raw !== undefined ? fmt(formatUnits(raw, token.decimals)) : null
        return (
          <div key={token.symbol} className="balance-row">
            <div className="token-info">
              <span className="token-symbol">{token.symbol}</span>
              <span className="token-label mono small">
                {token.address.slice(0, 6)}…{token.address.slice(-4)}
              </span>
            </div>
            <span className="balance-value mono">
              {tokensLoading ? <Skeleton /> : balance !== null ? balance : '—'}
            </span>
          </div>
        )
      })}

      {isLoading && <p className="footnote">Fetching from chain…</p>}
      <p className="footnote">Read-only · No approvals requested · Data from BSC RPC</p>
    </div>
  )
}

function Skeleton() {
  return <span className="skeleton">······</span>
}
