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

const INSIGHT_CATEGORY_LIMIT = 5 // how many categories the breakdown expands
const INSIGHT_ITEM_LIMIT = 8 // line items shown per category before folding into "+N more"

// Rough, name-based split of a category into "discretionary" (the kind of
// spending you can choose to cut) vs "essential" (rent, bills, insurance —
// cutting it isn't really a choice). Categories aren't a fixed list in this
// app (they build themselves from whatever you import or type), so this is
// necessarily a best-effort keyword match, not a real classification —
// anything that doesn't match either list is left "unknown" rather than
// guessed wrong.
const DISCRETIONARY_KEYWORDS = [
  'food', 'dining', 'drink', 'restaurant', 'shopping', 'entertainment',
  'subscription', 'ott', 'movie', 'travel', 'leisure', 'gift', 'apparel',
  'clothing', 'beauty', 'salon', 'gaming', 'alcohol', 'bar', 'cafe', 'coffee',
]
const ESSENTIAL_KEYWORDS = [
  'rent', 'emi', 'loan', 'insurance', 'mortgage', 'utility', 'utilities',
  'bill', 'electricity', 'water', 'gas', 'fuel', 'petrol', 'medical',
  'health', 'pharmacy', 'hospital', 'education', 'school', 'fees', 'tax',
  'grocery', 'groceries',
]

function classifyCategory(name) {
  const n = name.toLowerCase()
  if (DISCRETIONARY_KEYWORDS.some((k) => n.includes(k))) return 'discretionary'
  if (ESSENTIAL_KEYWORDS.some((k) => n.includes(k))) return 'essential'
  return 'unknown'
}

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
      .select('amount, transaction_date, note, categories(name)')
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

  // Same grouping as byCategory, but keeping each transaction (not just the
  // category total) so the breakdown can list what actually makes up each
  // category — "Swiggy — ₹1,230", not just "Food & Drinks — ₹10,251".
  const categoryBreakdown = useMemo(() => {
    const map = new Map()
    for (const t of filtered) {
      const name = t.categories?.name ?? 'Uncategorized'
      if (!map.has(name)) map.set(name, { name, total: 0, items: [] })
      const bucket = map.get(name)
      bucket.total += Number(t.amount)
      bucket.items.push({ description: t.note || '(no description)', amount: Number(t.amount) })
    }
    return Array.from(map.values())
      .map((c) => ({ ...c, items: c.items.sort((a, b) => b.amount - a.amount) }))
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  const shownBreakdown = categoryBreakdown.slice(0, INSIGHT_CATEGORY_LIMIT)
  const shownBreakdownTotal = shownBreakdown.reduce((sum, c) => sum + c.total, 0)

  // A prioritized "what I'd cut first" list: discretionary categories
  // ranked by spend (biggest first, with a blunter recommendation for the
  // very top one), essential categories marked as generally not worth
  // cutting, and anything unclassified left for you to judge for yourself.
  const cutPlan = useMemo(() => {
    const classified = categoryBreakdown.map((c) => ({ ...c, kind: classifyCategory(c.name) }))
    const discretionary = classified.filter((c) => c.kind === 'discretionary').sort((a, b) => b.total - a.total)
    const essential = classified.filter((c) => c.kind === 'essential').sort((a, b) => b.total - a.total)
    const unknown = classified.filter((c) => c.kind === 'unknown').sort((a, b) => b.total - a.total)

    const rows = []
    discretionary.forEach((c, i) => {
      if (i === 0) rows.push({ ...c, priority: 1, action: 'Cut by 40–50%' })
      else if (i === 1) rows.push({ ...c, priority: 2, action: 'Cut by 20–30% temporarily' })
      else rows.push({ ...c, priority: 3, action: 'Review whether necessary/recurring' })
    })
    essential.forEach((c) => rows.push({ ...c, priority: 4, action: "Don't cut unless it can be optimized" }))
    unknown.forEach((c) => rows.push({ ...c, priority: 5, action: 'Depends what these transactions are' }))
    return rows
  }, [categoryBreakdown])

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

      {shownBreakdown.length > 0 && (
        <div className="chart-block">
          <h3>Spending breakdown</h3>
          <div className="insight-list">
            {shownBreakdown.map((c) => (
              <div key={c.name}>
                <div className="insight-category-header">
                  <span>{c.name}</span>
                  <span className="insight-category-total">{fmtINR(c.total)}</span>
                </div>
                <ul className="insight-item-list">
                  {c.items.slice(0, INSIGHT_ITEM_LIMIT).map((it, i) => (
                    <li key={i}>
                      <span className="insight-item-desc">{it.description}</span>
                      <span className="insight-item-amount">{fmtINR(it.amount)}</span>
                    </li>
                  ))}
                  {c.items.length > INSIGHT_ITEM_LIMIT && (
                    <li className="insight-item-more">+{c.items.length - INSIGHT_ITEM_LIMIT} more</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
          <p className="insight-summary">
            Total spending shown: <strong>{fmtINR(shownBreakdownTotal)}</strong>. Your{' '}
            <strong>{shownBreakdown[0].name}</strong> spending is the largest category, at about{' '}
            <strong>{((shownBreakdown[0].total / totalSpent) * 100).toFixed(1)}%</strong> of these
            transactions
            {shownBreakdown[1] && (
              <>
                , while <strong>{shownBreakdown[1].name}</strong> is about{' '}
                <strong>{((shownBreakdown[1].total / totalSpent) * 100).toFixed(1)}%</strong>.
              </>
            )}
          </p>
        </div>
      )}

      {cutPlan.length > 0 && (
        <div className="chart-block">
          <h3>Where I'd cut first</h3>
          <p className="import-hint">
            A rough, keyword-based read of your categories — not financial advice, just a starting
            point to look at.
          </p>
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th />
                  <th>Category</th>
                  <th>Current spending</th>
                  <th>What I'd do</th>
                </tr>
              </thead>
              <tbody>
                {cutPlan.map((c) => (
                  <tr key={c.name}>
                    <td>
                      <span className={`priority-dot priority-${c.priority}`} />
                    </td>
                    <td>{c.name}</td>
                    <td className="tx-amount">{fmtINR(c.total)}</td>
                    <td>{c.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
