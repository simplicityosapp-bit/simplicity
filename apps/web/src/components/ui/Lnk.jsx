import { forwardRef } from 'react'

/*
 * Lnk — the hyperlink primitive (a plain <a href>, NOT a react-router Link).
 *
 * TODAY (web): renders an <a>, fully transparent — href, className,
 * target, rel, children all pass through.
 *
 * WHY its own primitive (not `Box as="a"`): in React Native a link is not
 * a View — it's a pressable that calls Linking.openURL(href). Giving links
 * their own seam here means that behaviour swaps in this one file instead
 * of silently degrading to a non-navigable View on migration.
 */
const Lnk = forwardRef(function Lnk({ children, ...rest }, ref) {
  return (
    <a ref={ref} {...rest}>
      {children}
    </a>
  )
})

export default Lnk
