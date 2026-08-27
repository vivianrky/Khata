import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { parseAmount, parseDate, guessColumn } from './parsing'
import { suggestCategoryId } from '../categorize'
import ReviewImport from './ReviewImport'

async function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) {
          reject(new Error("Couldn't find any rows in that file."))
          return
        }
        resolve({ headers: res.meta.fields || Object.keys(res.data[0]), rows: res.data })
      },
      error: (err) => reject(new Error("Couldn't read that file: " + err.message)),
    })
  })
}

async function parseExcel(file) {
  // Loaded on demand — most imports will be CSV, so this ~1MB+ library
  // shouldn't bloat the initial page load for everyone.
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.worksheets[0]
  if (!sheet || sheet.rowCount < 2) {
    throw new Error("Couldn't find any rows in that spreadsheet.")
  }

  const headerRow = sheet.getRow(1)
  const headers = []
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim()
  })

  const rows = []
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i)
    if (row.cellCount === 0) continue
    const obj = {}
    let hasValue = false
    headers.forEach((h, colNumber) => {
      if (!h) return
      const cell = row.getCell(colNumber)
      // Excel stores dates as Date objects, not strings — normalize to ISO
      // so the same parseDate() used everywhere else in the app handles it.
      const value = cell.value instanceof Date ? cell.value.toISOString() : (cell.value ?? '')
      obj[h] = value
      if (value !== '') hasValue = true
    })
    if (hasValue) rows.push(obj)
  }

  if (!rows.length) throw new Error("Couldn't find any rows in that spreadsheet.")
  return { headers: headers.filter(Boolean), rows }
}

export default function SpreadsheetImport({ categories, rules, paidBy, onBack, onImported }) {
  const [step, setStep] = useState(1) // 1 = choose file, 2 = map columns, 3 = review
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [map, setMap] = useState({ date: '', description: '', amount: '' })
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const fileInput = useRef(null)

  async function handleFile(file) {
    setError('')
    setFileName(file.name)
    setLoading(true)
    try {
      const isExcel = /\.xlsx?$/i.test(file.name)
      const { headers: fields, rows: parsedRows } = isExcel ? await parseExcel(file) : await parseCsv(file)
      setHeaders(fields)
      setRawRows(parsedRows)
      setMap({
        date: guessColumn(fields, ['date']),
        description: guessColumn(fields, ['narration', 'description', 'particular', 'remark', 'details', 'merchant']),
        amount: guessColumn(fields, ['amount']),
      })
      setStep(2)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  function buildRows() {
    const built = rawRows.map((r) => {
      const description = String(r[map.description] ?? '').trim()
      const amount = Math.abs(parseAmount(r[map.amount]))
      return {
        date: parseDate(r[map.date]),
        description,
        amount,
        categoryId: suggestCategoryId(description, rules) || '',
        include: true,
      }
    })
    setRows(built)
    setStep(3)
  }

  if (step === 3) {
    return (
      <ReviewImport
        rows={rows}
        setRows={setRows}
        categories={categories}
        paidBy={paidBy}
        headerNote={`${rows.length} rows found — categories are guessed from the description, check them over before importing.`}
        onBack={() => setStep(2)}
        onImported={onImported}
      />
    )
  }

  if (step === 2) {
    return (
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
          <select id="map-amount" value={map.amount} onChange={(e) => setMap({ ...map, amount: e.target.value })}>
            <option value="">Select…</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <div className="import-actions">
          <button type="button" className="secondary-button" onClick={() => setStep(1)}>
            Start over
          </button>
          <button type="button" disabled={!map.date || !map.description || !map.amount} onClick={buildRows}>
            Preview
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="import-hint">
        Export a CSV or Excel (.xlsx) file from your bank or card app's statement/transaction
        history, then choose it below. Since every app formats its export differently, you'll
        confirm the columns next.
      </p>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
      />
      <div className="import-actions">
        <button type="button" className="secondary-button" onClick={onBack}>
          Choose a different method
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={loading}
          onClick={() => fileInput.current?.click()}
        >
          {loading ? 'Reading…' : 'Choose file'}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}
