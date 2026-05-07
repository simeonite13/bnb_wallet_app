import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/bnb_wallet_app/',
  server: {
    proxy: {
      '/bnb_wallet_app/api/bot': {
        target: 'http://127.0.0.1:8055',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bnb_wallet_app\/api\/bot/, ''),
      },
    },
  },
})
