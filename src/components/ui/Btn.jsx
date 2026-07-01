import { forwardRef } from 'react'

/*
 * Btn — the pressable primitive.
 *
 * TODAY (web): renders a real <button>, defaulting to type="button" (the
 * safe default — never accidentally submits a form). All props pass
 * through: className, onClick, disabled, aria-*, type overrides, etc.
 *
 * TOMORROW (React Native): swap the <button> here for <Pressable> /
 * <TouchableOpacity> in this one file. onClick already reads as "on press".
 */
const Btn = forwardRef(function Btn({ type = 'button', children, ...rest }, ref) {
  return (
    <button ref={ref} type={type} {...rest}>
      {children}
    </button>
  )
})

export default Btn
