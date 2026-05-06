// BSC Testnet (Chain ID 97) well-known token addresses
export const TESTNET_TOKENS: {
  symbol: string
  address: `0x${string}` | 'native'
  decimals: number
  label: string
}[] = [
  { symbol: 'tBNB', address: 'native',                                       decimals: 18, label: 'Native Token' },
  { symbol: 'USDT', address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', decimals: 18, label: 'Tether USD' },
  { symbol: 'BUSD', address: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee', decimals: 18, label: 'Binance USD' },
  { symbol: 'WBNB', address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd', decimals: 18, label: 'Wrapped BNB' },
  { symbol: 'CAKE', address: '0xa35062141Fa33BCA92Ce69FeD37D0E8908868AAe', decimals: 18, label: 'PancakeSwap' },
]

// ERC20 subset (no native)
export const BSC_TOKENS = TESTNET_TOKENS.filter(
  (t): t is { symbol: string; address: `0x${string}`; decimals: number; label: string } =>
    t.address !== 'native'
)

// Approximate mainnet prices for paper trading (refreshed by useLivePrice hook at runtime)
export const PAPER_PRICE_FALLBACKS: Record<string, number> = {
  tBNB: 600,
  BNB:  600,
  USDT: 1,
  BUSD: 1,
  WBNB: 600,
  CAKE: 2.5,
}

export const BSCSCAN_TESTNET = 'https://testnet.bscscan.com'
export const BSCSCAN_TESTNET_API = 'https://api-testnet.bscscan.com/api'
export const FAUCET_URL = 'https://testnet.bnbchain.org/faucet-smart'
