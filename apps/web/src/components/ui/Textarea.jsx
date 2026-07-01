import { forwardRef } from 'react'

/*
 * Textarea — the multi-line text-field primitive.
 *
 * TODAY (web): renders a plain <textarea>. Every prop (value, onChange,
 * rows, placeholder, className, aria-*) passes straight through.
 *
 * TOMORROW (React Native): becomes <TextInput multiline /> here. As with
 * Input, the onChange(e) → onChangeText adapter lives in this one file.
 */
const Textarea = forwardRef(function Textarea(props, ref) {
  return <textarea ref={ref} {...props} />
})

export default Textarea
