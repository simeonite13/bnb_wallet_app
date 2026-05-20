// Minimal Algebra-protocol pool ABI (SparkDEX on Flare).
// Algebra exposes globalState() in place of Uniswap V3's slot0().

export const algebraPoolAbi = [
  {
    type: 'function',
    name: 'globalState',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'price', type: 'uint160' },          // sqrtPriceX96
      { name: 'tick', type: 'int24' },
      { name: 'lastFee', type: 'uint16' },
      { name: 'pluginConfig', type: 'uint8' },
      { name: 'communityFee', type: 'uint16' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'token0',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'token1',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const
