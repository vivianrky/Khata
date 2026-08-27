import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { parseAmount, parseDate, guessColumn, guessAccountInfo } from './parsing'
import { suggestCategoryName, normalizeCategoryName } from '../categorize'
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

// ExcelJS cell values aren't always plain strings/numbers — a cell with
// mixed formatting comes back as { richText: [...] }, a hyperlink as
// { text, hyperlink }, a formula as { formula, result }. This pulls out
// the actual displayable text/value from any of those shapes.
function cellText(value) {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((p) => p.text).join('')
    if (typeof value.text === 'string') return value.text
    if ('result' in value) return cellText(value.result)
    return ''
  }
  return String(value)
}

const HEADER_KEYWORDS = [
  'date', 'narration', 'description', 'particular', 'remark', 'detail',
  'merchant', 'transaction', 'amount', 'category', 'debit', 'credit',
  'type', 'tag', 'label',
]

// Bank/card statement exports routinely print a letterhead — your name and
// address, a payment-due summary, credit limit — above the actual
// transaction table, so the header row is rarely row 1. This scans the
// first several rows and picks whichever one reads most like a header
// (multiple cells matching common column-name keywords), rather than
// assuming row 1.
function findHeaderRowNumber(sheet) {
  const scanLimit = Math.min(40, sheet.rowCount)
  let best = { row: 1, score: 0 }
  for (let r = 1; r <= scanLimit; r++) {
    // Count *distinct* cell text, not raw cell count — a merged section
    // title ("Transaction Summary" spanning 6 columns) repeats the same
    // text across every underlying cell and would otherwise outscore the
    // real header row just by being merged wider.
    const seen = new Set()
    let score = 0
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const text = cellText(cell.value).trim().toLowerCase()
      if (!text || seen.has(text)) return
      seen.add(text)
      if (HEADER_KEYWORDS.some((k) => text.includes(k))) score++
    })
    // A real header row names several different columns — require at
    // least 3 distinct cells so a single repeated section title (however
    // keyword-y) can't win.
    if (seen.size >= 3 && score > best.score) best = { row: r, score }
  }
  // Fewer than 2 keyword hits isn't confident enough to call it a header —
  // fall back to row 1 rather than guessing wrong on an unusual layout.
  return best.score >= 2 ? best.row : 1
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

  const headerRowNum = findHeaderRowNumber(sheet)
  const headerRow = sheet.getRow(headerRowNum)
  const headers = []
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = cellText(cell.value).trim()
  })

  const rows = []
  for (let i = headerRowNum + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i)
    if (row.cellCount === 0) continue
    const obj = {}
    let hasValue = false
    headers.forEach((h, colNumber) => {
      if (!h) return
      const value = cellText(row.getCell(colNumber).value)
      obj[h] = value
      if (value !== '') hasValue = true
    })
    if (hasValue) rows.push(obj)
  }

  if (!rows.length) throw new Error("Couldn't find any rows in that spreadsheet.")
  // A merged header cell ("Transaction Details" spanning two columns) shows
  // up once per underlying column — dedupe before returning so the mapping
  // dropdowns don't offer the same column name twice.
  return { headers: [...new Set(headers.filter(Boolean))], rows }
}

export default function SpreadsheetImport({ categories, paidBy, onBack, onImported }) {
  const [step, setStep] = useState(1) // 1 = choose file, 2 = map columns, 3 = review
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [map, setMap] = useState({ date: '', description: '', amount: '', category: '', type: '' })
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [accountGuess, setAccountGuess] = useState({ accountType: null, accountName: null })
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
        category: guessColumn(fields, ['category', 'tag', 'label']),
        // Credit card statements often carry a "Debit/Credit" (or "Dr/Cr")
        // column — a row marked Credit is a payment/refund, not spend, and
        // should default to unchecked in the review table.
        type: guessColumn(fields, ['debit/credit', 'dr/cr', 'cr/dr', 'transaction type', 'dr / cr']),
      })
      // Nothing as rich as a PDF's header to go on here, so this scans the
      // filename plus a small sample of the file's own cell values — e.g.
      // "hdfc_creditcard_aug.csv" or a stray "UPI"/"Debit Card" cell.
      const sample =
        file.name + ' ' + parsedRows.slice(0, 5).map((r) => Object.values(r).join(' ')).join(' ')
      setAccountGuess(guessAccountInfo(sample))
      setStep(2)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  function buildRows() {
    const built = rawRows
      .filter((r) => {
        // A statement footer ("** End of Statement **") often lands in the
        // same merged row across every column, including the amount one —
        // drop anything that isn't even a parseable number rather than show
        // a junk "₹?" row in the preview.
        return !isNaN(parseAmount(r[map.amount]))
      })
      .map((r) => {
        let description = String(r[map.description] ?? '').trim()
        const amount = Math.abs(parseAmount(r[map.amount]))
        // Prefer a category already in the source file (many card/bank
        // exports have one) over guessing from the description ourselves.
        const fromColumn = map.category ? normalizeCategoryName(r[map.category]) : ''
        // A "Credit" row in a Debit/Credit column is a payment/refund coming
        // IN, not spend going out — importing it as a regular expense would
        // inflate spending. There's no income/credit concept in this app, so
        // default it unchecked rather than guess at how to represent it; the
        // description is marked so it's obvious why, and it's still one
        // click to include if you actually want it recorded.
        const typeValue = map.type ? String(r[map.type] ?? '').trim().toLowerCase() : ''
        const isCredit = typeValue.includes('credit') && !typeValue.includes('debit')
        if (isCredit) description = `[Credit — payment/refund] ${description}`
        return {
          date: parseDate(r[map.date]),
          description,
          amount,
          category: fromColumn || suggestCategoryName(description) || '',
          include: !isCredit,
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
        headerNote={`${rows.length} rows found — categories come from ${map.category ? 'the column you picked' : "a guess based on each row's description"}, check them over before importing.`}
        guessedAccountType={accountGuess.accountType}
        guessedAccountName={accountGuess.accountName}
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

        <div className="field">
          <label htmlFor="map-category">Category column (optional)</label>
          <select
            id="map-category"
            value={map.category}
            onChange={(e) => setMap({ ...map, category: e.target.value })}
          >
            <option value="">None — guess from description instead</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        {headers.some((h) => guessColumn([h], ['debit/credit', 'dr/cr', 'cr/dr', 'transaction type', 'dr / cr'])) && (
          <div className="field">
            <label htmlFor="map-type">Debit/Credit column (optional)</label>
            <select id="map-type" value={map.type} onChange={(e) => setMap({ ...map, type: e.target.value })}>
              <option value="">None</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <p className="import-hint">
              If set, rows marked "Credit" (payments/refunds, not spend) start unchecked in the next
              step.
            </p>
          </div>
        )}

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
