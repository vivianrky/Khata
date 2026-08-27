import { useRef, useState } from 'react'
import { parseStatementText, guessAccountInfo } from './parsing'
import { suggestCategoryName } from '../categorize'
import ReviewImport from './ReviewImport'

async function extractPdfText(file, password) {
  // Bundled as a real dependency (not loaded from a CDN at runtime) so this
  // doesn't depend on a third-party script being reachable — the one thing
  // the reference design this was inspired by got bitten by.
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href

  const buf = await file.arrayBuffer()
  let doc
  try {
    doc = await pdfjsLib.getDocument({ data: buf, password }).promise
  } catch (e) {
    // Most Indian bank/card statements are password-protected (usually
    // your PAN, date of birth, or a bank-specific convention printed on
    // the statement's first page or emailed with it). pdfjs throws this
    // specific exception rather than a generic parse error when a
    // password is missing or wrong — surfaced as a distinct error so the
    // UI can prompt for one instead of just saying "couldn't read file."
    if (e.name === 'PasswordException') {
      const needsPassword = new Error('PASSWORD_REQUIRED')
      needsPassword.wrongPassword = e.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD
      throw needsPassword
    }
    throw e
  }

  let text = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // Text items come back unordered w.r.t. visual lines — group by their
    // y-position on the page to reconstruct rows before scanning for
    // dates/amounts.
    const lines = {}
    for (const item of content.items) {
      const y = Math.round(item.transform[5])
      lines[y] = (lines[y] || '') + item.str + ' '
    }
    text +=
      Object.keys(lines)
        .sort((a, b) => b - a)
        .map((k) => lines[k])
        .join('\n') + '\n'
  }
  return text
}

async function extractImageText(file) {
  // tesseract.js downloads its OCR engine (wasm) and language data on first
  // use — needs a normal internet connection, same as any other npm
  // package that ships this way. HEIC photos (the default on iPhone) aren't
  // supported here; switch your phone's camera format to "Most Compatible"
  // (JPEG) or use a screenshot instead.
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const {
      data: { text },
    } = await worker.recognize(file)
    return text
  } finally {
    await worker.terminate()
  }
}

const KIND_CONFIG = {
  pdf: {
    label: 'PDF statement',
    accept: '.pdf,application/pdf',
    hint: 'Text is pulled from the PDF and scanned for dates and amounts. Works best on statements with a real text layer, not a scanned image. Password-protected PDFs are supported — you\'ll be asked for the password.',
    buttonLabel: 'Choose PDF file',
    extract: extractPdfText,
  },
  image: {
    label: 'Photo / screenshot',
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    hint: 'A photo or screenshot is run through on-device text recognition, then scanned for dates and amounts. This is the least reliable method — check every row carefully.',
    buttonLabel: 'Choose image',
    extract: extractImageText,
  },
}

export default function ExtractImport({ kind, categories, paidBy, onBack, onImported }) {
  const [status, setStatus] = useState('idle') // idle | extracting | error | needs-password | review
  const [fileName, setFileName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [password, setPassword] = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const [rows, setRows] = useState([])
  const [accountGuess, setAccountGuess] = useState({ accountType: null, accountName: null })
  const fileInput = useRef(null)
  const config = KIND_CONFIG[kind]

  async function handleFile(file, pw) {
    setFileName(file.name)
    setStatus('extracting')
    try {
      const text = await config.extract(file, pw)
      const parsed = parseStatementText(text)
      if (!parsed.length) {
        setErrorMsg(
          "Couldn't spot anything that looked like a transaction line. Try a clearer file, or use CSV/Excel import instead if you have one.",
        )
        setStatus('error')
        return
      }
      setAccountGuess(guessAccountInfo(text))
      setRows(
        parsed.map((r) => ({
          ...r,
          category: suggestCategoryName(r.description) || '',
          include: true,
        })),
      )
      setStatus('review')
    } catch (e) {
      if (e.message === 'PASSWORD_REQUIRED') {
        setPendingFile(file)
        setPasswordError(e.wrongPassword ? 'Wrong password — try again.' : '')
        setStatus('needs-password')
        return
      }
      setErrorMsg(`Couldn't read that file (${e.message}). Try CSV/Excel import instead if you have one.`)
      setStatus('error')
    }
  }

  function handlePasswordSubmit(e) {
    e.preventDefault()
    handleFile(pendingFile, password)
  }

  if (status === 'review') {
    return (
      <ReviewImport
        rows={rows}
        setRows={setRows}
        categories={categories}
        paidBy={paidBy}
        headerNote={`${rows.length} rows found — text extraction is never perfect, so check every row (especially dates and amounts) before importing.`}
        guessedAccountType={accountGuess.accountType}
        guessedAccountName={accountGuess.accountName}
        onBack={() => {
          setStatus('idle')
          setRows([])
        }}
        onImported={onImported}
      />
    )
  }

  if (status === 'needs-password') {
    return (
      <div>
        <p className="import-hint">
          {fileName} is password-protected. Most Indian bank/card statements use your PAN, date of
          birth, or a bank-specific format — check the email or page the statement came with if
          you're not sure.
        </p>
        <form onSubmit={handlePasswordSubmit} className="tx-form">
          <div className="field">
            <label htmlFor="pdf-password">PDF password</label>
            <input
              id="pdf-password"
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {passwordError && <div className="error-banner">{passwordError}</div>}
          <div className="import-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setStatus('idle')
                setPassword('')
                setPendingFile(null)
              }}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button">
              Unlock and continue
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div>
      <p className="import-hint">{config.hint}</p>

      <input
        ref={fileInput}
        type="file"
        accept={config.accept}
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
          disabled={status === 'extracting'}
          onClick={() => fileInput.current?.click()}
        >
          {status === 'extracting' ? 'Reading…' : config.buttonLabel}
        </button>
      </div>

      {status === 'extracting' && <p className="import-hint">{fileName} — this can take a moment.</p>}
      {status === 'error' && <div className="error-banner">{errorMsg}</div>}
    </div>
  )
}
