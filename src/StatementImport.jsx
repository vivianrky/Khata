import { useState } from 'react'
import SpreadsheetImport from './import/SpreadsheetImport'
import ExtractImport from './import/ExtractImport'

const METHODS = [
  { id: 'spreadsheet', label: 'Spreadsheet', sub: 'CSV or Excel (.xlsx/.xls) export' },
  { id: 'pdf', label: 'PDF statement', sub: 'Text is pulled out automatically' },
  { id: 'image', label: 'Photo / screenshot', sub: 'On-device text recognition (least reliable)' },
]

export default function StatementImport({ categories, paidBy, onImported }) {
  const [method, setMethod] = useState(null)

  if (!method) {
    return (
      <div>
        <p className="import-hint">
          Choose how you'd like to bring transactions in. Every path ends with a review step, so
          nothing is saved before you've seen it.
        </p>
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
