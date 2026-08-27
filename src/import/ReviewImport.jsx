import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { resolveCategoryIds, normalizeCategoryName } from '../categorize'

const ACCOUNT_TYPES = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'upi', label: 'UPI' },
]

// The last step of every import method: confirm account details, check the
// auto-categorized rows, untick anything wrong, then save. `rows` are
// { date, description, amount, category, include } — `category` is a
// plain name, resolved to an id (creating it if new) only at import time.
export default function ReviewImport({ rows, setRows, categories, paidBy, headerNote, onBack, onImported }) {
  const [accountType, setAccountType] = useState('upi')
  const [accountName, setAccountName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  function updateRow(i, field, value) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }

  const includedCount = rows.filter((r) => r.include && r.date && r.amount > 0).length

  async function handleImport() {
    setSaving(true)
    setSaveError(null)

    const included = rows.filter((r) => r.include && r.date && r.amount > 0)

    let categoryIds
    try {
      // One pass: every distinct category name across the batch gets
      // looked up (or created, if it's new) exactly once.
      categoryIds = await resolveCategoryIds(supabase, included.map((r) => r.category))
    } catch (err) {
      setSaving(false)
      setSaveError(err.message)
      return
    }

    const toInsert = included.map((r) => ({
      amount: r.amount,
      transaction_date: r.date,
      account_type: accountType,
      account_name: accountName || null,
      category_id: categoryIds.get(normalizeCategoryName(r.category)) ?? null,
      paid_by: paidBy,
      note: r.description || null,
    }))

    const { error } = await supabase.from('transactions').insert(toInsert)
    setSaving(false)

    if (error) {
      setSaveError(error.message)
      return
    }

    onImported?.()
  }

  return (
    <div>
      <p className="import-hint">{headerNote}</p>

      <div className="tx-form import-account-fields">
        <div className="field">
          <label htmlFor="review-account-type">Account type</label>
          <select id="review-account-type" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="review-account-name">Account name (optional)</label>
          <input
            id="review-account-name"
            type="text"
            placeholder="e.g. HDFC Credit Card"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
        </div>
      </div>

      <datalist id="review-category-options">
        {categories.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>

      <div className="tx-table-wrap">
        <table className="tx-table import-preview-table">
          <thead>
            <tr>
              <th />
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => updateRow(i, 'include', e.target.checked)}
                  />
                </td>
                <td>
                  <input type="date" value={r.date} onChange={(e) => updateRow(i, 'date', e.target.value)} />
                </td>
                <td className="import-desc-cell">{r.description || '—'}</td>
                <td className="tx-amount">₹{isNaN(r.amount) ? '?' : r.amount}</td>
                <td>
                  <input
                    type="text"
                    list="review-category-options"
                    placeholder="Uncategorized"
                    value={r.category}
                    onChange={(e) => updateRow(i, 'category', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {saveError && <div className="error-banner">{saveError}</div>}

      <div className="import-actions">
        <button type="button" className="secondary-button" onClick={onBack}>
          Back
        </button>
        <button type="button" className="primary-button" disabled={saving || includedCount === 0} onClick={handleImport}>
          {saving ? 'Importing…' : `Import ${includedCount} transaction${includedCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
