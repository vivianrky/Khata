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

const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

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

  // "13 Aug 2026" / "13 August 2026".
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/)
  if (m) {
    const mo = MONTH_NAMES[m[2].slice(0, 3).toLowerCase()]
    if (mo) {
      let y = m[3]
      if (y.length === 2) y = '20' + y
      return `${y}-${pad2(mo)}-${pad2(m[1])}`
    }
  }

  // "13 Aug" — no year. Many card/UPI apps show recent transactions this
  // way, on the assumption it's obviously "this year". Same assumption
  // here, since there's nothing else to go on — the review step always
  // shows the resulting date so it's easy to correct if a statement
  // happens to span a year boundary.
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})$/)
  if (m) {
    const mo = MONTH_NAMES[m[2].slice(0, 3).toLowerCase()]
    if (mo) {
      const year = new Date().getFullYear()
      return `${year}-${pad2(mo)}-${pad2(m[1])}`
    }
  }

  // Fall back to JS's parser for anything else unambiguous.
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
  /\b(statement period|opening balance|closing balance|available balance|total debits?|total credits?|grand total|sub[\s-]?total|brought forward|carried forward|\bb\/f\b|\bc\/f\b|page \d+|generated on|card no|a\/c no|acc(?:ount)?\s*no|account number|card number)\b/i

const DATE_PATTERNS = [
  /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/,
  /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
  /\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/,
  // No-year fallback ("13 Aug") — tried last so a line with a real year
  // still matches that instead. The (?!\s+\d) guard stops this from eating
  // just the first two words of a "13 Aug 2026" the earlier pattern
  // somehow missed (defends against odd whitespace from OCR).
  /\b(\d{1,2}\s+[A-Za-z]{3,9})\b(?!\s+\d)/,
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

    const amtMatches = [...line.matchAll(AMOUNT_PATTERN)].filter((m) => {
      if (!m[1] || m[1].replace(/[^\d]/g, '').length < 2) return false
      // A masked card/account number ("XXXX XXXX XXXX 1234", "**** 1234")
      // ends in real digits that otherwise look exactly like an amount —
      // reject a match whose immediately preceding text is masking
      // characters, even without an explicit "Card No" label on the line.
      const before = line.slice(Math.max(0, m.index - 6), m.index)
      if (/[Xx*]{2,}[\s-]*$/.test(before)) return false
      return true
    })
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

// Common Indian bank/card issuer names — used only to build a readable
// account label ("HDFC •• 9850"), not to change how anything is parsed.
const BANK_NAMES = [
  'hdfc', 'icici', 'sbi', 'axis', 'kotak', 'idfc first', 'idfc', 'yes bank',
  'rbl', 'indusind', 'american express', 'amex', 'citibank', 'pnb',
  'bank of baroda', 'bob', 'canara', 'union bank', 'federal bank',
  'au small finance', 'au bank', 'hsbc', 'standard chartered', 'scb',
  'idbi', 'central bank', 'indian bank', 'uco bank', 'karnataka bank',
]

// Best-effort guess at which account a statement/photo belongs to, from
// whatever text is available (extracted PDF/OCR text, or a spreadsheet's
// filename + a sample of its own content). Never blocks anything — the
// review step always shows the result so a wrong guess is just as easy to
// fix as a blank field would have been.
export function guessAccountInfo(text) {
  const t = (text || '').toLowerCase()

  let accountType = null
  if (/\bupi\b/.test(t)) accountType = 'upi'
  else if (/\bcredit\s*card\b/.test(t)) accountType = 'credit_card'
  else if (/\bdebit\s*card\b/.test(t)) accountType = 'debit_card'

  const bank = BANK_NAMES.find((b) => t.includes(b))

  // A masked account/card number: "XX 9850", "XXXX-XXXX-XXXX-1234",
  // "**** 1234" — statements almost always show one of these instead of
  // the full number.
  const maskedMatch = text.match(/\b(?:[Xx*]{2,}[\s-]?){1,4}\d{2,4}\b/)

  const parts = []
  if (bank) {
    parts.push(
      bank
        .split(' ')
        .map((w) => w.toUpperCase())
        .join(' '),
    )
  }
  if (maskedMatch) parts.push(maskedMatch[0].replace(/\s+/g, ' ').trim())

  return {
    accountType,
    accountName: parts.length ? parts.join(' ') : null,
  }
}
