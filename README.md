# BNB Testnet Trading Dashboard

A React/Vite trading dashboard for BSC Testnet (chain 97). Connect via MetaMask
or WalletConnect, watch live prices and balances, paper-trade with a virtual
$10k portfolio, or send real testnet transactions.

## Stack

- React 18 + TypeScript + Vite
- Wagmi v2 + Viem for wallet/chain interaction
- TanStack Query for async state
- lightweight-charts for price charts

## Running locally

```sh
npm install
cp .env.example .env       # fill in VITE_WC_PROJECT_ID
npm run dev                # http://localhost:5173
```

Build:

```sh
npm run build              # tsc + vite build → dist/
npm run preview            # serve the built bundle
```

## Environment

See `.env.example`. Two variables:

| Var | Purpose |
| --- | --- |
| `VITE_WC_PROJECT_ID` | WalletConnect project ID — public app identifier, get one at https://cloud.walletconnect.com |
| `VITE_BSC_RPC_URL` | BSC RPC endpoint (defaults to a public BSC mainnet node; override for testnet or a private node) |

## Project layout

```
src/
  wagmi.ts             chain + connector config (BSC Testnet, MetaMask, WalletConnect)
  constants.ts         testnet token addresses (tBNB, USDT, BUSD, WBNB, CAKE)
  hooks/
    useLivePrice.ts    CoinGecko → Binance fallback, polled every 30s
    usePaperTrading.ts localStorage paper portfolio (key: bnb_dash_paper_v1)
  components/
    TradingPanel.tsx   Paper / Real mode toggle; real mode submits via wagmi
    TxHistory.tsx      Last 15 txs from BSCScan testnet API
    GasEstimator.tsx   Live gas price + cost estimates per common op
    PriceChart.tsx     Candle chart (lightweight-charts)
    PortfolioTracker.tsx, MarketDepth.tsx, LiveTrades.tsx,
    PriceDisplay.tsx, TokenBalanceCards.tsx, TokenBalances.tsx,
    TradingSignals.tsx, TradeAlerts.tsx, SendPanel.tsx,
    SwapWarningModal.tsx, TxConfirmModal.tsx, TransactionGate.tsx,
    TxStatus.tsx, SecurityBanner.tsx, WalletInfo.tsx,
    ConnectButton.tsx, ThemeToggle.tsx
```

## Safety notes

- Connection is wallet-based only — the app **never** asks for, stores, or
  transmits private keys or seed phrases.
- Real-mode transactions go through a confirmation modal and require explicit
  wallet approval (MetaMask / WalletConnect) per tx.
- Default chain is BSC **Testnet** (97). Use a wallet funded only with testnet
  tBNB unless you have deliberately switched modes.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
