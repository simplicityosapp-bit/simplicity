import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import './SelectMenu.css'

/* Standard styled dropdown for modal forms — replaces the native <select> so the
   OPEN menu matches the design language (cream-glass popover, terracotta rows,
   ✓ on the selected row) instead of the OS-native list.

   It inline-expands within the (scrollable) modal body rather than floating an
   absolutely-positioned popover, so it can never be clipped by the sheet's
   overflow. Optional search; options flagged `searchOnly` are hidden until the
   user types (used by the client picker: active clients show on first open, the
   full roster becomes reachable via search). `accent` styles an action row
   (e.g. "new client"/"new category"). */
export default function SelectMenu({
  value,
  onChange,
  options,
  placeholder = '',
  ariaLabel,
  searchable = false,
  searchPlaceholder = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const searchRef = useRef(null)
  const listId = useId()

  const selected = options.find((o) => String(o.value) === String(value))
  const q = query.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!q) return options.filter((o) => !o.searchOnly)
    return options.filter((o) => (o.label || '').toLowerCase().includes(q))
  }, [options, q])

  /* Close on outside click. */
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  /* Focus the search box when the menu opens. */
  useEffect(() => { if (open && searchable) searchRef.current?.focus() }, [open, searchable])

  const pick = (o) => { onChange(o.value); setOpen(false); setQuery('') }

  /* Escape closes only the menu — stop it bubbling to the Modal's window
     listener (which would close the whole sheet). */
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setQuery('') }
  }

  return (
    <div className={`sel${disabled ? ' disabled' : ''}`} ref={wrapRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={`sel-trigger${open ? ' open' : ''}`}
        onClick={() => { if (!disabled) setOpen((v) => !v) }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className={`sel-value${selected ? '' : ' placeholder'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} strokeWidth={1.6} className="sel-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="sel-menu" role="listbox" id={listId}>
          {searchable && (
            <div className="sel-search">
              <Search size={14} strokeWidth={1.7} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
              />
            </div>
          )}
          <div className="sel-options">
            {visible.length === 0 ? (
              <p className="sel-empty">—</p>
            ) : visible.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={String(o.value) === String(value)}
                className={`sel-opt${String(o.value) === String(value) ? ' on' : ''}${o.accent ? ' accent' : ''}`}
                onClick={() => pick(o)}
              >
                <span className="sel-opt-label">{o.label}</span>
                {String(o.value) === String(value) && <Check size={14} strokeWidth={2} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
