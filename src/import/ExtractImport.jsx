import { useRef, useState } from 'react'
import { parseStatementText } from './parsing'
import { suggestCategoryName } from '../categorize'
import ReviewImport from './ReviewImport'

async function extractPdfText(file) {
  // Bundled as a real dependency (not loaded from a CDN at runtime) so this
  // doesn't depend on a third-party script being reachable — the one thing
  // the reference design this was inspired by got bitten by.
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href

  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
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
    hint: 'Text is pulled from the PDF and scanned for dates and amounts. Works best on statements with a real text layer, not a scanned image.',
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
  const [status, setStatus] = useState('idle') // idle | extracting | error | review
  const [fileName, setFileName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [rows, setRows] = useState([])
  const fileInput = useRef(null)
  const config = KIND_CONFIG[kind]

  async function handleFile(file) {
    setFileName(file.name)
    setStatus('extracting')
    try {
      const text = await config.extract(file)
      const parsed = parseStatementText(text)
      if (!parsed.length) {
        setErrorMsg(
          "Couldn't spot anything that looked like a transaction line. Try a clearer file, or use CSV/Excel import instead if you have one.",
        )
        setStatus('error')
        return
      }
      setRows(
        parsed.map((r) => ({
          ...r,
          category: suggestCategoryName(r.description) || '',
          include: true,
        })),
      )
      setStatus('review')
    } catch (e) {
      setErrorMsg(`Couldn't read that file (${e.message}). Try CSV/Excel import instead if you have one.`)
      setStatus('error')
    }
  }

  if (status === 'review') {
    return (
      <ReviewImport
        rows={rows}
        setRows={setRows}
        categories={categories}
        paidBy={paidBy}
        headerNote={`${rows.length} rows found — text extraction is never perfect, so check every row (especially dates and amounts) before importing.`}
        onBack={() => {
          setStatus('idle')
          setRows([])
        }}
        onImported={onImported}
      />
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
