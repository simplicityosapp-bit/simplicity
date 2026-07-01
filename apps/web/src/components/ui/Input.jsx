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
 */
const Input = forwardRef(function Input(props, ref) {
  return <input ref={ref} {...props} />
})

export default Input
