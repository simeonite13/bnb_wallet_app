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

// ── Flare mainnet (Chain ID 14) — for the DOUGH panel ───────────────────────
export const FLARE_CHAIN_ID = 14 as const

export const FLARE_USDT_ADDRESS  = '0x0B38e83B86d491735fEaa0a791F65c2B99535396' as const
export const FLARE_DOUGH_ADDRESS = '0x736e97f3c938580FDC186F7AC336fB6b925c4DDB' as const

// SparkDEX (Algebra-protocol) — DOUGH/USDT pool + factory + NPM
export const SPARKDEX_FACTORY        = '0x805488DaA81c1b9e7C5cE3f1DCeA28F21448EC6A' as const
export const SPARKDEX_NPM            = '0x49BE8AA6c684b15e0C5450e8Fa0b16Bec1435596' as const
export const DOUGH_USDT_POOL_ADDRESS = '0x5a480725B08D8a1c133975E4C1204F2bDCe05468' as const

// LPTimelock holds the DOUGH/USDT LP NFT (tokenId 3840). collectAllFeesToOwner
// is onlyOwner — UI gates the write button on the connected wallet matching this.
export const DOUGH_LP_TIMELOCK_ADDRESS = '0x7baf8f1b60909bcee3c1c4fd8348ef7b1441c1d1' as const
export const DOUGH_LP_TIMELOCK_OWNER   = '0xA80e1fE3c189F360b88916f9eE398675fB8a8113' as const

// Pool is sorted token0=USDT (6 dec), token1=DOUGH (18 dec).
export const DOUGH_DECIMALS = 18
export const USDT_FLARE_DECIMALS = 6

// Block explorer for tx + address links.
export const FLARESCAN = 'https://flare-explorer.flare.network'
export const flarescanAddress = (addr: string) => `${FLARESCAN}/address/${addr}`
export const flarescanTx = (hash: string) => `${FLARESCAN}/tx/${hash}`

// SparkDEX swap UI deep-link. Uniswap-style query params, which is the standard
// for Algebra-fork UIs. If SparkDEX changes their URL scheme, update here only.
export const SPARKDEX_SWAP_BASE = 'https://sparkdex.ai/swap'
export const sparkdexSwapUrl = (inputAddr: string, outputAddr: string) =>
  `${SPARKDEX_SWAP_BASE}?inputCurrency=${inputAddr}&outputCurrency=${outputAddr}`

// DexScreener embed for the pool. ?embed=1 hides their site chrome so the
// iframe shows just the candle chart.
export const dexscreenerEmbedUrl = (poolAddr: string) =>
  `https://dexscreener.com/flare/${poolAddr}?embed=1&theme=dark&trades=0&info=0`
