// Token list shape used across the dashboard
export type ChainToken = {
  symbol: string
  address: `0x${string}` | 'native'
  decimals: number
  label: string
}

// ── BSC Testnet (Chain ID 97) ────────────────────────────────────────────────
export const TESTNET_TOKENS: ChainToken[] = [
  { symbol: 'tBNB', address: 'native',                                       decimals: 18, label: 'Native Token' },
  { symbol: 'USDT', address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', decimals: 18, label: 'Tether USD' },
  { symbol: 'BUSD', address: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee', decimals: 18, label: 'Binance USD' },
  { symbol: 'WBNB', address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd', decimals: 18, label: 'Wrapped BNB' },
  { symbol: 'CAKE', address: '0xa35062141Fa33BCA92Ce69FeD37D0E8908868AAe', decimals: 18, label: 'PancakeSwap' },
]

// ── BSC Mainnet (Chain ID 56) ────────────────────────────────────────────────
export const MAINNET_TOKENS: ChainToken[] = [
  { symbol: 'BNB',  address: 'native',                                       decimals: 18, label: 'Native Token' },
  { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, label: 'Tether USD (BEP-20)' },
  { symbol: 'BUSD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18, label: 'Binance USD' },
  { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18, label: 'Wrapped BNB' },
  { symbol: 'CAKE', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18, label: 'PancakeSwap' },
]

// ERC20 subset (no native) — kept as the legacy default for back-compat.
// New code should prefer useChainAssets() for chain-correct values.
const erc20Only = (list: ChainToken[]) =>
  list.filter(
    (t): t is { symbol: string; address: `0x${string}`; decimals: number; label: string } =>
      t.address !== 'native',
  )

export const TESTNET_BSC_TOKENS = erc20Only(TESTNET_TOKENS)
export const MAINNET_BSC_TOKENS = erc20Only(MAINNET_TOKENS)
export const BSC_TOKENS = TESTNET_BSC_TOKENS

// Approximate prices for paper trading (refreshed by useLivePrice hook at runtime).
// Network-agnostic: BNB / tBNB share the same fallback.
export const PAPER_PRICE_FALLBACKS: Record<string, number> = {
  tBNB: 600,
  BNB:  600,
  USDT: 1,
  BUSD: 1,
  WBNB: 600,
  CAKE: 2.5,
}

// ── Block explorers ──────────────────────────────────────────────────────────
export const BSCSCAN_TESTNET     = 'https://testnet.bscscan.com'
export const BSCSCAN_TESTNET_API = 'https://api-testnet.bscscan.com/api'
export const BSCSCAN_MAINNET     = 'https://bscscan.com'
export const BSCSCAN_MAINNET_API = 'https://api.bscscan.com/api'

// Faucet only exists on testnet.
export const FAUCET_URL = 'https://testnet.bnbchain.org/faucet-smart'
