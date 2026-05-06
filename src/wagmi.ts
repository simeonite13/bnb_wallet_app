import { createConfig, http } from 'wagmi'
import { bscTestnet } from 'wagmi/chains'
import { walletConnect, injected } from 'wagmi/connectors'

const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined
if (!projectId) {
  throw new Error(
    'VITE_WC_PROJECT_ID is not set.\n' +
    'Copy .env.example → .env and add your WalletConnect Project ID.\n' +
    'Get one free at https://cloud.walletconnect.com'
  )
}

const appMeta = {
  name: 'BNB Testnet Trading Dashboard',
  description: 'BNB Testnet trading dashboard — paper & real mode, manual approvals only',
  url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  icons: [],
}

export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [
    injected({ target: 'metaMask' }),
    walletConnect({ projectId, metadata: appMeta }),
  ],
  transports: {
    [bscTestnet.id]: http(
      (import.meta.env.VITE_BSC_RPC_URL as string | undefined) ||
      'https://bsc-testnet-rpc.publicnode.com'
    ),
  },
})
