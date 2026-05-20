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
  ALGEBRA_MAX_TICK,
  ALGEBRA_MIN_TICK,
  DOUGH_DECIMALS,
  DOUGH_LP_TIMELOCK_ADDRESS,
  DOUGH_LP_TIMELOCK_OWNER,
  DOUGH_LP_TOKEN_ID,
  DOUGH_USDT_POOL_ADDRESS,
  FLARE_CHAIN_ID,
  FLARE_DOUGH_ADDRESS,
  FLARE_USDT_ADDRESS,
  SPARKDEX_NPM,
  USDT_FLARE_DECIMALS,
  dexscreenerEmbedUrl,
  flarescanAddress,
  flarescanNftInstance,
  flarescanTx,
  sparkdexSwapUrl,
} from '../constants'
import { algebraPoolAbi } from '../abis/algebraPool'
import { lpTimelockAbi } from '../abis/lpTimelock'
import { nonfungiblePositionManagerAbi } from '../abis/nonfungiblePositionManager'
import { usdtPerDough } from '../lib/dough'

function fmtUsd(n: number | null, maxDigits = 4): string {
  if (n === null || !isFinite(n)) return '—'
  // Sub-cent values would round to "$0" with the default 4 digits, which
  // misrepresents tokens like DOUGH that trade at ~$0.00001. Auto-expand
  // to keep at least 3 significant digits past the decimal.
  if (n > 0 && n < 0.01) {
    const order = Math.floor(Math.log10(n)) // e.g. 0.00001 → -5
    maxDigits = Math.max(maxDigits, -order + 2)
  }
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

  // Pool reserves → TVL. balanceOf the pool for each token, valued at current price.
  const { data: poolUsdtRaw } = useReadContract({
    chainId: FLARE_CHAIN_ID,
    address: FLARE_USDT_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [DOUGH_USDT_POOL_ADDRESS],
  })
  const { data: poolDoughRaw } = useReadContract({
    chainId: FLARE_CHAIN_ID,
    address: FLARE_DOUGH_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [DOUGH_USDT_POOL_ADDRESS],
  })

  const { data: unlockTime } = useReadContract({
    chainId: FLARE_CHAIN_ID,
    address: DOUGH_LP_TIMELOCK_ADDRESS,
    abi: lpTimelockAbi,
    functionName: 'unlockTime',
  })

  // LP NFT 3840 — SparkDEX UI won't surface it because ownerOf == timelock
  // contract (not the connected EOA). Pulling it directly so the panel always
  // shows the underlying position regardless of which wallet is connected.
  const { data: nftOwner } = useReadContract({
    chainId: FLARE_CHAIN_ID,
    address: SPARKDEX_NPM,
    abi: nonfungiblePositionManagerAbi,
    functionName: 'ownerOf',
    args: [DOUGH_LP_TOKEN_ID],
  })
  const { data: positionData } = useReadContract({
    chainId: FLARE_CHAIN_ID,
    address: SPARKDEX_NPM,
    abi: nonfungiblePositionManagerAbi,
    functionName: 'positions',
    args: [DOUGH_LP_TOKEN_ID],
  })
  const positionTickLower = positionData?.[5] as number | undefined
  const positionTickUpper = positionData?.[6] as number | undefined
  const positionLiquidity = positionData?.[7] as bigint | undefined
  const ownedByTimelock =
    typeof nftOwner === 'string' &&
    nftOwner.toLowerCase() === DOUGH_LP_TIMELOCK_ADDRESS.toLowerCase()
  const isFullRange =
    positionTickLower === ALGEBRA_MIN_TICK && positionTickUpper === ALGEBRA_MAX_TICK

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

  const poolUsdt  = poolUsdtRaw  ? Number(formatUnits(poolUsdtRaw,  USDT_FLARE_DECIMALS)) : null
  const poolDough = poolDoughRaw ? Number(formatUnits(poolDoughRaw, DOUGH_DECIMALS))      : null
  const tvl =
    poolUsdt !== null && poolDough !== null && price !== null
      ? poolUsdt + poolDough * price
      : null

  // Inline buy preview: USDT input → DOUGH output at current spot (no slippage).
  // Actual trade goes through SparkDEX so users see the real quote + price impact there.
  const [usdtIn, setUsdtIn] = useState('')
  const usdtInNum = Number(usdtIn)
  const doughOut =
    Number.isFinite(usdtInNum) && usdtInNum > 0 && price !== null && price > 0
      ? usdtInNum / price
      : null

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

        <span className="muted">Pool TVL</span>
        <span>
          {fmtCompact(tvl)}
          {poolUsdt !== null && poolDough !== null && (
            <span className="muted" style={{ fontSize: 11 }}>
              {' · '}{poolUsdt.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDT
              {' + '}{poolDough.toLocaleString(undefined, { maximumFractionDigits: 0 })} DOUGH
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

      {/* ── LP position (NFT 3840) — held by timelock, hidden in SparkDEX UI ── */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border, #2a2a2a)' }}>
        <div className="muted" style={{ fontSize: 11, marginBottom: 8, letterSpacing: 0.4 }}>
          LP POSITION (NFT #{DOUGH_LP_TOKEN_ID.toString()})
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            rowGap: 6,
            columnGap: 12,
            fontSize: 13,
          }}
        >
          <span className="muted">Token ID</span>
          <span>
            <a
              href={flarescanNftInstance(SPARKDEX_NPM, DOUGH_LP_TOKEN_ID)}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit' }}
            >
              #{DOUGH_LP_TOKEN_ID.toString()} ↗
            </a>
          </span>

          <span className="muted">Held by</span>
          <span>
            {nftOwner ? (
              <>
                <a
                  href={flarescanAddress(nftOwner as string)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'inherit', fontFamily: 'monospace', fontSize: 12 }}
                >
                  {(nftOwner as string).slice(0, 6)}…{(nftOwner as string).slice(-4)} ↗
                </a>
                <span
                  className="muted"
                  style={{ fontSize: 11, marginLeft: 6 }}
                  title="The NFT is owned by the LPTimelock contract, not by an EOA. SparkDEX UI iterates positions on the connected wallet, so it never sees this one — by design."
                >
                  {ownedByTimelock ? '· timelock (intended)' : '· UNEXPECTED OWNER'}
                </span>
              </>
            ) : (
              <span className="muted">loading…</span>
            )}
          </span>

          <span className="muted">Range</span>
          <span>
            {positionTickLower !== undefined && positionTickUpper !== undefined ? (
              <>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  [{positionTickLower}, {positionTickUpper}]
                </span>
                <span
                  className="muted"
                  style={{ fontSize: 11, marginLeft: 8 }}
                  title="Full-range = always in range; the position never goes out of band on a price move."
                >
                  {isFullRange ? '· full-range' : '· narrow'}
                </span>
              </>
            ) : (
              <span className="muted">loading…</span>
            )}
          </span>

          <span className="muted">Liquidity</span>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {positionLiquidity !== undefined
              ? positionLiquidity.toString()
              : <span className="muted">loading…</span>}
          </span>

          <span className="muted">Pool</span>
          <span>
            <a
              href={flarescanAddress(DOUGH_USDT_POOL_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', fontFamily: 'monospace', fontSize: 12 }}
            >
              {DOUGH_USDT_POOL_ADDRESS.slice(0, 6)}…{DOUGH_USDT_POOL_ADDRESS.slice(-4)} ↗
            </a>
          </span>
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          SparkDEX's "My Positions" page reads <code>ownerOf</code> on the connected wallet — since the NFT lives in the timelock contract, it never appears there. This panel reads it directly.
        </p>
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
            href={flarescanTx(txHash)}
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

      {/* ── Buy DOUGH (inline preview, swap on SparkDEX) ───────────────────── */}
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border, #2a2a2a)' }}>
        <div className="muted" style={{ fontSize: 11, marginBottom: 8, letterSpacing: 0.4 }}>
          BUY DOUGH WITH USDT
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '0 1 180px' }}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0.00"
              value={usdtIn}
              onChange={(e) => setUsdtIn(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 50px 8px 10px',
                fontSize: 14,
                background: 'var(--bg-2, #1a1a1a)',
                color: 'var(--text, #e5e5e5)',
                border: '1px solid var(--border, #2a2a2a)',
                borderRadius: 6,
                fontFamily: 'inherit',
              }}
            />
            <span
              className="muted"
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}
            >
              USDT
            </span>
          </div>
          <span className="muted" aria-hidden style={{ fontSize: 18 }}>→</span>
          <span style={{ fontSize: 14, minWidth: 120 }}>
            {doughOut !== null
              ? <>{doughOut.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="muted" style={{ fontSize: 11 }}>DOUGH</span></>
              : <span className="muted">— DOUGH</span>}
          </span>
          <a
            className="btn"
            href={sparkdexSwapUrl(FLARE_USDT_ADDRESS, FLARE_DOUGH_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            style={{ minWidth: 180, textAlign: 'center', textDecoration: 'none' }}
          >
            Trade on SparkDEX ↗
          </a>
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          Preview is spot price only — actual quote, slippage, and price impact happen on SparkDEX.
        </p>
      </div>

      {/* ── DexScreener chart ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 18 }}>
        <div className="muted" style={{ fontSize: 11, marginBottom: 8, letterSpacing: 0.4 }}>
          MARKET (DEXSCREENER)
        </div>
        <iframe
          title="DOUGH/USDT chart"
          src={dexscreenerEmbedUrl(DOUGH_USDT_POOL_ADDRESS)}
          loading="lazy"
          style={{
            width: '100%',
            height: 380,
            border: '1px solid var(--border, #2a2a2a)',
            borderRadius: 8,
            background: '#0f0f0f',
          }}
        />
      </div>

      {/* ── Block-explorer links ──────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          fontSize: 12,
        }}
      >
        <a href={flarescanAddress(FLARE_DOUGH_ADDRESS)} target="_blank" rel="noreferrer" className="muted">
          Token contract ↗
        </a>
        <a href={flarescanAddress(DOUGH_USDT_POOL_ADDRESS)} target="_blank" rel="noreferrer" className="muted">
          Pool ↗
        </a>
        <a href={flarescanAddress(DOUGH_LP_TIMELOCK_ADDRESS)} target="_blank" rel="noreferrer" className="muted">
          LP timelock ↗
        </a>
      </div>
    </div>
  )
}
