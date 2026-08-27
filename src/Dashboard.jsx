import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
} from 'recharts'
import { supabase } from './supabaseClient'
import { useRealtimeRefresh } from './useRealtimeRefresh'

// Validated categorical palette (see the dataviz skill's palette.md) — fixed
// hue order, checked for colorblind-safety. "Other" (the folded tail of
// small categories) deliberately isn't in this set: it uses --ink-faint
// instead, since it's a bucket, not a real identity.
const CATEGORY_COLORS_LIGHT = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
]
const CATEGORY_COLORS_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
]
const OTHER_COLOR_LIGHT = '#9c9686'
const OTHER_COLOR_DARK = '#8b8375'

const MAX_CATEGORY_SLICES = 7 // beyond this, the rest fold into "Other"

const fmtINR = (n) =>
  Math.round(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

function monthKey(dateStr) {
  return dateStr.slice(0, 7) // "2026-08-15" -> "2026-08"
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
  })
}

export default function Dashboard() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('all')
  const [isDark, setIsDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setIsDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // All expenses, oldest fields we need only — this app is small enough
  // (a household's spending) that pulling everything and aggregating in
  // the browser is simpler than writing SQL aggregate queries.
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('amount, transaction_date, categories(name)')
      .order('transaction_date', { ascending: true })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setTransactions(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh('transactions', load)

  const monthKeys = useMemo(() => {
    const s = new Set(transactions.map((t) => monthKey(t.transaction_date)))
    return Array.from(s).sort()
  }, [transactions])

  // Default to the most recent month once data has loaded, so the first
  // thing you see is "this month," not an all-time total.
  useEffect(() => {
    if (monthKeys.length > 0 && period === 'all') {
      setPeriod(monthKeys[monthKeys.length - 1])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKeys.length])

  const filtered = useMemo(() => {
    if (period === 'all') return transactions
    return transactions.filter((t) => monthKey(t.transaction_date) === period)
  }, [transactions, period])

  const totalSpent = useMemo(() => filtered.reduce((sum, t) => sum + Number(t.amount), 0), [filtered])

  const byCategory = useMemo(() => {
    const map = {}
    for (const t of filtered) {
      const name = t.categories?.name ?? 'Uncategorized'
      map[name] = (map[name] || 0) + Number(t.amount)
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filtered])

  const categoryChartData = useMemo(() => {
    const top = byCategory.slice(0, MAX_CATEGORY_SLICES)
    const rest = byCategory.slice(MAX_CATEGORY_SLICES)
    const restTotal = rest.reduce((sum, c) => sum + c.value, 0)
    return restTotal > 0 ? [...top, { name: 'Other', value: restTotal }] : top
  }, [byCategory])

  const topCategory = byCategory[0]

  const monthlyTrend = useMemo(() => {
    const map = {}
    for (const t of transactions) {
      const k = monthKey(t.transaction_date)
      map[k] = (map[k] || 0) + Number(t.amount)
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, value]) => ({ key, label: monthLabel(key), value }))
  }, [transactions])

  const categoryColors = isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT
  const otherColor = isDark ? OTHER_COLOR_DARK : OTHER_COLOR_LIGHT
  const seriesColor = isDark ? '#3987e5' : '#2a78d6' // sequential blue, for the single-series trend line

  if (loading) {
    return (
      <section className="card">
        <h2>Dashboard</h2>
        <p className="empty-state">Loading…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="card">
        <h2>Dashboard</h2>
        <div className="error-banner">{error}</div>
      </section>
    )
  }

  if (transactions.length === 0) {
    return (
      <section className="card">
        <h2>Dashboard</h2>
        <p className="empty-state">Add a few expenses below to see your spending broken down here.</p>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="dash-header">
        <h2>Dashboard</h2>
        <select
          className="dash-period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          aria-label="Period"
        >
          <option value="all">All time</option>
          {monthKeys
            .slice()
            .reverse()
            .map((k) => (
              <option key={k} value={k}>
                {monthLabel(k)}
              </option>
            ))}
        </select>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="stat-label">Spent</div>
          <div className="stat-value">{fmtINR(totalSpent)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Transactions</div>
          <div className="stat-value">{filtered.length}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Top category</div>
          <div className="stat-value stat-value-sm">{topCategory ? topCategory.name : '—'}</div>
        </div>
      </div>

      {categoryChartData.length > 0 && (
        <div className="chart-block">
          <h3>Spend by category</h3>
          <ResponsiveContainer width="100%" height={Math.max(categoryChartData.length * 34, 120)}>
            <BarChart data={categoryChartData} layout="vertical" margin={{ left: 8, right: 32 }}>
              <CartesianGrid horizontal={false} stroke="var(--line)" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fontSize: 12, fill: 'var(--ink-soft)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => fmtINR(v)}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  background: 'var(--card)',
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} label={{ position: 'right', formatter: fmtINR, fontSize: 11, fill: 'var(--ink-soft)' }}>
                {categoryChartData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={entry.name === 'Other' ? otherColor : categoryColors[i % categoryColors.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="chart-block">
        <h3>Last {monthlyTrend.length} months</h3>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={monthlyTrend} margin={{ left: 0, right: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
              axisLine={{ stroke: 'var(--line)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
            />
            <Tooltip
              formatter={(v) => fmtINR(v)}
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: 'var(--card)',
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={seriesColor}
              strokeWidth={2}
              fill={seriesColor}
              fillOpacity={0.1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
