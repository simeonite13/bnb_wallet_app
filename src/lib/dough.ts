import { DOUGH_DECIMALS, USDT_FLARE_DECIMALS } from '../constants'

// Algebra/Uniswap-V3 sqrtPriceX96 → USDT-per-DOUGH (human units).
// token0=USDT(6 dec), token1=DOUGH(18 dec). raw_price = S^2/2^192 gives raw
// DOUGH per raw USDT, so USDT per DOUGH = 2^192 × 10^(decDiff) / S^2 where
// decDiff = decimals1 - decimals0 = 12.
export function usdtPerDough(sqrtPriceX96: bigint | undefined): number | null {
  if (!sqrtPriceX96 || sqrtPriceX96 === 0n) return null
  const Q192 = 1n << 192n
  const decDiff = 10n ** BigInt(DOUGH_DECIMALS - USDT_FLARE_DECIMALS)
  const scale = 10n ** 18n
  const scaled = (Q192 * decDiff * scale) / (sqrtPriceX96 * sqrtPriceX96)
  return Number(scaled) / 1e18
}
