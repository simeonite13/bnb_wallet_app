import { useMemo, useState } from 'react'
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useWriteContract,
} from 'wagmi'
import { parseEther, parseUnits, isAddress, erc20Abi } from 'viem'
import { useChainAssets } from '../hooks/useChainAssets'
import { TxConfirmModal } from './TxConfirmModal'
import { TxStatus } from './TxStatus'

type TokenOption = {
  symbol: string
  address: `0x${string}` | 'native'
  decimals: number
}

export function SendPanel() {
  const { address } = useAccount()
  const { tokens: chainTokens, isMainnet } = useChainAssets()

  const tokenOptions: TokenOption[] = useMemo(() => {
    const nativeSym = isMainnet ? 'BNB' : 'tBNB'
    const native: TokenOption = { symbol: nativeSym, address: 'native', decimals: 18 }
    const erc20s: TokenOption[] = chainTokens
      .filter(t => t.address !== 'native')
      .map(t => ({ symbol: t.symbol, address: t.address, decimals: t.decimals }))
    return [native, ...erc20s]
  }, [chainTokens, isMainnet])

  const [tokenSymbol, setTokenSymbol] = useState<string>(tokenOptions[0].symbol)
  const token = tokenOptions.find(t => t.symbol === tokenSymbol) ?? tokenOptions[0]
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount]       = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [txHash, setTxHash]       = useState<`0x${string}` | undefined>()

  const isNative = token.address === 'native'

  // ── Balance of selected token ───────────────────────────────────────
  const { data: balance } = useBalance({
    address,
    token: isNative ? undefined : (token.address as `0x${string}`),
    query: { enabled: !!address },
  })

  // ── Wagmi send hooks ────────────────────────────────────────────────
  const {
    sendTransaction,
    isPending: isSendingNative,
    error: nativeError,
    reset: resetNative,
  } = useSendTransaction()

  const {
    writeContract,
    isPending: isSendingToken,
    error: tokenError,
    reset: resetToken,
  } = useWriteContract()

  const isPending = isSendingNative || isSendingToken
  const sendError = nativeError || tokenError

  // ── Validation ──────────────────────────────────────────────────────
  const recipientTouched = recipient.length > 0
  const amountTouched    = amount.length > 0

  const recipientError: string | null =
    recipientTouched && !isAddress(recipient) ? 'Not a valid address' : null

  const amountError: string | null =
    amountTouched && (isNaN(Number(amount)) || Number(amount) <= 0)
      ? 'Enter a positive number'
      : null

  const balanceError: string | null =
    balance && amountTouched && !amountError && parseFloat(amount) > parseFloat(balance.formatted)
      ? `Exceeds balance (${parseFloat(balance.formatted).toFixed(6)} ${token.symbol})`
      : null

  const canReview =
    isAddress(recipient) &&
    Number(amount) > 0 &&
    !balanceError &&
    !txHash

  // ── Send ────────────────────────────────────────────────────────────
  function handleConfirm() {
    if (!isAddress(recipient)) return

    const callbacks = {
      onSuccess: (hash: `0x${string}`) => {
        setTxHash(hash)
        setShowConfirm(false)
      },
      onError: () => setShowConfirm(false),
    }

    if (isNative) {
      sendTransaction({ to: recipient, value: parseEther(amount) }, callbacks)
    } else {
      writeContract(
        {
          address: token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [recipient as `0x${string}`, parseUnits(amount, token.decimals)],
        },
        callbacks,
      )
    }
  }

  function reset() {
    setTxHash(undefined)
    setRecipient('')
    setAmount('')
    resetNative()
    resetToken()
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="card">
      <h2>Send</h2>

      {/* Token selector */}
      <div className="form-group">
        <label className="form-label">Token</label>
        <select
          className="form-select"
          value={token.symbol}
          onChange={(e) => setTokenSymbol(e.target.value)}
          disabled={isPending}
        >
          {tokenOptions.map((t) => (
            <option key={t.symbol} value={t.symbol}>
              {t.symbol}
            </option>
          ))}
        </select>
        {balance && (
          <span className="form-hint">
            Balance: {parseFloat(balance.formatted).toFixed(6)} {token.symbol}
          </span>
        )}
      </div>

      {/* Recipient */}
      <div className="form-group">
        <label className="form-label">Recipient Address</label>
        <input
          className={`form-input${recipientError ? ' input-error' : ''}`}
          type="text"
          placeholder="0x…"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value.trim())}
          spellCheck={false}
          autoComplete="off"
          disabled={isPending}
        />
        {recipientError && <span className="form-error">{recipientError}</span>}
        {recipient && isAddress(recipient) && (
          <span className="form-ok">✓ Valid address</span>
        )}
      </div>

      {/* Amount */}
      <div className="form-group">
        <label className="form-label">Amount</label>
        <div className="input-row">
          <input
            className={`form-input${amountError || balanceError ? ' input-error' : ''}`}
            type="number"
            min="0"
            step="any"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
          />
          {balance && (
            <button
              className="btn-text"
              type="button"
              onClick={() => setAmount(balance.formatted)}
              disabled={isPending}
            >
              MAX
            </button>
          )}
        </div>
        {(amountError || balanceError) && (
          <span className="form-error">{amountError ?? balanceError}</span>
        )}
        {isNative && (
          <span className="form-hint">
            Leave enough BNB to cover gas. Using MAX may cause the transaction to fail.
          </span>
        )}
      </div>

      {/* API / wallet error */}
      {sendError && (
        <p className="form-error" style={{ marginBottom: 12 }}>
          {sendError.message.slice(0, 160)}
        </p>
      )}

      <button
        className="btn btn-connect"
        style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
        disabled={!canReview || isPending}
        onClick={() => setShowConfirm(true)}
      >
        Review Transaction
      </button>

      <TxStatus hash={txHash} onDone={reset} />

      {/* Confirmation modal */}
      {showConfirm && address && (
        <TxConfirmModal
          from={address}
          to={recipient}
          amount={amount}
          symbol={token.symbol}
          isPending={isPending}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}
