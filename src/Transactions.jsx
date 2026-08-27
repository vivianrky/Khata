import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

const ACCOUNT_TYPE_LABELS = {
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  upi: 'UPI',
}

export default function Transactions({ categories, onChanged }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sort, setSort] = useState('date') // 'date' | 'amount'

  const load = useCallback(async () => {
    // Capped at 500 — plenty for a household's transaction history; revisit
    // with real pagination if this app is still going after a few years of use.
    const { data, error } = await supabase
      .from('transactions')
      .select('id, amount, transaction_date, account_type, account_name, category_id, paid_by, note, categories(name)')
      .order('transaction_date', { ascending: false })
      .limit(500)

    if (error) {
      setError(error.message)
    } else {
      setTransactions(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    let rows = transactions
    if (categoryFilter !== 'all') {
      rows = rows.filter((t) => t.category_id === categoryFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(
        (t) =>
          (t.note ?? '').toLowerCase().includes(q) || (t.account_name ?? '').toLowerCase().includes(q),
      )
    }
    if (sort === 'amount') {
      rows = [...rows].sort((a, b) => Number(b.amount) - Number(a.amount))
    }
    // 'date' sort is already the order the query fetched in.
    return rows
  }, [transactions, categoryFilter, search, sort])

  async function updateCategory(id, categoryId) {
    // Update in place so the row doesn't jump around while you're editing.
    setTransactions((rows) => rows.map((r) => (r.id === id ? { ...r, category_id: categoryId } : r)))
    const { error } = await supabase.from('transactions').update({ category_id: categoryId || null }).eq('id', id)
    if (error) {
      setError(error.message)
      load() // out of sync with the server — re-fetch to be safe
      return
    }
    onChanged?.()
  }

  async function removeTransaction(id) {
    if (!window.confirm('Delete this expense? This can’t be undone.')) return
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setTransactions((rows) => rows.filter((r) => r.id !== id))
    onChanged?.()
  }

  return (
    <div>
      <div className="tx-filters">
        <input
          type="text"
          placeholder="Search note or account…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="date">Newest first</option>
          <option value="amount">Highest amount</option>
        </select>
        <span className="tx-filter-count">
          {filtered.length} of {transactions.length}
        </span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="empty-state">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="empty-state">
          {transactions.length === 0 ? 'No expenses logged yet.' : 'No expenses match.'}
        </p>
      ) : (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Paid by</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td>{t.transaction_date}</td>
                  <td>{ACCOUNT_TYPE_LABELS[t.account_type]}{t.account_name ? ` · ${t.account_name}` : ''}</td>
                  <td>
                    <select
                      value={t.category_id ?? ''}
                      onChange={(e) => updateCategory(t.id, e.target.value)}
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="tx-amount">₹{t.amount}</td>
                  <td>{t.paid_by}</td>
                  <td>{t.note}</td>
                  <td>
                    <button
                      type="button"
                      className="rule-remove"
                      aria-label="Delete expense"
                      onClick={() => removeTransaction(t.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
