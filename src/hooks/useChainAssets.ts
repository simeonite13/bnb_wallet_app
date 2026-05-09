import { useChainId } from 'wagmi'
import { bsc, bscTestnet } from 'wagmi/chains'
import {
  type ChainToken,
  TESTNET_TOKENS,
  TESTNET_BSC_TOKENS,
  MAINNET_TOKENS,
  MAINNET_BSC_TOKENS,
  BSCSCAN_TESTNET,
  BSCSCAN_TESTNET_API,
  BSCSCAN_MAINNET,
  BSCSCAN_MAINNET_API,
  FAUCET_URL,
} from '../constants'

export type Erc20Token = {
  symbol: string
  address: `0x${string}`
  decimals: number
  label: string
}

export type ChainAssets = {
  isMainnet: boolean
  isTestnet: boolean
  tokens: ChainToken[]
  erc20Tokens: Erc20Token[]
  explorer: string
  explorerApi: string
  faucetUrl: string | null
  networkLabel: string
}

export function useChainAssets(): ChainAssets {
  const chainId = useChainId()
  const isMainnet = chainId === bsc.id
  const isTestnet = chainId === bscTestnet.id
  // Default to testnet when the wallet is disconnected or on an unknown chain
  // — matches prior behavior and keeps paper-mode safe.
  const useMainnet = isMainnet

  return {
    isMainnet,
    isTestnet,
    tokens: useMainnet ? MAINNET_TOKENS : TESTNET_TOKENS,
    erc20Tokens: useMainnet ? MAINNET_BSC_TOKENS : TESTNET_BSC_TOKENS,
    explorer: useMainnet ? BSCSCAN_MAINNET : BSCSCAN_TESTNET,
    explorerApi: useMainnet ? BSCSCAN_MAINNET_API : BSCSCAN_TESTNET_API,
    faucetUrl: useMainnet ? null : FAUCET_URL,
    networkLabel: useMainnet ? 'Mainnet' : isTestnet ? 'Testnet' : 'BNB Chain',
  }
}
