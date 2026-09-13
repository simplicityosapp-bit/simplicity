/* Which kanban column a dragged lead is over — or none.
   ────────────────────────────────────────────────────────────────
   Pure on purpose. This decision moves data: whatever it returns is the
   status the lead is written to when the finger lifts. It lived as a
   closure inside LeadsScreen reading four refs, which is why its bug went
   unnoticed — nothing could call it with a coordinate and look.

   The bug: it resolved the column from X alone. Drag a card UPWARD to
   abort — over the header, off the board entirely — and it still returned
   whichever column shared that x, so a gesture that meant "never mind"
   moved the lead. A drop now has to happen over the board vertically too.

   While the board has not been measured yet (height 0) the vertical check
   is skipped rather than failing every drop: a drag that starts in the
   first frame behaves as it always did instead of refusing to land.

   Coordinates:
     x, y     — the finger, in window coordinates
     board    — { x, y, width, height } of the board, window coordinates
     scrollX  — the board's current horizontal scroll offset
     columns  — { [key]: { x, width } } in board-CONTENT coordinates
     order    — column keys, in the order they are laid out */
export function resolveDropColumn({ x, y, board, scrollX = 0, columns, order }) {
  if (!board) return null
  if (board.height > 0 && (y < board.y || y > board.y + board.height)) return null
  const relX = x - board.x + scrollX
  for (const key of order) {
    const c = columns[key]
    if (c && relX >= c.x && relX <= c.x + c.width) return key
  }
  return null
}
