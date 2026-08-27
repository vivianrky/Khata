import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function Rules({ categories }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('category_rules')
      .select('id, keyword, category_id, categories(name)')
      .order('created_at')

    if (error) {
      setError(error.message)
    } else {
      setRules(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addRule(e) {
    e.preventDefault()
    if (!keyword.trim() || !categoryId) return

    const { error } = await supabase
      .from('category_rules')
      .insert({ keyword: keyword.trim().toLowerCase(), category_id: categoryId })

    if (error) {
      // A duplicate keyword hits the table's unique constraint — surface
      // that plainly rather than a raw Postgres error code.
      setError(error.code === '23505' ? `"${keyword.trim()}" is already a rule.` : error.message)
      return
    }

    setKeyword('')
    setError(null)
    load()
  }

  async function removeRule(id) {
    const { error } = await supabase.from('category_rules').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  return (
    <div>
      <p className="import-hint">
        When importing a statement, any transaction whose description contains one of these
        keywords gets that category suggested automatically. Shared between both of you.
      </p>

      <form onSubmit={addRule} className="rule-form">
        <input
          type="text"
          placeholder="keyword, e.g. swiggy"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit">Add</button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="empty-state">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="empty-state">No rules yet.</p>
      ) : (
        <ul className="rule-list">
          {rules.map((r) => (
            <li key={r.id} className="rule-row">
              <span className="rule-keyword">{r.keyword}</span>
              <span className="rule-arrow">→</span>
              <span className="rule-category">{r.categories?.name ?? '—'}</span>
              <button
                type="button"
                className="rule-remove"
                aria-label={`Remove rule for ${r.keyword}`}
                onClick={() => removeRule(r.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
