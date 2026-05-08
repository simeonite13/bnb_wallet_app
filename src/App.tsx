import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './wagmi'
import { useAccount } from 'wagmi'
import { ConnectButton } from './components/ConnectButton'
import { WalletInfo } from './components/WalletInfo'
import { SecurityBanner } from './components/SecurityBanner'
import { TokenBalanceCards } from './components/TokenBalanceCards'
import { PriceDisplay } from './components/PriceDisplay'
import { TradingPanel } from './components/TradingPanel'
import { TxHistory } from './components/TxHistory'
import { GasEstimator } from './components/GasEstimator'
import { PriceChart } from './components/PriceChart'
import { MarketDepth } from './components/MarketDepth'
import { LiveTrades } from './components/LiveTrades'
import { TradeAlerts } from './components/TradeAlerts'
import { PortfolioTracker } from './components/PortfolioTracker'
import { TradingSignals } from './components/TradingSignals'
import { DailyTrades } from './components/DailyTrades'
import { BotStatus } from './components/BotStatus'
import { useLivePrice } from './hooks/useLivePrice'
import { useTheme } from './hooks/useTheme'
import { ThemeToggle } from './components/ThemeToggle'
import './App.css'

const queryClient = new QueryClient()

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    </WagmiProvider>
  )
}

function Dashboard() {
  const { isConnected } = useAccount()
  const { usd, change24h } = useLivePrice()
  const { theme, toggle } = useTheme()

  const isUp = (change24h ?? 0) >= 0
  const changeColor = isUp ? 'var(--green)' : 'var(--red)'

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <span className="logo">⬡</span>
          <div>
            <h1>BNB Trading Dashboard</h1>
            <p className="tagline">BSC Testnet · Paper & Real Mode · No private keys</p>
          </div>
        </div>

        <div className="header-center">
          {usd !== null && (
            <div className="price-ticker">
              <span className="price-ticker-label">BNB</span>
              <span className="price-ticker-value">
                ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {change24h !== null && (
                <span className="price-ticker-change" style={{ color: changeColor }}>
                  {isUp ? '▲' : '▼'}{Math.abs(change24h).toFixed(2)}%
                </span>
              )}
            </div>
          )}
          <span className="badge badge-testnet">Testnet</span>
        </div>

        <ThemeToggle theme={theme} toggle={toggle} />
          <ConnectButton />
      </header>

      <main className="main">
        <SecurityBanner />

        {!isConnected && (
          <div className="empty-state">
            <div className="empty-state-icon">⬡</div>
            <h2>BNB Testnet Trading Dashboard</h2>
            <p>Connect your wallet to access real-mode trading and live balances.</p>
            <p className="muted">
              Paper trading mode is available without connecting — practice safely first.
            </p>
          </div>
        )}

        {/* ── Price + Gas (always visible) ── */}
        <div className="row-2">
          <PriceDisplay />
          <GasEstimator />
        </div>

        {/* ── Price Chart ── */}
        <PriceChart />

        {/* ── Market Depth / Live Trades ── */}
        <div className="row-2">
          <MarketDepth />
          <LiveTrades />
        </div>

        {/* ── Whale Alerts / Order Book Heatmap ── */}
        <TradeAlerts />

        {/* ── Bot status + daily strategy ── */}
        <BotStatus />
        <DailyTrades />

        {/* ── Wallet Info + Balances (when connected) ── */}
        {isConnected && (
          <>
            <WalletInfo />
            <TokenBalanceCards />
          </>
        )}

        {/* ── Trading Signals / Portfolio ── */}
        <div className="row-2">
          <TradingSignals />
          <PortfolioTracker />
        </div>

        {/* ── Trading + History ── */}
        <div className="row-2">
          <TradingPanel />
          {isConnected ? <TxHistory /> : <PaperOnlyNote />}
        </div>
      </main>

      <footer className="footer">
        <p>
          BNB Chain Testnet (Chain ID 97) · WalletConnect + MetaMask ·
          All transactions require manual wallet confirmation · No private keys ever requested
        </p>
      </footer>
    </div>
  )
}

function PaperOnlyNote() {
  return (
    <div className="card">
      <h2>Transaction History</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        Connect your wallet to view on-chain transaction history.
      </p>
    </div>
  )
}
