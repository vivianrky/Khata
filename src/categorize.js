// Best-effort auto-categorization for imported statement rows: if a
// transaction's description contains one of these keywords, we suggest the
// matching category. First match wins. You can always change the category
// per row before importing, and this only ever *suggests* — nothing is
// final until you click "Import."
export const DEFAULT_RULES = [
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

// Returns a category *name* (matching one of the rows in the `categories`
// table), or null if nothing matched — the row is left for you to pick.
export function suggestCategory(description) {
  const d = (description || '').toLowerCase()
  for (const rule of DEFAULT_RULES) {
    if (d.includes(rule.keyword)) return rule.category
  }
  return null
}
