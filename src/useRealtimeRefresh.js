import { useEffect } from 'react'
import { supabase } from './supabaseClient'

// Subscribes to every change on `table` and calls `onChange` — used so a
// second device (or a second tab) picks up new/edited/deleted rows without
// a manual refresh. Realtime events still go through the table's row-level
// security, so this only ever fires for rows the current login could
// already see with a normal query.
//
// `onChange` belongs in the dependency array (not swallowed with an eslint
// disable): pass a useCallback-wrapped loader, and this hook re-subscribes
// whenever that loader's own dependencies change — e.g. Budget.jsx's loader
// closes over the selected month, so switching months here re-subscribes
// with the fresh closure instead of going on calling a stale one bound to
// whatever month was selected at mount time.
export function useRealtimeRefresh(table, onChange) {
  useEffect(() => {
    const channel = supabase
      .channel(`${table}-changes-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, onChange])
}
