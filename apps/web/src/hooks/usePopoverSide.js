import { useLayoutEffect, useState } from 'react'

/* Global rule: a popover/menu should open TOWARD the centre of the screen
   so it never spills off an edge (which CSS alone can't decide, since it
   doesn't know the anchor's position relative to the viewport centre).

   Pass the anchor element ref + whether the popover is open. Returns the
   physical side ('left' | 'right') to pin the popover to with value 0
   (the popover is position:absolute inside a position:relative anchor):
     - anchor on the right half  → pin right:0  → opens leftward  (to centre)
     - anchor on the left half   → pin left:0   → opens rightward (to centre)
   Use:  const side = usePopoverSide(ref, open);  style={{ [side]: 0 }} */
export function usePopoverSide(anchorRef, open) {
  const [side, setSide] = useState('right')
  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const anchorCentre = (r.left + r.right) / 2
    setSide(anchorCentre > window.innerWidth / 2 ? 'right' : 'left')
  }, [open, anchorRef])
  return side
}
