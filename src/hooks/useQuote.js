import { useEffect, useState } from 'react'
import { listQuotes } from '../lib/api/quotes'
import { quotes as mockQuotes } from '../data/mock'

const pickQuote = (list) => {
  const usable = (list || []).filter((q) => q && q.text)
  if (!usable.length) return null
  return usable[Math.floor(Math.random() * usable.length)]
}

/* Loads the quotes pool and picks one random quote once per session.
   Falls back to the mock pool if the table is empty or the read fails. */
export function useQuote() {
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      let list
      try {
        list = await listQuotes()
      } catch {
        list = null
      }
      const final = list && list.length ? list : (mockQuotes || [])
      if (active) {
        setQuote(pickQuote(final))
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  return { quote, loading }
}
