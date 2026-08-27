import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import Dashboard from './Dashboard'
import TransactionForm from './TransactionForm'
import StatementImport from './StatementImport'
import Transactions from './Transactions'
import Rules from './Rules'
import Budget from './Budget'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'add', label: 'Add / Import' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'budget', label: 'Budget' },
  { id: 'rules', label: 'Rules' },
]

// A logged-in session's fake "@khata.local" email, shown back as the plain
// username people actually typed in — see Auth.jsx.
function usernameFromEmail(email) {
  return email?.split('@')[0] ?? ''
}

function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [categories, setCategories] = useState([])
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [entryMode, setEntryMode] = useState('manual') // 'manual' | 'import', within the Add / Import tab
  // Bumped whenever transaction data changes, so <Dashboard> and
  // <Transactions> (which each load their own data) refetch.
  const [dataVersion, setDataVersion] = useState(0)
  const refresh = () => setDataVersion((v) => v + 1)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('id, name').order('name')
    if (error) {
      setError(error.message)
      return
    }
    setCategories(data)
  }, [])

  useEffect(() => {
    if (session) loadCategories()
  }, [session, loadCategories])

  if (session === undefined) {
    return (
      <>
        <header className="app-header">
          <h1>📖 Khata</h1>
          <p>your money, entered in the book</p>
        </header>
        <p className="empty-state">Loading…</p>
      </>
    )
  }

  if (!session) {
    return (
      <>
        <header className="app-header">
          <h1>📖 Khata</h1>
          <p>your money, entered in the book</p>
        </header>
        <Auth />
      </>
    )
  }

  return (
    <>
      <header className="app-header">
        <h1>📖 Khata</h1>
        <p>your money, entered in the book</p>
        <button type="button" className="signout-button" onClick={() => supabase.auth.signOut()}>
          Sign out ({usernameFromEmail(session.user.email)})
        </button>
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
            <TransactionForm categories={categories} paidBy={usernameFromEmail(session.user.email)} onAdded={refresh} />
          ) : (
            <StatementImport
              categories={categories}
              paidBy={usernameFromEmail(session.user.email)}
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

      {tab === 'budget' && (
        <section className="card">
          <h2>Budget</h2>
          <Budget key={dataVersion} categories={categories} userId={session.user.id} />
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
