import { useState } from 'react'
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useWriteContract,
} from 'wagmi'
import { parseEther, parseUnits, isAddress, erc20Abi } from 'viem'
import { TESTNET_TOKENS, BSC_TOKENS } from '../constants'
import { useLivePrice } from '../hooks/useLivePrice'
import { usePaperTrading } from '../hooks/usePaperTrading'
import { TxConfirmModal } from './TxConfirmModal'
import { TxStatus } from './TxStatus'
import { SwapWarningModal } from './SwapWarningModal'

type Side = 'buy' | 'sell'
type TradingMode = 'paper' | 'real'

const PAPER_SYMBOLS = ['tBNB', 'WBNB', 'USDT', 'BUSD']

export function TradingPanel() {
  const { isConnected } = useAccount()
  const [mode, setMode] = useState<TradingMode>('paper')

  return (
    <div className="card trading-card">
      <div className="trading-header">
        <h2>Trade</h2>
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 'paper' ? 'mode-btn-active' : ''}`}
            onClick={() => setMode('paper')}
          >
            Paper Mode
          </button>
          <button
            className={`mode-btn ${mode === 'real' ? 'mode-btn-real-active' : ''}`}
            onClick={() => setMode('real')}
            disabled={!isConnected}
            title={!isConnected ? 'Connect wallet to use real mode' : undefined}
          >
            Real Mode
          </button>
        </div>
      </div>

      {mode === 'paper' && <PaperTradingPanel />}
      {mode === 'real' && isConnected && <RealTradingPanel />}
      {mode === 'real' && !isConnected && (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Connect your wallet to use real mode.
        </p>
      )}
    </div>
  )
}

// ── Paper Trading ──────────────────────────────────────────────────────────────

function PaperTradingPanel() {
  const [side, setSide] = useState<Side>('buy')
  const [symbol, setSymbol] = useState('tBNB')
  const [amount, setAmount] = useState('')
  const [lastResult, setLastResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const { usd: bnbPrice } = useLivePrice()
  const { portfolio, executeTrade, reset, totalValue } = usePaperTrading()

  const getPrice = (sym: string) => {
    if (sym === 'USDT' || sym === 'BUSD') return 1
    return bnbPrice ?? 0
  }

  const tokenPrice = getPrice(symbol)
  const numAmount = parseFloat(amount) || 0
  const total = numAmount * tokenPrice

  const canTrade =
    numAmount > 0 &&
    tokenPrice > 0 &&
    (side === 'buy'
      ? total <= portfolio.cash
      : (portfolio.holdings[symbol] ?? 0) >= numAmount)

  function handleTrade() {
    if (!canTrade) return
    const result = executeTrade(side, symbol, numAmount, tokenPrice)
    if (result.ok) {
      setLastResult({ ok: true, msg: `${side === 'buy' ? 'Bought' : 'Sold'} ${numAmount} ${symbol} @ $${tokenPrice.toFixed(2)}` })
      setAmount('')
    } else {
      setLastResult({ ok: false, msg: result.error ?? 'Trade failed' })
    }
    setTimeout(() => setLastResult(null), 4000)
  }

  return (
    <div>
      <div className="paper-badge-row">
        <span className="badge badge-paper">PAPER MODE — No real funds</span>
        <button className="btn-text danger-text" onClick={reset} title="Reset portfolio to $10,000">
          Reset
        </button>
      </div>

      {/* Portfolio summary */}
      <div className="paper-portfolio">
        <div className="paper-stat">
          <span className="paper-stat-label">Cash</span>
          <span className="paper-stat-val">
            ${portfolio.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="paper-stat">
          <span className="paper-stat-label">Total Value</span>
          <span className="paper-stat-val">
            ${totalValue(bnbPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        {Object.entries(portfolio.holdings).map(([sym, amt]) => (
          <div key={sym} className="paper-stat">
            <span className="paper-stat-label">{sym}</span>
            <span className="paper-stat-val mono">{amt.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {/* Buy/Sell toggle */}
      <div className="side-toggle">
        <button
          className={`side-btn ${side === 'buy' ? 'side-btn-buy' : ''}`}
          onClick={() => setSide('buy')}
        >
          Buy
        </button>
        <button
          className={`side-btn ${side === 'sell' ? 'side-btn-sell' : ''}`}
          onClick={() => setSide('sell')}
        >
          Sell
        </button>
      </div>

      {/* Token */}
      <div className="form-group" style={{ marginTop: 12 }}>
        <label className="form-label">Token</label>
        <select
          className="form-select"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
        >
          {PAPER_SYMBOLS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="form-hint">
          Price: {tokenPrice > 0 ? `$${tokenPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Loading…'}
          {side === 'sell' && ` · Holding: ${(portfolio.holdings[symbol] ?? 0).toFixed(6)} ${symbol}`}
        </span>
      </div>

      {/* Amount */}
      <div className="form-group">
        <label className="form-label">Amount ({symbol})</label>
        <div className="input-row">
          <input
            className="form-input"
            type="number"
            min="0"
            step="any"
            placeholder="0.0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          {side === 'sell' && portfolio.holdings[symbol] && (
            <button
              className="btn-text"
              type="button"
              onClick={() => setAmount(String(portfolio.holdings[symbol]))}
            >
              MAX
            </button>
          )}
        </div>
      </div>

      {/* Total */}
      {numAmount > 0 && tokenPrice > 0 && (
        <div className="trade-total">
          <span className="muted">Total</span>
          <span className="mono">
            ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      <button
        className={`btn btn-trade-full ${side === 'buy' ? 'btn-buy' : 'btn-sell'}`}
        disabled={!canTrade}
        onClick={handleTrade}
      >
        {side === 'buy' ? `Buy ${symbol}` : `Sell ${symbol}`}
      </button>

      {lastResult && (
        <div className={`trade-result ${lastResult.ok ? 'trade-result-ok' : 'trade-result-err'}`}>
          {lastResult.ok ? '✓' : '✗'} {lastResult.msg}
        </div>
      )}

      {/* Recent paper trades */}
      {portfolio.trades.length > 0 && (
        <div className="paper-trades">
          <h3 className="paper-trades-title">Recent Paper Trades</h3>
          {portfolio.trades.slice(0, 8).map(t => (
            <div key={t.id} className="paper-trade-row">
              <span className={`tx-direction ${t.side === 'buy' ? 'tx-in' : 'tx-out'}`}>
                {t.side === 'buy' ? 'BUY' : 'SELL'}
              </span>
              <span className="mono">{t.amount.toFixed(4)} {t.symbol}</span>
              <span className="muted">@ ${t.price.toFixed(2)}</span>
              <span className="mono">${t.total.toFixed(2)}</span>
              <span className="muted small">
                {new Date(t.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Real Trading ───────────────────────────────────────────────────────────────

type TokenOption =
  | { symbol: 'tBNB'; address: 'native'; decimals: 18 }
  | (typeof BSC_TOKENS)[number]

const TOKEN_OPTIONS: TokenOption[] = [
  { symbol: 'tBNB', address: 'native', decimals: 18 },
  ...BSC_TOKENS,
]

function RealTradingPanel() {
  const { address } = useAccount()
  const [token, setToken] = useState<TokenOption>(TOKEN_OPTIONS[0])
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [showWarning, setShowWarning] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const isNative = token.address === 'native'

  const { data: balance } = useBalance({
    address,
    token: isNative ? undefined : (token.address as `0x${string}`),
    query: { enabled: !!address },
  })

  const { sendTransaction, isPending: isSendingNative, error: nativeError, reset: resetNative } = useSendTransaction()
  const { writeContract, isPending: isSendingToken, error: tokenError, reset: resetToken } = useWriteContract()

  const isPending = isSendingNative || isSendingToken
  const sendError = nativeError || tokenError

  const recipientOk = isAddress(recipient)
  const amountOk = Number(amount) > 0
  const hasBalance = !balance || parseFloat(amount) <= parseFloat(balance.formatted)
  const canReview = recipientOk && amountOk && hasBalance && !txHash

  function handleConfirm() {
    if (!isAddress(recipient)) return
    const callbacks = {
      onSuccess: (hash: `0x${string}`) => { setTxHash(hash); setShowConfirm(false) },
      onError: () => setShowConfirm(false),
    }
    if (isNative) {
      sendTransaction({ to: recipient, value: parseEther(amount) }, callbacks)
    } else {
      writeContract({
        address: token.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, parseUnits(amount, token.decimals)],
      }, callbacks)
    }
  }

  function reset() {
    setTxHash(undefined); setRecipient(''); setAmount(''); resetNative(); resetToken()
  }

  return (
    <div>
      <div className="real-mode-banner">
        ⚠ <strong>Real Mode</strong> — BNB Testnet only · Every action requires MetaMask confirmation
      </div>

      {/* Token */}
      <div className="form-group" style={{ marginTop: 12 }}>
        <label className="form-label">Token</label>
        <select
          className="form-select"
          value={token.symbol}
          onChange={e => {
            const found = TOKEN_OPTIONS.find(t => t.symbol === e.target.value)
            if (found) setToken(found)
          }}
          disabled={isPending}
        >
          {TOKEN_OPTIONS.map(t => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
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
          className={`form-input${recipient && !recipientOk ? ' input-error' : ''}`}
          type="text"
          placeholder="0x…"
          value={recipient}
          onChange={e => setRecipient(e.target.value.trim())}
          spellCheck={false}
          autoComplete="off"
          disabled={isPending}
        />
        {recipient && !recipientOk && <span className="form-error">Not a valid address</span>}
        {recipientOk && <span className="form-ok">✓ Valid address</span>}
      </div>

      {/* Amount */}
      <div className="form-group">
        <label className="form-label">Amount</label>
        <div className="input-row">
          <input
            className={`form-input${amount && !amountOk ? ' input-error' : ''}`}
            type="number"
            min="0"
            step="any"
            placeholder="0.0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={isPending}
          />
          {balance && (
            <button className="btn-text" type="button" onClick={() => setAmount(balance.formatted)} disabled={isPending}>
              MAX
            </button>
          )}
        </div>
        {!hasBalance && balance && (
          <span className="form-error">Exceeds balance ({parseFloat(balance.formatted).toFixed(6)} {token.symbol})</span>
        )}
      </div>

      {sendError && (
        <p className="form-error" style={{ marginBottom: 12 }}>
          {sendError.message.slice(0, 160)}
        </p>
      )}

      <button
        className="btn btn-connect"
        style={{ width: '100%', justifyContent: 'center' }}
        disabled={!canReview || isPending}
        onClick={() => setShowWarning(true)}
      >
        Review Transaction
      </button>

      <TxStatus hash={txHash} onDone={reset} />

      {showWarning && (
        <SwapWarningModal
          action={`Send ${amount} ${token.symbol}`}
          to={recipient}
          onConfirm={() => { setShowWarning(false); setShowConfirm(true) }}
          onCancel={() => setShowWarning(false)}
        />
      )}

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
