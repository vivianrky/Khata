import { useState } from 'react'
import { supabase } from './supabaseClient'

// Supabase Auth needs an email address, but a household app for two people
// doesn't need real email/password-reset delivery — so a plain username
// gets turned into a fake address on a domain nothing will ever send mail
// to. This trades away "forgot password" email recovery for simplicity;
// if you lose your password, reset it directly in the Supabase dashboard
// (Authentication -> Users -> ... -> Reset password).
//
// Not ".local", ".test", ".invalid", or "example.com/.org/.net" — all of
// those are officially reserved (RFC 2606 / RFC 6762) and Supabase's email
// validator rejects them outright. This domain isn't reserved by anything,
// so it passes format validation even though, like the others, no mail
// server actually exists there.
const FAKE_EMAIL_DOMAIN = 'khata-household.app'
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${FAKE_EMAIL_DOMAIN}`
}

export default function Auth() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (!USERNAME_PATTERN.test(username.trim())) {
      setError('Username should be 3-32 characters: letters, numbers, dots, dashes or underscores.')
      return
    }

    setBusy(true)
    const email = usernameToEmail(username)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      setBusy(false)
      if (error) {
        setError(error.message)
        return
      }
      setInfo('Account created — you should be signed in now.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (error) {
        setError(
          error.message.includes('Invalid login')
            ? 'Wrong username or password.'
            : error.message,
        )
      }
    }
  }

  return (
    <section className="card auth-card">
      <div className="mode-toggle">
        <button
          type="button"
          className={mode === 'signin' ? 'mode-tab active' : 'mode-tab'}
          onClick={() => setMode('signin')}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'mode-tab active' : 'mode-tab'}
          onClick={() => setMode('signup')}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="tx-form">
        <div className="field">
          <label htmlFor="auth-username">Username</label>
          <input
            id="auth-username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="error-banner">{error}</div>}
        {info && <p className="budget-saved-note">{info}</p>}

        <button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}
