import { useQuote } from '../../../hooks/useQuote'

/* Picks one quote at random per session — first from the real `quotes` table,
   falling back to the local mock if the table is empty or the read fails. */
export default function QuoteWidget() {
  const { quote } = useQuote()
  if (!quote) {
    return (
      <div className="h-quote">
        <p className="h-quote-text">היום יום חדש. הכל אפשרי.</p>
      </div>
    )
  }
  return (
    <div className="h-quote">
      <p className="h-quote-text">{quote.text}</p>
      {quote.author && <p className="h-quote-author">— {quote.author}</p>}
    </div>
  )
}
