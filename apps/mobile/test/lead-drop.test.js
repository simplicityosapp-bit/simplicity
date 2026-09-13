/* Lead drag-and-drop: which column a drop lands in.

   Whatever this returns is written to the lead as its new status, so a
   wrong answer is wrong data. It used to resolve by X alone: a card
   dragged upward to abort — over the header, off the board — still
   "landed" in whichever column shared that x, and the lead moved. */

import { describe, it, expect } from 'vitest'
import { resolveDropColumn } from '../src/lib/leadDrop'

// Three 280pt columns with 12pt gaps, board 700pt wide starting at x=20,
// y=300 in the window, 400pt tall.
const board = { x: 20, y: 300, width: 700, height: 400 }
const columns = {
  new: { x: 0, width: 280 },
  talking: { x: 292, width: 280 },
  closed: { x: 584, width: 280 },
}
const order = ['new', 'talking', 'closed']
const drop = (x, y, extra = {}) => resolveDropColumn({ x, y, board, columns, order, scrollX: 0, ...extra })

describe('resolveDropColumn', () => {
  it('finds the column under the finger', () => {
    expect(drop(20 + 10, 450)).toBe('new')
    expect(drop(20 + 300, 450)).toBe('talking')
  })

  it('treats both column edges as inside', () => {
    expect(drop(20 + 0, 450)).toBe('new')
    expect(drop(20 + 280, 450)).toBe('new')
  })

  it('returns nothing in the gap between columns', () => {
    expect(drop(20 + 286, 450)).toBeNull()
  })

  it('accounts for how far the board is scrolled', () => {
    // Scrolled right by 584: the first column visible is "closed".
    expect(drop(20 + 10, 450, { scrollX: 584 })).toBe('closed')
  })

  describe('the abort gesture', () => {
    it('does not drop when the finger is above the board', () => {
      // Same x as the "new" column, but up over the screen header.
      expect(drop(20 + 10, 120)).toBeNull()
    })

    it('does not drop when the finger is below the board', () => {
      expect(drop(20 + 300, 300 + 400 + 1)).toBeNull()
    })

    it('treats the board edges as inside', () => {
      expect(drop(20 + 10, 300)).toBe('new')
      expect(drop(20 + 10, 700)).toBe('new')
    })
  })

  it('falls back to x alone before the board has been measured', () => {
    // height 0 = onLayout has not landed yet; refusing every drop would be worse.
    const unmeasured = { x: 20, y: 0, width: 700, height: 0 }
    expect(resolveDropColumn({ x: 30, y: 9999, board: unmeasured, columns, order })).toBe('new')
  })

  it('returns nothing without a board or without a measured column', () => {
    expect(resolveDropColumn({ x: 30, y: 450, board: null, columns, order })).toBeNull()
    expect(drop(20 + 10, 450, { columns: {} })).toBeNull()
  })
})
