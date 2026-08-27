// Suggests a category_id for an imported statement row by matching its
// description against your category_rules (fetched from Supabase — see the
// Rules tab). First matching keyword wins. Returns null if nothing matches,
// leaving the row for you to categorize by hand.
//
// `rules` is an array of { keyword, category_id }.
export function suggestCategoryId(description, rules) {
  const d = (description || '').toLowerCase()
  for (const rule of rules) {
    if (d.includes(rule.keyword.toLowerCase())) return rule.category_id
  }
  return null
}
