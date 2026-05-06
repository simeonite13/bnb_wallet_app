import { useState, useRef } from 'react'

export interface PaperTrade {
  id: string
  timestamp: number
  side: 'buy' | 'sell'
  symbol: string
  amount: number
  price: number
  total: number
}

export interface PaperPortfolio {
  cash: number
  holdings: Record<string, number>
  trades: PaperTrade[]
}

const STORAGE_KEY = 'bnb_dash_paper_v1'

const INITIAL: PaperPortfolio = {
  cash: 10_000,
  holdings: {},
  trades: [],
}

function load(): PaperPortfolio {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { ...INITIAL, holdings: {}, trades: [] }
}

function persist(p: PaperPortfolio) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

export function usePaperTrading() {
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(load)
  const ref = useRef(portfolio)
  ref.current = portfolio

  function executeTrade(
    side: 'buy' | 'sell',
    symbol: string,
    amount: number,
    price: number
  ): { ok: boolean; error?: string } {
    const prev = ref.current
    const total = amount * price

    if (side === 'buy') {
      if (prev.cash < total)
        return { ok: false, error: `Insufficient cash — have $${prev.cash.toFixed(2)}, need $${total.toFixed(2)}` }
    } else {
      const held = prev.holdings[symbol] ?? 0
      if (held < amount)
        return { ok: false, error: `Insufficient ${symbol} — have ${held.toFixed(6)}, need ${amount.toFixed(6)}` }
    }

    const next: PaperPortfolio = {
      cash: side === 'buy' ? prev.cash - total : prev.cash + total,
      holdings: { ...prev.holdings },
      trades: [...prev.trades],
    }

    if (side === 'buy') {
      next.holdings[symbol] = (next.holdings[symbol] ?? 0) + amount
    } else {
      next.holdings[symbol] = (next.holdings[symbol] ?? 0) - amount
      if (next.holdings[symbol] <= 0) delete next.holdings[symbol]
    }

    next.trades.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      side,
      symbol,
      amount,
      price,
      total,
    })

    persist(next)
    setPortfolio(next)
    return { ok: true }
  }

  function reset() {
    const fresh = { ...INITIAL, holdings: {}, trades: [] }
    persist(fresh)
    setPortfolio(fresh)
  }

  function totalValue(bnbPrice: number | null): number {
    if (!bnbPrice) return portfolio.cash
    const holdingsValue = Object.entries(portfolio.holdings).reduce((sum, [sym, amt]) => {
      if (sym === 'tBNB' || sym === 'WBNB') return sum + amt * bnbPrice
      if (sym === 'USDT' || sym === 'BUSD') return sum + amt
      return sum + amt * bnbPrice * 0.1  // rough estimate for others
    }, 0)
    return portfolio.cash + holdingsValue
  }

  return { portfolio, executeTrade, reset, totalValue }
}
