import { createElement, forwardRef } from 'react'

/*
 * Box — the layout/container primitive.
 *
 * TODAY (web): renders a plain <div> (or any tag via `as`), fully
 * transparent to the DOM — className, style, onClick, data-*, aria-*,
 * refs, everything passes straight through. Wrapping a <div> in <Box>
 * changes nothing about the rendered markup or the CSS that targets it.
 *
 * TOMORROW (React Native): this is the ONE place we swap the mapping —
 * `createElement(as, ...)` becomes `<View>`. 187 call-sites don't move.
 *
 * `as` lets a Box keep the exact original tag (e.g. <section>, <ul>) so
 * the migration stays a structural no-op on web.
 */
const Box = forwardRef(function Box({ as = 'div', children, ...rest }, ref) {
  return createElement(as, { ref, ...rest }, children)
})

export default Box
