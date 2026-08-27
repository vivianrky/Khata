import { useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from './supabaseClient'
import { suggestCategory } from './categorize'

const ACCOUNT_TYPES = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'upi', label: 'UPI' },
]

function parseAmount(raw) {
  if (raw == null) return NaN
  // Strips currency symbols/commas/spaces and turns "(500)" into "-500",
  // a common way statements show a negative/refund amount.
  const cleaned = String(raw)
    .replace(/[₹,\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1')
  return parseFloat(cleaned)
}

const pad2 = (n) => String(n).padStart(2, '0')

function parseDate(raw) {
  if (!raw) return ''
  const s = String(raw).trim()

  // Already ISO (2026-08-13, optionally with a time after it).
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`

  // dd/mm/yyyy or dd-mm-yyyy — the convention Indian bank/card statements
  // use. JavaScript's own Date parser assumes US mm/dd/yyyy for this shape,
  // which silently swaps day and month (or fails outright when the day is
  // >12), so this is handled explicitly rather than left to `new Date()`.
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    let [, d, mo, y] = m
    if (y.length === 2) y = '20' + y
    return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  // Fall back to JS's parser for unambiguous formats like "15 Aug 2026".
  const dt = new Date(s)
  if (!isNaN(dt)) return dt.toISOString().slice(0, 10)

  return '' // leave blank for the user to fill in rather than guess wrong
}

// Guesses which column is which by header name, so the common case needs no
// manual mapping — you only touch the dropdowns when a guess is wrong.
function guessColumn(headers, patterns) {
  return headers.find((h) => patterns.some((p) => h.toLowerCase().includes(p))) || ''
}

export default function StatementImport({ categories, onImported }) {
  const [step, setStep] = useState(1) // 1 = choose file, 2 = map columns, 3 = review
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [map, setMap] = useState({ date: '', description: '', amount: '' })
  const [accountType, setAccountType] = useState('upi')
  const [accountName, setAccountName] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [rows, setRows] = useState([]) // built once we reach step 3, editable there
  const [parseError, setParseError] = useState('')
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef(null)

  const categoryByName = useMemo(() => {
    const m = {}
    for (const c of categories) m[c.name] = c.id
    return m
  }, [categories])

  function reset() {
    setStep(1)
    setFileName('')
    setHeaders([])
    setRawRows([])
    setMap({ date: '', description: '', amount: '' })
    setRows([])
    setParseError('')
    setSaveError(null)
  }

  function handleFile(file) {
    setParseError('')
    setFileName(file.name)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) {
          setParseError("Couldn't find any rows in that file.")
          return
        }
        const fields = res.meta.fields || Object.keys(res.data[0])
        setHeaders(fields)
        setRawRows(res.data)
        setMap({
          date: guessColumn(fields, ['date']),
          description: guessColumn(fields, ['narration', 'description', 'particular', 'remark', 'details', 'merchant']),
          amount: guessColumn(fields, ['amount']),
        })
        setStep(2)
      },
      error: (err) => setParseError("Couldn't read that file: " + err.message),
    })
  }

  function buildRows() {
    const built = rawRows.map((r) => {
      const description = String(r[map.description] ?? '').trim()
      const amount = Math.abs(parseAmount(r[map.amount]))
      const categoryName = suggestCategory(description)
      return {
        date: parseDate(r[map.date]),
        description,
        amount,
        categoryId: categoryName ? categoryByName[categoryName] || '' : '',
        include: true,
      }
    })
    setRows(built)
    setStep(3)
  }

  function updateRow(i, field, value) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }

  async function handleImport() {
    setSaving(true)
    setSaveError(null)

    const toInsert = rows
      .filter((r) => r.include && r.date && r.amount > 0)
      .map((r) => ({
        amount: r.amount,
        transaction_date: r.date,
        account_type: accountType,
        account_name: accountName || null,
        category_id: r.categoryId || null,
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
    reset()
  }

  const includedCount = rows.filter((r) => r.include && r.date && r.amount > 0).length

  return (
    <div>
      {step === 1 && (
        <div>
          <p className="import-hint">
            Export a CSV from your bank or card app's statement/transaction history, then choose it
            below. Since every app formats its export differently, you'll confirm the columns next.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
          />
          <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}>
            Choose CSV file
          </button>
          {parseError && <div className="error-banner">{parseError}</div>}
        </div>
      )}

      {step === 2 && (
        <div className="tx-form">
          <p className="import-hint">
            {fileName} · {rawRows.length} rows
          </p>

          <div className="field">
            <label htmlFor="map-date">Date column</label>
            <select id="map-date" value={map.date} onChange={(e) => setMap({ ...map, date: e.target.value })}>
              <option value="">Select…</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="map-desc">Description column</label>
            <select
              id="map-desc"
              value={map.description}
              onChange={(e) => setMap({ ...map, description: e.target.value })}
            >
              <option value="">Select…</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="map-amount">Amount column</label>
            <select
              id="map-amount"
              value={map.amount}
              onChange={(e) => setMap({ ...map, amount: e.target.value })}
            >
              <option value="">Select…</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="map-account-type">Account type</label>
            <select id="map-account-type" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="map-account-name">Account name (optional)</label>
            <input
              id="map-account-name"
              type="text"
              placeholder="e.g. HDFC Credit Card"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="map-paid-by">Paid by</label>
            <input
              id="map-paid-by"
              type="text"
              required
              placeholder="Your name"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
            />
          </div>

          <div className="import-actions">
            <button type="button" className="secondary-button" onClick={reset}>
              Start over
            </button>
            <button type="button" disabled={!map.date || !map.description || !map.amount} onClick={buildRows}>
              Preview
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <p className="import-hint">
            {rows.length} rows found — categories are guessed from the description, check them over
            before importing. Untick any row you don't want to bring in.
          </p>

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
                      <input
                        type="date"
                        value={r.date}
                        onChange={(e) => updateRow(i, 'date', e.target.value)}
                      />
                    </td>
                    <td className="import-desc-cell">{r.description || '—'}</td>
                    <td className="tx-amount">₹{isNaN(r.amount) ? '?' : r.amount}</td>
                    <td>
                      <select value={r.categoryId} onChange={(e) => updateRow(i, 'categoryId', e.target.value)}>
                        <option value="">Uncategorized</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {saveError && <div className="error-banner">{saveError}</div>}

          <div className="import-actions">
            <button type="button" className="secondary-button" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" disabled={saving || includedCount === 0 || !paidBy} onClick={handleImport}>
              {saving ? 'Importing…' : `Import ${includedCount} transaction${includedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
