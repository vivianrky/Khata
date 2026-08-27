import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

const fmtINR = (n) =>
  Math.round(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const currentMonthStr = () => new Date().toISOString().slice(0, 7) // "2026-08"
const monthStrToDate = (monthStr) => `${monthStr}-01`
function nextMonthDate(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  const next = new Date(Date.UTC(y, m, 1)) // m is already 1-indexed next month
  return next.toISOString().slice(0, 10)
}

export default function Budget({ categories }) {
  const [person, setPerson] = useState('')
  const [knownPeople, setKnownPeople] = useState([])
  const [monthStr, setMonthStr] = useState(currentMonthStr())
  const [salary, setSalary] = useState('')
  const [allocations, setAllocations] = useState({}) // category_id -> amount string
  const [spentByCategory, setSpentByCategory] = useState({}) // category_id (or 'none') -> amount
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [savedNote, setSavedNote] = useState('')

  // Suggests names already used elsewhere in the app, so typos don't split
  // one person's data across two spellings.
  useEffect(() => {
    supabase
      .from('transactions')
      .select('paid_by')
      .then(({ data }) => {
        if (!data) return
        setKnownPeople([...new Set(data.map((r) => r.paid_by).filter(Boolean))])
      })
  }, [])

  const load = useCallback(async () => {
    if (!person.trim()) return
    setLoading(true)
    setError(null)
    const month = monthStrToDate(monthStr)
    const nextMonth = nextMonthDate(monthStr)

    const [salaryRes, allocRes, txRes] = await Promise.all([
      supabase.from('salaries').select('amount').eq('person', person.trim()).eq('month', month).maybeSingle(),
      supabase.from('budget_allocations').select('category_id, amount').eq('person', person.trim()).eq('month', month),
      supabase
        .from('transactions')
        .select('amount, category_id')
        .eq('paid_by', person.trim())
        .gte('transaction_date', month)
        .lt('transaction_date', nextMonth),
    ])

    if (salaryRes.error || allocRes.error || txRes.error) {
      setError((salaryRes.error || allocRes.error || txRes.error).message)
      setLoading(false)
      return
    }

    setSalary(salaryRes.data ? String(salaryRes.data.amount) : '')

    const allocMap = {}
    for (const row of allocRes.data) allocMap[row.category_id] = String(row.amount)
    setAllocations(allocMap)

    const spentMap = {}
    for (const t of txRes.data) {
      const key = t.category_id || 'none'
      spentMap[key] = (spentMap[key] || 0) + Number(t.amount)
    }
    setSpentByCategory(spentMap)

    setLoading(false)
  }, [person, monthStr])

  useEffect(() => {
    load()
  }, [load])

  async function saveSalary() {
    if (!person.trim() || salary === '') return
    const { error } = await supabase
      .from('salaries')
      .upsert(
        { person: person.trim(), month: monthStrToDate(monthStr), amount: Number(salary) },
        { onConflict: 'person,month' },
      )
    if (error) {
      setError(error.message)
      return
    }
    setSavedNote('Salary saved')
    setTimeout(() => setSavedNote(''), 1500)
  }

  async function saveAllocation(categoryId, value) {
    setAllocations((a) => ({ ...a, [categoryId]: value }))
    if (value === '') return
    const { error } = await supabase
      .from('budget_allocations')
      .upsert(
        { person: person.trim(), month: monthStrToDate(monthStr), category_id: categoryId, amount: Number(value) },
        { onConflict: 'person,month,category_id' },
      )
    if (error) setError(error.message)
  }

  const totals = useMemo(() => {
    const totalAllocated = Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0)
    const totalSpent = Object.values(spentByCategory).reduce((s, v) => s + v, 0)
    const overspend = categories.reduce((s, c) => {
      const allocated = Number(allocations[c.id]) || 0
      const spent = spentByCategory[c.id] || 0
      return s + Math.max(0, spent - allocated)
    }, 0)
    const uncategorizedSpend = spentByCategory.none || 0
    const salaryNum = Number(salary) || 0
    const unbudgeted = salaryNum - totalAllocated
    const leftover = salaryNum - totalSpent
    return { totalAllocated, totalSpent, overspend, uncategorizedSpend, unbudgeted, leftover }
  }, [allocations, spentByCategory, categories, salary])

  return (
    <div>
      <p className="import-hint">
        Set your salary and how much you're allocating to each category for the month, then see how
        actual spending compares — including money that's spent but never budgeted anywhere.
      </p>

      <div className="budget-controls">
        <div className="field">
          <label htmlFor="budget-person">Person</label>
          <input
            id="budget-person"
            type="text"
            list="known-people"
            placeholder="Your name"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          />
          <datalist id="known-people">
            {knownPeople.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="budget-month">Month</label>
          <input
            id="budget-month"
            type="month"
            value={monthStr}
            onChange={(e) => setMonthStr(e.target.value)}
          />
        </div>
      </div>

      {!person.trim() ? (
        <p className="empty-state">Enter a name above to set up a budget.</p>
      ) : (
        <>
          <div className="budget-salary-row">
            <div className="field">
              <label htmlFor="budget-salary">Salary this month (₹)</label>
              <input
                id="budget-salary"
                type="number"
                min="0"
                step="0.01"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                onBlur={saveSalary}
              />
            </div>
            {savedNote && <span className="budget-saved-note">{savedNote}</span>}
          </div>

          {error && <div className="error-banner">{error}</div>}

          {loading ? (
            <p className="empty-state">Loading…</p>
          ) : (
            <>
              <div className="stat-row budget-stat-row">
                <div className="stat-tile">
                  <div className="stat-label">Allocated</div>
                  <div className="stat-value">{fmtINR(totals.totalAllocated)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">Spent</div>
                  <div className="stat-value">{fmtINR(totals.totalSpent)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">Left in salary</div>
                  <div className={`stat-value ${totals.leftover < 0 ? 'stat-negative' : ''}`}>
                    {fmtINR(totals.leftover)}
                  </div>
                </div>
              </div>

              <div className="stat-row budget-stat-row">
                <div className="stat-tile">
                  <div className="stat-label">Unbudgeted salary</div>
                  <div className={`stat-value stat-value-sm ${totals.unbudgeted < 0 ? 'stat-negative' : ''}`}>
                    {fmtINR(totals.unbudgeted)}
                  </div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">Over-budget total</div>
                  <div className={`stat-value stat-value-sm ${totals.overspend > 0 ? 'stat-negative' : ''}`}>
                    {fmtINR(totals.overspend)}
                  </div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">Uncategorized spend</div>
                  <div className={`stat-value stat-value-sm ${totals.uncategorizedSpend > 0 ? 'stat-negative' : ''}`}>
                    {fmtINR(totals.uncategorizedSpend)}
                  </div>
                </div>
              </div>

              <div className="tx-table-wrap">
                <table className="tx-table budget-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Allocated</th>
                      <th>Spent</th>
                      <th>Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => {
                      const allocated = Number(allocations[c.id]) || 0
                      const spent = spentByCategory[c.id] || 0
                      const remaining = allocated - spent
                      return (
                        <tr key={c.id}>
                          <td>{c.name}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={allocations[c.id] ?? ''}
                              onChange={(e) => setAllocations((a) => ({ ...a, [c.id]: e.target.value }))}
                              onBlur={(e) => saveAllocation(c.id, e.target.value)}
                            />
                          </td>
                          <td className="tx-amount">₹{spent}</td>
                          <td className={remaining < 0 ? 'stat-negative' : ''}>{fmtINR(remaining)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
