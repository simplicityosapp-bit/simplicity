/* ════════════════════════════════════════════════════════════════
   WHEN DOES A PAGE STILL NEED SETTING UP?
   ════════════════════════════════════════════════════════════════
   Two builders ask this question after every save, and the answer decides
   whether a modal appears in someone's face. Getting it wrong in one direction
   nags a coach on every save of a finished page; in the other it lets a page
   through with no name, so the list reads "דף ללא שם" three times over, and no
   address, so the link handed to a client is a raw uuid.

   The rules, each asserted below:
     • a missing NAME always opens it — that one is required
     • a missing address alone does NOT, except on the page's first save
     • "first save" only counts while the page has no address and is not live;
       re-opening a finished page and pressing save must not re-ask
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { missingSetup, needsSetupWizard, SETUP_FIELDS } from '../src/lib/pageSetup'

describe('missingSetup', () => {
  it('calls out a blank name as required and a blank address as suggested', () => {
    expect(missingSetup({ title: '', slug: '' })).toEqual({
      required: [SETUP_FIELDS.TITLE],
      suggested: [SETUP_FIELDS.SLUG],
    })
  })

  it('treats whitespace as blank', () => {
    expect(missingSetup({ title: '   ', slug: '  ' }).required).toEqual([SETUP_FIELDS.TITLE])
  })

  it('is content with a filled page', () => {
    const m = missingSetup({ title: 'פגישת היכרות', slug: 'intro' })
    expect(m.required).toEqual([])
    expect(m.suggested).toEqual([])
  })

  it('survives a missing page object', () => {
    expect(missingSetup(undefined).required).toEqual([SETUP_FIELDS.TITLE])
  })
})

describe('needsSetupWizard', () => {
  it('opens whenever the name is missing, first save or not', () => {
    expect(needsSetupWizard({ title: '', slug: 'intro', published: true })).toBe(true)
    expect(needsSetupWizard({ title: '', slug: 'intro' }, { firstSave: true })).toBe(true)
  })

  it('opens on the first save of a page with no address that is not live', () => {
    expect(needsSetupWizard({ title: 'שם', slug: '', published: false }, { firstSave: true })).toBe(true)
  })

  it('stays shut on later saves of that same page', () => {
    expect(needsSetupWizard({ title: 'שם', slug: '', published: false })).toBe(false)
  })

  it('stays shut on a first save of a page already set up', () => {
    expect(needsSetupWizard({ title: 'שם', slug: 'intro', published: false }, { firstSave: true })).toBe(false)
    expect(needsSetupWizard({ title: 'שם', slug: '', published: true }, { firstSave: true })).toBe(false)
  })

  it('never nags a finished page', () => {
    const page = { title: 'פגישת היכרות', slug: 'intro', published: true }
    expect(needsSetupWizard(page)).toBe(false)
    expect(needsSetupWizard(page, { firstSave: true })).toBe(false)
  })
})
