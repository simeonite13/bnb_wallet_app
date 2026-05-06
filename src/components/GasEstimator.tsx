import { useGasPrice } from 'wagmi'
import { bscTestnet } from 'wagmi/chains'
import { useLivePrice } from '../hooks/useLivePrice'

const GAS_OPS = [
  { label: 'BNB Transfer',  gas: 21_000 },
  { label: 'ERC-20 Transfer', gas: 65_000 },
  { label: 'Token Approve', gas: 46_000 },
  { label: 'PancakeSwap',   gas: 140_000 },
]

function gweiToEth(gwei: number, gasUnits: number) {
  return (gwei * gasUnits) / 1e9
}

export function GasEstimator() {
  const { data: gasPrice, isLoading } = useGasPrice({ chainId: bscTestnet.id })
  const { usd: bnbPrice } = useLivePrice()

  const gweiVal = gasPrice ? Number(gasPrice) / 1e9 : null

  return (
    <div className="card">
      <div className="card-header-row">
        <h2>Gas Estimator</h2>
        <span className="badge badge-testnet">Testnet</span>
      </div>

      <div className="gas-price-row">
        <span className="muted">Current gas price</span>
        <span className="mono">
          {isLoading ? <span className="skeleton">0.0</span> : gweiVal !== null ? `${gweiVal.toFixed(2)} Gwei` : '—'}
        </span>
      </div>

      <div className="gas-table">
        <div className="gas-table-header">
          <span>Operation</span>
          <span>Gas Units</span>
          <span>tBNB Cost</span>
          <span>USD Est.</span>
        </div>
        {GAS_OPS.map(op => {
          const bnbCost = gweiVal !== null ? gweiToEth(gweiVal, op.gas) : null
          const usdCost = bnbCost !== null && bnbPrice ? bnbCost * bnbPrice : null
          return (
            <div key={op.label} className="gas-table-row">
              <span>{op.label}</span>
              <span className="mono muted">{op.gas.toLocaleString()}</span>
              <span className="mono">
                {bnbCost !== null ? bnbCost.toFixed(6) : <span className="skeleton">0.0000</span>}
              </span>
              <span className="mono">
                {usdCost !== null
                  ? `$${usdCost.toFixed(4)}`
                  : <span className="muted">—</span>}
              </span>
            </div>
          )
        })}
      </div>

      <p className="footnote">
        Estimates only · Actual gas may vary · Always check MetaMask before confirming
      </p>
    </div>
  )
}
