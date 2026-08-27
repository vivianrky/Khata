import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Dashboard from './Dashboard'
import TransactionForm from './TransactionForm'
import StatementImport from './StatementImport'
import Transactions from './Transactions'
import Rules from './Rules'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'add', label: 'Add / Import' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'rules', label: 'Rules' },
]

function App() {
  const [categories, setCategories] = useState([])
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [entryMode, setEntryMode] = useState('manual') // 'manual' | 'import', within the Add / Import tab
  // Bumped whenever transaction data changes, so <Dashboard> and
  // <Transactions> (which each load their own data) refetch.
  const [dataVersion, setDataVersion] = useState(0)
  const refresh = () => setDataVersion((v) => v + 1)

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('id, name').order('name')
    if (error) {
      setError(error.message)
      return
    }
    setCategories(data)
  }, [])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  return (
    <>
      <header className="app-header">
        <h1>📖 Khata</h1>
        <p>your money, entered in the book</p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <nav className="mode-toggle app-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'mode-tab active' : 'mode-tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && <Dashboard key={dataVersion} />}

      {tab === 'add' && (
        <section className="card">
          <div className="mode-toggle">
            <button
              type="button"
              className={entryMode === 'manual' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setEntryMode('manual')}
            >
              Add an expense
            </button>
            <button
              type="button"
              className={entryMode === 'import' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setEntryMode('import')}
            >
              Import a statement
            </button>
          </div>

          {entryMode === 'manual' ? (
            <TransactionForm categories={categories} onAdded={refresh} />
          ) : (
            <StatementImport
              categories={categories}
              onImported={() => {
                refresh()
                setEntryMode('manual')
              }}
            />
          )}
        </section>
      )}

      {tab === 'transactions' && (
        <section className="card">
          <h2>Transactions</h2>
          <Transactions key={dataVersion} categories={categories} onChanged={refresh} />
        </section>
      )}

      {tab === 'rules' && (
        <section className="card">
          <h2>Categorization rules</h2>
          <Rules categories={categories} />
        </section>
      )}
    </>
  )
}

export default App
