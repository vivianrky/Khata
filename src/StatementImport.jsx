import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import SpreadsheetImport from './import/SpreadsheetImport'
import ExtractImport from './import/ExtractImport'

const METHODS = [
  { id: 'spreadsheet', label: 'Spreadsheet', sub: 'CSV or Excel (.xlsx/.xls) export' },
  { id: 'pdf', label: 'PDF statement', sub: 'Text is pulled out automatically' },
  { id: 'image', label: 'Photo / screenshot', sub: 'On-device text recognition (least reliable)' },
]

export default function StatementImport({ categories, paidBy, onImported }) {
  const [method, setMethod] = useState(null)
  const [rules, setRules] = useState([])
  const [rulesError, setRulesError] = useState(null)

  useEffect(() => {
    supabase
      .from('category_rules')
      .select('keyword, category_id')
      .then(({ data, error }) => {
        if (error) {
          // Fail loud: silently falling back to an empty rule set meant
          // every import went out fully uncategorized with no explanation.
          setRulesError('Category suggestions are unavailable right now (' + error.message + '). Rows will import as Uncategorized — you can still set categories by hand in the review step.')
          return
        }
        setRules(data || [])
      })
  }, [])

  if (!method) {
    return (
      <div>
        <p className="import-hint">
          Choose how you'd like to bring transactions in. Every path ends with a review step, so
          nothing is saved before you've seen it.
        </p>
        {rulesError && <div className="error-banner">{rulesError}</div>}
        <div className="import-method-grid">
          {METHODS.map((m) => (
            <button key={m.id} type="button" className="import-method-card" onClick={() => setMethod(m.id)}>
              <span className="import-method-label">{m.label}</span>
              <span className="import-method-sub">{m.sub}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const shared = {
    categories,
    rules,
    paidBy,
    onBack: () => setMethod(null),
    onImported: () => {
      setMethod(null)
      onImported?.()
    },
  }

  if (method === 'spreadsheet') return <SpreadsheetImport {...shared} />
  return <ExtractImport kind={method} {...shared} />
}
