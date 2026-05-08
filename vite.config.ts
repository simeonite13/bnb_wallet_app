import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/bnb_wallet_app/',
  server: {
    host: true,
    allowedHosts: [
      '.trycloudflare.com', '.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app',
      '192.168.1.56',     // LAN
      '100.124.199.77',   // Tailscale
    ],
    proxy: {
      '/bnb_wallet_app/api/bot': {
        target: 'http://127.0.0.1:8055',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bnb_wallet_app\/api\/bot/, ''),
      },
      '/api/okx': {
        target: 'https://www.okx.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/okx/, ''),
      },
      '/api/kucoin': {
        target: 'https://api.kucoin.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kucoin/, ''),
      },
      '/api/bybit-ws': {
        target: 'wss://stream.bybit.com',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bybit-ws/, ''),
      },
    },
  },
})
