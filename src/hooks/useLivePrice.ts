import { useState, useEffect, useRef } from 'react'

export interface LivePrice {
  usd: number | null
  change24h: number | null
  loading: boolean
  lastUpdated: Date | null
}

const POLL_MS = 30_000

export function useLivePrice(): LivePrice {
  const [data, setData] = useState<LivePrice>({
    usd: null,
    change24h: null,
    loading: true,
    lastUpdated: null,
  })
  const cancelRef = useRef(false)

  useEffect(() => {
    cancelRef.current = false

    async function fetch() {
      // Primary: CoinGecko public API (no key)
      try {
        const res = await window.fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd&include_24hr_change=true',
          { signal: AbortSignal.timeout(8000) }
        )
        if (!res.ok) throw new Error('CoinGecko non-OK')
        const json = await res.json()
        if (!cancelRef.current) {
          setData({
            usd: json.binancecoin?.usd ?? null,
            change24h: json.binancecoin?.usd_24h_change ?? null,
            loading: false,
            lastUpdated: new Date(),
          })
        }
        return
      } catch { /* fall through to Binance */ }

      // Fallback: OKX public ticker
      try {
        const res = await window.fetch(
          '/api/okx/api/v5/market/ticker?instId=BNB-USDT',
          { signal: AbortSignal.timeout(8000) }
        )
        if (!res.ok) throw new Error('OKX non-OK')
        const json = await res.json()
        const t = json?.data?.[0]
        if (!t) throw new Error('OKX no data')
        const last   = parseFloat(t.last)
        const open24 = parseFloat(t.open24h)
        if (!cancelRef.current) {
          setData({
            usd: last,
            change24h: open24 ? ((last - open24) / open24) * 100 : null,
            loading: false,
            lastUpdated: new Date(),
          })
        }
      } catch {
        if (!cancelRef.current) {
          setData(p => ({ ...p, loading: false }))
        }
      }
    }

    fetch()
    const id = setInterval(fetch, POLL_MS)
    return () => {
      cancelRef.current = true
      clearInterval(id)
    }
  }, [])

  return data
}
