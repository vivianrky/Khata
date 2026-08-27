import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import TransactionForm from './TransactionForm'

function App() {
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [error, setError] = useState(null)

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
      <h1>Khata</h1>
      <p>Household expense tracker.</p>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <h2>Add an expense</h2>
      <TransactionForm categories={categories} onAdded={loadTransactions} />

      <h2>Recent expenses</h2>
      {transactions.length === 0 ? (
        <p>No expenses logged yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
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
                <td>₹{t.amount}</td>
                <td>{t.paid_by}</td>
                <td>{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

export default App
