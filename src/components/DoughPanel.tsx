import { useEffect, useState } from 'react'
import {
  useAccount,
  useReadContract,
  useSimulateContract,
  useWriteContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import {
  DOUGH_DECIMALS,
  DOUGH_LP_TIMELOCK_ADDRESS,
  DOUGH_LP_TIMELOCK_OWNER,
  DOUGH_USDT_POOL_ADDRESS,
  FLARESCAN,
  FLARE_CHAIN_ID,
  FLARE_DOUGH_ADDRESS,
  USDT_FLARE_DECIMALS,
} from '../constants'
import { algebraPoolAbi } from '../abis/algebraPool'
import { lpTimelockAbi } from '../abis/lpTimelock'

// Algebra/Uniswap-V3 sqrtPriceX96 → USDT-per-DOUGH (human units).
// token0=USDT(6 dec), token1=DOUGH(18 dec). raw_price = S^2/2^192 gives raw
// DOUGH per raw USDT, so USDT per DOUGH = 2^192 × 10^(decDiff) / S^2 where
// decDiff = decimals1 - decimals0 = 12.
function usdtPerDough(sqrtPriceX96: bigint | undefined): number | null {
  if (!sqrtPriceX96 || sqrtPriceX96 === 0n) return null
  const Q192 = 1n << 192n
  const decDiff = 10n ** BigInt(DOUGH_DECIMALS - USDT_FLARE_DECIMALS)
  const scale = 10n ** 18n
  const scaled = (Q192 * decDiff * scale) / (sqrtPriceX96 * sqrtPriceX96)
  return Number(scaled) / 1e18
}

function fmtUsd(n: number | null, maxDigits = 4): string {
  if (n === null || !isFinite(n)) return '—'
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: maxDigits })
}

function fmtCompact(n: number | null): string {
  if (n === null || !isFinite(n)) return '—'
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K'
  return '$' + n.toFixed(2)
}

function fmtCountdown(unlockSec: bigint | undefined): { label: string; locked: boolean } {
  if (!unlockSec) return { label: '—', locked: false }
  const now = Math.floor(Date.now() / 1000)
  const diff = Number(unlockSec) - now
  if (diff <= 0) return { label: 'unlocked', locked: false }
  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  return { label: `${days}d ${hours}h`, locked: true }
}

export function DoughPanel() {
  const { address: connected, chainId: walletChain } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()

  // Tick once per minute so the unlock countdown stays current.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // ── Reads (chain-pinned, work regardless of connected wallet chain) ────────
  const { data: poolState } = useReadContract({
    chainId: FLARE_CHAIN_ID,
    address: DOUGH_USDT_POOL_ADDRESS,
    abi: algebraPoolAbi,
    functionName: 'globalState',
  })

  const { data: totalSupplyRaw } = useReadContract({
    chainId: FLARE_CHAIN_ID,
    address: FLARE_DOUGH_ADDRESS,
    abi: erc20Abi,
    functionName: 'totalSupply',
  })

  const { data: balanceRaw } = useReadContract({
    chainId: FLARE_CHAIN_ID,
    address: FLARE_DOUGH_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connected ? [connected] : undefined,
    query: { enabled: !!connected },
  })

  const { data: unlockTime } = useReadContract({
    chainId: FLARE_CHAIN_ID,
    address: DOUGH_LP_TIMELOCK_ADDRESS,
    abi: lpTimelockAbi,
    functionName: 'unlockTime',
  })

  // Pending fees: simulate the owner-only collect() with the owner as msg.sender.
  const {
    data: simData,
    refetch: refetchSim,
    isFetching: simLoading,
  } = useSimulateContract({
    chainId: FLARE_CHAIN_ID,
    address: DOUGH_LP_TIMELOCK_ADDRESS,
    abi: lpTimelockAbi,
    functionName: 'collectAllFeesToOwner',
    account: DOUGH_LP_TIMELOCK_OWNER,
  })

  const pending = simData?.result as readonly [bigint, bigint] | undefined
  const pendingUsdt  = pending ? Number(formatUnits(pending[0], USDT_FLARE_DECIMALS)) : null
  const pendingDough = pending ? Number(formatUnits(pending[1], DOUGH_DECIMALS)) : null

  const sqrtPrice = poolState?.[0] as bigint | undefined
  const price = usdtPerDough(sqrtPrice)
  const totalSupply = totalSupplyRaw ? Number(formatUnits(totalSupplyRaw, DOUGH_DECIMALS)) : null
  const mcap = price !== null && totalSupply !== null ? price * totalSupply : null
  const balance = balanceRaw ? Number(formatUnits(balanceRaw, DOUGH_DECIMALS)) : null
  const balanceUsd = balance !== null && price !== null ? balance * price : null

  // Pending fees in USDT terms (sum both sides for the "is it worth collecting?" hint).
  const pendingUsd =
    pendingUsdt !== null && pendingDough !== null && price !== null
      ? pendingUsdt + pendingDough * price
      : null

  const lock = fmtCountdown(unlockTime as bigint | undefined)

  // ── Write: Collect ─────────────────────────────────────────────────────────
  const isOwner = connected?.toLowerCase() === DOUGH_LP_TIMELOCK_OWNER.toLowerCase()
  const onFlare = walletChain === FLARE_CHAIN_ID

  const { writeContract, data: txHash, isPending: writing, error: writeErr, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (confirmed) refetchSim()
  }, [confirmed, refetchSim])

  const onCollect = () => {
    if (!simData?.request) return
    reset()
    writeContract(simData.request)
  }

  let buttonLabel: string
  let buttonDisabled = false
  let onClick: () => void = onCollect
  if (!connected) {
    buttonLabel = 'Connect wallet'
    buttonDisabled = true
  } else if (!isOwner) {
    buttonLabel = 'Owner-only'
    buttonDisabled = true
  } else if (!onFlare) {
    buttonLabel = switching ? 'Switching…' : 'Switch to Flare'
    onClick = () => switchChain({ chainId: FLARE_CHAIN_ID })
    buttonDisabled = switching
  } else if (writing || confirming) {
    buttonLabel = confirming ? 'Confirming…' : 'Submitting…'
    buttonDisabled = true
  } else if (!simData?.request) {
    buttonLabel = simLoading ? 'Simulating…' : 'Nothing to collect'
    buttonDisabled = true
  } else {
    buttonLabel = `Collect ≈ ${fmtUsd(pendingUsd, 2)}`
  }

  return (
    <div className="card">
      <h2>DOUGH · Flare</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '140px 1fr',
          rowGap: 6,
          columnGap: 12,
          fontSize: 13,
        }}
      >
        <span className="muted">Price</span>
        <span>{fmtUsd(price)} <span className="muted" style={{ fontSize: 11 }}>USDT</span></span>

        <span className="muted">Market cap</span>
        <span>
          {fmtCompact(mcap)}
          {totalSupply !== null && (
            <span className="muted" style={{ fontSize: 11 }}>
              {' · supply '}{totalSupply.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          )}
        </span>

        <span className="muted">Your balance</span>
        <span>
          {connected ? (
            balance !== null ? (
              <>
                {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} DOUGH
                {balanceUsd !== null && (
                  <span className="muted" style={{ fontSize: 11 }}>
                    {' · '}{fmtUsd(balanceUsd, 2)}
                  </span>
                )}
              </>
            ) : (
              <span className="muted">loading…</span>
            )
          ) : (
            <span className="muted">connect wallet to view</span>
          )}
        </span>

        <span className="muted">LP unlock</span>
        <span style={{ color: lock.locked ? 'var(--accent, #d97706)' : 'var(--green)' }}>
          {lock.label}
        </span>

        <span className="muted">Pending fees</span>
        <span>
          {pending ? (
            <>
              {pendingDough?.toFixed(4)} DOUGH{' · '}{pendingUsdt?.toFixed(4)} USDT
              {pendingUsd !== null && (
                <span className="muted" style={{ fontSize: 11 }}>{' · ≈ '}{fmtUsd(pendingUsd, 2)}</span>
              )}
            </>
          ) : (
            <span className="muted">{simLoading ? 'simulating…' : 'none'}</span>
          )}
        </span>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn"
          onClick={onClick}
          disabled={buttonDisabled}
          style={{ minWidth: 180 }}
        >
          {buttonLabel}
        </button>
        {txHash && (
          <a
            href={`${FLARESCAN}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="muted"
            style={{ fontSize: 12 }}
          >
            View tx ↗
          </a>
        )}
        {writeErr && (
          <span className="muted" style={{ color: 'var(--red)', fontSize: 12 }}>
            {writeErr.message.split('\n')[0]}
          </span>
        )}
      </div>
    </div>
  )
}
