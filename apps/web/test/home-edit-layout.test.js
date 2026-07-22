/* ════════════════════════════════════════════════════════════════
   HOME-EDIT-LAYOUT SUITE — the operations the on-screen home editor
   performs (lib/preferences moveWidgetTo / moveWidgetBefore /
   setWidgetVisible / visibleWidgets / hiddenWidgets).

   These are deliberately pure so the interaction layer — long-press, drag,
   the ✕ badge — carries no logic of its own. A drag reports "this widget is
   now over that one", never an index, which is why moveWidgetBefore exists.

   The load-bearing rule: hiding leaves the widget IN PLACE. Removing it and
   appending on restore would silently reshuffle a layout the user arranged.

   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import {
  moveWidgetTo, moveWidgetBefore, setWidgetVisible, visibleWidgets, hiddenWidgets,
} from '../src/lib/preferences'

const list = () => [
  { id: 'a', enabled: true },
  { id: 'b', enabled: true },
  { id: 'c', enabled: true },
  { id: 'd', enabled: true },
]
const ids = (l) => l.map((w) => w.id)

describe('moveWidgetTo', () => {
  it('moves forward', () => {
    expect(ids(moveWidgetTo(list(), 'a', 2))).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves backward', () => {
    expect(ids(moveWidgetTo(list(), 'd', 0))).toEqual(['d', 'a', 'b', 'c'])
  })

  it('clamps an index past the end instead of dropping the widget', () => {
    expect(ids(moveWidgetTo(list(), 'a', 99))).toEqual(['b', 'c', 'd', 'a'])
  })

  it('clamps a negative index', () => {
    expect(ids(moveWidgetTo(list(), 'c', -5))).toEqual(['c', 'a', 'b', 'd'])
  })

  it('is a no-op for an unknown id', () => {
    expect(ids(moveWidgetTo(list(), 'zzz', 0))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('never mutates the input', () => {
    const original = list()
    moveWidgetTo(original, 'a', 3)
    expect(ids(original)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps the list the same length', () => {
    expect(moveWidgetTo(list(), 'b', 3)).toHaveLength(4)
  })
})

describe('moveWidgetBefore — what a drag actually reports', () => {
  it('drops the dragged widget onto the target position, moving forward', () => {
    expect(ids(moveWidgetBefore(list(), 'a', 'c'))).toEqual(['b', 'c', 'a', 'd'])
  })

  it('drops it onto the target position, moving backward', () => {
    expect(ids(moveWidgetBefore(list(), 'd', 'b'))).toEqual(['a', 'd', 'b', 'c'])
  })

  it('is a no-op when dragged over itself', () => {
    expect(ids(moveWidgetBefore(list(), 'b', 'b'))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('is a no-op with no target — a drag that ended over nothing', () => {
    expect(ids(moveWidgetBefore(list(), 'b', null))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('is a no-op for an unknown target', () => {
    expect(ids(moveWidgetBefore(list(), 'b', 'zzz'))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('repeated drags compose without losing anyone', () => {
    let l = list()
    l = moveWidgetBefore(l, 'a', 'd')
    l = moveWidgetBefore(l, 'c', 'b')
    expect(l).toHaveLength(4)
    expect(new Set(ids(l)).size).toBe(4)
  })
})

describe('setWidgetVisible', () => {
  it('hides IN PLACE rather than removing', () => {
    /* The load-bearing rule: restoring must put it back where it was, not
       append it to the end of a layout the user arranged. */
    const l = setWidgetVisible(list(), 'b', false)
    expect(ids(l)).toEqual(['a', 'b', 'c', 'd'])
    expect(l[1].enabled).toBe(false)
  })

  it('restores in place after other widgets moved around it', () => {
    let l = setWidgetVisible(list(), 'b', false)
    l = moveWidgetBefore(l, 'd', 'a')
    l = setWidgetVisible(l, 'b', true)
    expect(ids(l)).toEqual(['d', 'a', 'b', 'c'])
    expect(ids(visibleWidgets(l))).toEqual(['d', 'a', 'b', 'c'])
  })

  it('is a no-op for an unknown id', () => {
    expect(setWidgetVisible(list(), 'zzz', false)).toHaveLength(4)
  })

  it('never mutates the input', () => {
    const original = list()
    setWidgetVisible(original, 'a', false)
    expect(original[0].enabled).toBe(true)
  })
})

describe('visibleWidgets / hiddenWidgets', () => {
  const mixed = [
    { id: 'a', enabled: true },
    { id: 'b', enabled: false },
    { id: 'c' },                    // absent flag counts as visible
    { id: 'd', enabled: false },
  ]

  it('splits the list and preserves order in both halves', () => {
    expect(ids(visibleWidgets(mixed))).toEqual(['a', 'c'])
    expect(ids(hiddenWidgets(mixed))).toEqual(['b', 'd'])
  })

  it('treats a missing enabled flag as visible', () => {
    /* migrateWidgets writes enabled:true, but a hand-edited or older blob
       may not have it — defaulting to hidden would blank someone's home. */
    expect(ids(visibleWidgets([{ id: 'x' }]))).toEqual(['x'])
  })

  it('together they account for every widget, with none counted twice', () => {
    expect(visibleWidgets(mixed).length + hiddenWidgets(mixed).length).toBe(mixed.length)
  })

  it('survive an empty or missing list', () => {
    expect(visibleWidgets([])).toEqual([])
    expect(hiddenWidgets(undefined)).toEqual([])
  })
})
