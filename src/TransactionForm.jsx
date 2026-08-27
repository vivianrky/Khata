import { useState } from 'react'
import { supabase } from './supabaseClient'

const ACCOUNT_TYPES = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'upi', label: 'UPI' },
]

const today = () => new Date().toISOString().slice(0, 10)

// A form for logging one expense by hand. `categories` is passed in from
// App.jsx (loaded once from Supabase); `paidBy` is your logged-in username —
// this data is private to your account, so there's no one else it could be;
// `onAdded` is called after a successful save so App.jsx can refresh
// whatever list/chart is showing.
export default function TransactionForm({ categories, paidBy, onAdded }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [accountType, setAccountType] = useState('upi')
  const [accountName, setAccountName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const { error } = await supabase.from('transactions').insert({
      amount: Number(amount),
      transaction_date: date,
      account_type: accountType,
      account_name: accountName || null,
      category_id: categoryId || null,
      paid_by: paidBy,
      note: note || null,
    })

    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    // Clear the form for the next entry, but keep date/account/payer as-is
    // since you're often logging several expenses from the same trip in a row.
    setAmount('')
    setAccountName('')
    setNote('')
    onAdded?.()
  }

  return (
    <form onSubmit={handleSubmit} className="tx-form">
      <div className="field">
        <label htmlFor="tx-amount">Amount (₹)</label>
        <input
          id="tx-amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="tx-date">Date</label>
        <input
          id="tx-date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="tx-account-type">Account type</label>
        <select
          id="tx-account-type"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="tx-account-name">Account name (optional)</label>
        <input
          id="tx-account-name"
          type="text"
          placeholder="e.g. HDFC Credit Card, Google Pay"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="tx-category">Category</label>
        <select
          id="tx-category"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="tx-note">Note (optional)</label>
        <input id="tx-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Add expense'}
      </button>
    </form>
  )
}
