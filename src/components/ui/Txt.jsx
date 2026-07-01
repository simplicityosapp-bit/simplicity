import { createElement, forwardRef } from 'react'

/*
 * Txt — the text primitive.
 *
 * TODAY (web): renders an inline <span> by default, or any tag via `as`
 * (e.g. `as="p"`, `as="h2"`, `as="label"`). The tag is preserved exactly
 * so block/inline behaviour and CSS selectors keep working untouched —
 * a <p> stays a real <p>, a <span> stays a real <span>.
 *
 * TOMORROW (React Native): every Txt collapses to a single <Text>. In RN
 * all strings MUST live inside <Text>, so routing every piece of copy
 * through this primitive now is what makes that migration mechanical.
 */
const Txt = forwardRef(function Txt({ as = 'span', children, ...rest }, ref) {
  return createElement(as, { ref, ...rest }, children)
})

export default Txt
