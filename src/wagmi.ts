import { createConfig, http } from 'wagmi'
import { bsc, bscTestnet, flare } from 'wagmi/chains'
import { walletConnect, injected } from 'wagmi/connectors'

const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined
if (!projectId) {
  throw new Error(
    'VITE_WC_PROJECT_ID is not set.\n' +
    'Copy .env.example → .env and add your Reown (WalletConnect) Project ID.\n' +
    'Get one free at https://cloud.reown.com'
  )
}

const appMeta = {
  name: 'BNB Trading Dashboard',
  description: 'BNB Chain trading dashboard — paper & real mode, manual approvals only',
  url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  icons: [],
}

const mainnetRpc =
  (import.meta.env.VITE_BSC_MAINNET_RPC_URL as string | undefined) ||
  'https://bsc-dataseed1.binance.org/'

const testnetRpc =
  (import.meta.env.VITE_BSC_TESTNET_RPC_URL as string | undefined) ||
  (import.meta.env.VITE_BSC_RPC_URL as string | undefined) ||
  'https://bsc-testnet-rpc.publicnode.com'

const flareRpc =
  (import.meta.env.VITE_FLARE_RPC_URL as string | undefined) ||
  'https://flare-api.flare.network/ext/C/rpc'

export const wagmiConfig = createConfig({
  chains: [bsc, bscTestnet, flare],
  connectors: [
    injected({ target: 'metaMask' }),
    walletConnect({ projectId, metadata: appMeta }),
  ],
  transports: {
    [bsc.id]: http(mainnetRpc),
    [bscTestnet.id]: http(testnetRpc),
    [flare.id]: http(flareRpc),
  },
})
