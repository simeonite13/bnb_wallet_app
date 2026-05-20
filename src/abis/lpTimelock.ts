// Minimal ABI for LPTimelock.sol (~/flare_lp_timelock/src/LPTimelock.sol).
// Only the entries the DOUGH panel reads/writes.

export const lpTimelockAbi = [
  {
    type: 'function',
    name: 'collectAllFeesToOwner',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'unlockTime',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'nftDeposited',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
] as const
