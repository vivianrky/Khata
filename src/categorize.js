// Categories are no longer a fixed, user-maintained list — the categories
// table builds itself from whatever's actually used: a "Category" column
// found in an imported file, a category typed by hand, or (for PDF/photo
// imports, which have no such column to read) the built-in guess below.
// That guess is fixed app logic now, not an editable "Rules" screen.
const KEYWORD_CATEGORIES = [
  { keyword: 'swiggy', category: 'Dining' },
  { keyword: 'zomato', category: 'Dining' },
  { keyword: 'dominos', category: 'Dining' },
  { keyword: 'mcdonald', category: 'Dining' },
  { keyword: 'starbucks', category: 'Dining' },
  { keyword: 'bigbasket', category: 'Groceries' },
  { keyword: 'blinkit', category: 'Groceries' },
  { keyword: 'zepto', category: 'Groceries' },
  { keyword: 'dmart', category: 'Groceries' },
  { keyword: 'grofers', category: 'Groceries' },
  { keyword: 'more supermarket', category: 'Groceries' },
  { keyword: 'amazon', category: 'Shopping' },
  { keyword: 'flipkart', category: 'Shopping' },
  { keyword: 'myntra', category: 'Shopping' },
  { keyword: 'ajio', category: 'Shopping' },
  { keyword: 'firstcry', category: 'Shopping' },
  { keyword: 'nykaa', category: 'Shopping' },
  { keyword: 'uber', category: 'Transport' },
  { keyword: 'ola', category: 'Transport' },
  { keyword: 'rapido', category: 'Transport' },
  { keyword: 'petrol', category: 'Fuel' },
  { keyword: 'fuel', category: 'Fuel' },
  { keyword: 'indian oil', category: 'Fuel' },
  { keyword: 'hpcl', category: 'Fuel' },
  { keyword: 'bpcl', category: 'Fuel' },
  { keyword: 'netflix', category: 'Entertainment' },
  { keyword: 'hotstar', category: 'Entertainment' },
  { keyword: 'spotify', category: 'Entertainment' },
  { keyword: 'prime video', category: 'Entertainment' },
  { keyword: 'bookmyshow', category: 'Entertainment' },
  { keyword: 'airtel', category: 'Bills & Utilities' },
  { keyword: 'jio', category: 'Bills & Utilities' },
  { keyword: 'bsnl', category: 'Bills & Utilities' },
  { keyword: 'electricity', category: 'Bills & Utilities' },
  { keyword: 'water bill', category: 'Bills & Utilities' },
  { keyword: 'broadband', category: 'Bills & Utilities' },
  { keyword: 'apollo', category: 'Health' },
  { keyword: 'pharmacy', category: 'Health' },
  { keyword: 'hospital', category: 'Health' },
  { keyword: 'clinic', category: 'Health' },
  { keyword: 'medical', category: 'Health' },
  { keyword: 'rent', category: 'Rent / EMI' },
  { keyword: 'emi', category: 'Rent / EMI' },
  { keyword: 'loan', category: 'Rent / EMI' },
  { keyword: 'atm', category: 'Other' },
  { keyword: 'charges', category: 'Other' },
  { keyword: 'gst', category: 'Other' },
]

// Returns a category *name* (not yet resolved to an id — see
// getOrCreateCategoryId), or null if nothing matched.
export function suggestCategoryName(description) {
  const d = (description || '').toLowerCase()
  for (const rule of KEYWORD_CATEGORIES) {
    if (d.includes(rule.keyword)) return rule.category
  }
  return null
}

// Normalizes a category name so the same category, written two different
// ways, becomes one row instead of a duplicate — "MEDICAL", "medical ",
// and "Medical" all become "Medical". Every write path (import, manual
// entry, inline edit) goes through this before touching the database.
export function normalizeCategoryName(raw) {
  const trimmed = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  return trimmed
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

// Looks up a category by (normalized) name, creating it the first time
// it's used — this is how the category list "builds itself." Returns null
// for a blank name (i.e. leave the transaction uncategorized).
export async function getOrCreateCategoryId(supabase, rawName) {
  const name = normalizeCategoryName(rawName)
  if (!name) return null

  const { data: existing } = await supabase.from('categories').select('id').eq('name', name).maybeSingle()
  if (existing) return existing.id

  const { data: created, error } = await supabase.from('categories').insert({ name }).select('id').single()
  if (error) {
    // Unique-constraint violation: something else created the same
    // category name a moment ago (e.g. importing many rows at once).
    // Look it up instead of failing the whole operation over it.
    if (error.code === '23505') {
      const { data: raceWinner } = await supabase.from('categories').select('id').eq('name', name).maybeSingle()
      return raceWinner?.id ?? null
    }
    throw error
  }
  return created.id
}

// Resolves a batch of category names to ids in one pass, creating any that
// don't exist yet. Used when importing many rows at once so each distinct
// new category name is only looked up/created once, not once per row.
export async function resolveCategoryIds(supabase, names) {
  const unique = [...new Set(names.map(normalizeCategoryName).filter(Boolean))]
  const map = new Map()
  for (const name of unique) {
    map.set(name, await getOrCreateCategoryId(supabase, name))
  }
  return map
}
