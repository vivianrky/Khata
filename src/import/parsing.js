// Parsing helpers shared by every import method (CSV, Excel, PDF, photo).

export function parseAmount(raw) {
  if (raw == null) return NaN
  // Strips currency symbols/commas/spaces and turns "(500)" into "-500",
  // a common way statements show a negative/refund amount.
  const cleaned = String(raw)
    .replace(/[₹,\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1')
  return parseFloat(cleaned)
}

const pad2 = (n) => String(n).padStart(2, '0')

export function parseDate(raw) {
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
export function guessColumn(headers, patterns) {
  return headers.find((h) => patterns.some((p) => h.toLowerCase().includes(p))) || ''
}

// Lines that are almost never an actual transaction — statement headers,
// running totals, page footers — but can still contain something that
// looks like a date or amount (a year number, a balance figure) and would
// otherwise get pulled in as a fake row.
const SKIP_LINE_PATTERN =
  /\b(statement period|opening balance|closing balance|available balance|total debits?|total credits?|grand total|sub[\s-]?total|brought forward|carried forward|\bb\/f\b|\bc\/f\b|page \d+|generated on)\b/i

const DATE_PATTERNS = [
  /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/,
  /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
  /\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/,
]
const AMOUNT_PATTERN = /(?:₹|rs\.?|inr)?\s*(-?\(?\d[\d,]*\.\d{1,2}\)?|-?\(?\d[\d,]{2,}\)?)\s*(cr|dr)?/gi

// Best-effort line parser for text pulled from a PDF or a photo — there are
// no fixed columns to rely on, so it hunts for a date and an amount per
// line and treats what's left as the description. This is never fully
// reliable (OCR especially), which is exactly why the review table always
// comes next and nothing is saved without you looking it over first.
export function parseStatementText(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const rows = []

  for (const line of lines) {
    if (SKIP_LINE_PATTERN.test(line)) continue

    const amtMatches = [...line.matchAll(AMOUNT_PATTERN)].filter(
      (m) => m[1] && m[1].replace(/[^\d]/g, '').length >= 2,
    )
    if (!amtMatches.length) continue

    let dateStr = ''
    for (const p of DATE_PATTERNS) {
      const dm = line.match(p)
      if (dm) {
        dateStr = dm[1]
        break
      }
    }

    const last = amtMatches[amtMatches.length - 1]
    const amount = parseAmount(last[1])
    if (isNaN(amount) || amount === 0) continue

    let description = line.replace(last[0], '').replace(dateStr, '').replace(/\s{2,}/g, ' ').trim()
    if (description.length < 2) description = line.slice(0, 90)

    rows.push({
      date: dateStr ? parseDate(dateStr) : '',
      description: description.slice(0, 120),
      amount: Math.abs(amount),
    })
  }

  return rows
}
