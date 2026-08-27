import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import Dashboard from './Dashboard'
import StatementImport from './StatementImport'
import { useRealtimeRefresh } from './useRealtimeRefresh'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'import', label: 'Import' },
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
  // Bumped whenever transaction data changes, so <Dashboard> (which loads
  // its own data) refetches.
  const [dataVersion, setDataVersion] = useState(0)
  const refresh = () => {
    setDataVersion((v) => v + 1)
    loadCategories() // a new category may have just been created on the fly
  }

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

  // Categories are shared and can be created by either of you from
  // anywhere in the app — picks up a new one without waiting for your own
  // next edit to trigger a refresh.
  useRealtimeRefresh('categories', loadCategories)

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

      {tab === 'import' && (
        <section className="card">
          <StatementImport
            categories={categories}
            paidBy={usernameFromEmail(session.user.email)}
            onImported={() => {
              refresh()
              setTab('dashboard')
            }}
          />
        </section>
      )}
    </>
  )
}

export default App
