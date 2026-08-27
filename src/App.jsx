import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  // 'checking' | 'connected' | 'error'
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    // A tiny "ping" query just to prove the app can talk to Supabase.
    // It doesn't need a real table yet — Supabase still answers, it just
    // says the table is missing, which is enough to confirm the connection
    // and credentials are correct.
    supabase
      .from('_khata_connection_check')
      .select('*')
      .limit(1)
      .then(({ error }) => {
        if (error && error.code === '42P01') {
          // "relation does not exist" — expected, means we reached the DB.
          setStatus('connected')
        } else if (error) {
          setStatus('error')
          console.error(error)
        } else {
          setStatus('connected')
        }
      })
  }, [])

  return (
    <>
      <h1>Khata</h1>
      <p>Household expense tracker.</p>
      <p>Supabase connection: <strong>{status}</strong></p>
    </>
  )
}

export default App
