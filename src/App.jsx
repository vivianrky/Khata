import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Dashboard from './Dashboard'
import TransactionForm from './TransactionForm'

function App() {
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [error, setError] = useState(null)
  // Bumped after every add so <Dashboard> (which loads its own data) refetches.
  const [dashboardVersion, setDashboardVersion] = useState(0)

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('id, name').order('name')
    if (error) {
      setError(error.message)
      return
    }
    setCategories(data)
  }, [])

  const loadTransactions = useCallback(async () => {
    // Pull the 20 most recent transactions, joined with their category name,
    // so we don't have to look categories up by id in the UI.
    const { data, error } = await supabase
      .from('transactions')
      .select('id, amount, transaction_date, account_type, paid_by, note, categories(name)')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      setError(error.message)
      return
    }
    setTransactions(data)
  }, [])

  useEffect(() => {
    loadCategories()
    loadTransactions()
  }, [loadCategories, loadTransactions])

  return (
    <>
      <header className="app-header">
        <h1>📖 Khata</h1>
        <p>your money, entered in the book</p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <Dashboard key={dashboardVersion} />

      <section className="card">
        <h2>Add an expense</h2>
        <TransactionForm
          categories={categories}
          onAdded={() => {
            loadTransactions()
            setDashboardVersion((v) => v + 1)
          }}
        />
      </section>

      <section className="card">
        <h2>Recent expenses</h2>
        {transactions.length === 0 ? (
          <p className="empty-state">No expenses logged yet.</p>
        ) : (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Paid by</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{t.transaction_date}</td>
                    <td>{t.categories?.name ?? '—'}</td>
                    <td className="tx-amount">₹{t.amount}</td>
                    <td>{t.paid_by}</td>
                    <td>{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

export default App
