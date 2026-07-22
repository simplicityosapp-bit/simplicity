import { forwardRef } from 'react'

/*
 * Input — the text-field primitive.
 *
 * TODAY (web): renders a plain, controlled/uncontrolled <input>. Every
 * prop (value, onChange, placeholder, type, className, aria-*) passes
 * straight through — no wrapping <div>, no behavioural change.
 *
 * TOMORROW (React Native): becomes <TextInput> here. Note RN uses
 * onChangeText rather than onChange(e) — that adapter will live in this
 * one file, keeping call-sites stable.
 *
 * One behavioural addition: a focused <input type="number"> swallows the
 * mouse wheel and silently steps its own value, so scrolling the page with
 * the cursor over an amount field rewrites the amount without the user
 * noticing. Blurring on wheel gives the scroll back to the page. Only
 * type="number" is affected, and a caller's own onWheel still runs.
 */
const Input = forwardRef(function Input({ onWheel, ...props }, ref) {
  const handleWheel = props.type === 'number'
    ? (e) => { onWheel?.(e); if (document.activeElement === e.currentTarget) e.currentTarget.blur() }
    : onWheel
  return <input ref={ref} {...props} onWheel={handleWheel} />
})

export default Input
