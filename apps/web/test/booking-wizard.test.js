/* ════════════════════════════════════════════════════════════════
   THE CREATION WIZARD'S RULES.
   ════════════════════════════════════════════════════════════════
   Two of these matter more than the rest:

   A step must block only on what the page cannot work without. Every extra
   requirement turns the wizard back into the form it replaced — so "no meeting
   types" and "no words" are allowed to pass, and only "no hours" and "no name"
   stop anyone.

   And a new page must arrive with NO hours. The old default handed every page
   Sunday–Thursday 09:00–17:00, so a page could go live offering times its owner
   never agreed to.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import {
  WIZARD_STEPS, stepBlocker, openDays, nextStep, prevStep, isLastStep,
  provisionalTitle, isProvisionalTitle,
} from '../src/lib/bookingWizard'
import {
  newBookingPageDraft, EMPTY_WEEKLY, WORKWEEK_WEEKLY, applyWorkweek,
  draftFromPage, pausedAtStep, WIZARD_STEP_KEY,
} from '../src/lib/bookingPageSchema'

const HOURS = [{ start: '09:00', end: '17:00' }]

describe('a new page brings no hours of its own', () => {
  it('starts with every day closed', () => {
    const draft = newBookingPageDraft()
    expect(openDays(draft.availability.weekly)).toBe(0)
  })

  it('still carries the numeric settings — only the days are empty', () => {
    const draft = newBookingPageDraft()
    expect(draft.availability.slotMinutes).toBeGreaterThan(0)
    expect(draft.availability.maxDaysAhead).toBeGreaterThan(0)
  })

  it('has all seven days present, so a saved page reads back as closed not absent', () => {
    /* draftFromPage fills missing weekdays from the schema default. A page that
       stored {} would come back offering the work week it never chose. */
    expect(Object.keys(newBookingPageDraft().availability.weekly).sort()).toEqual(
      ['0', '1', '2', '3', '4', '5', '6'],
    )
    expect(Object.keys(EMPTY_WEEKLY)).toHaveLength(7)
  })
})

describe('the work week as a preset', () => {
  it('opens Sunday to Thursday and leaves the weekend closed', () => {
    const av = applyWorkweek({ slotMinutes: 30 })
    expect(openDays(av.weekly)).toBe(5)
    expect(av.weekly[5]).toEqual([])
    expect(av.weekly[6]).toEqual([])
  })

  it('keeps the other availability settings untouched', () => {
    expect(applyWorkweek({ slotMinutes: 15, maxDaysAhead: 90 }).slotMinutes).toBe(15)
  })

  it('hands out a COPY — one page taking the preset cannot rewrite it for the next', () => {
    const first = applyWorkweek({})
    first.weekly[0][0].start = '05:00'
    const second = applyWorkweek({})
    expect(second.weekly[0][0].start, 'the preset itself must be untouched').toBe('09:00')
    expect(WORKWEEK_WEEKLY[0][0].start).toBe('09:00')
  })

  it('survives being handed nothing', () => {
    expect(openDays(applyWorkweek(undefined).weekly)).toBe(5)
  })
})

describe('what each step demands before it lets go', () => {
  const withHours = { availability: { weekly: { ...EMPTY_WEEKLY, 1: HOURS } }, title: '' }

  it('lets step 1 pass with no meeting types — the page then offers one generic meeting', () => {
    expect(stepBlocker('offer', { meeting_type_ids: [] })).toBeNull()
  })

  it('stops step 2 while no day has hours', () => {
    expect(stepBlocker('when', { availability: { weekly: EMPTY_WEEKLY } })).toBe('needsHours')
  })

  it('lets step 2 pass once a single day has hours', () => {
    expect(stepBlocker('when', withHours)).toBeNull()
  })

  it('does not count a day whose window ends before it starts', () => {
    const backwards = { availability: { weekly: { ...EMPTY_WEEKLY, 2: [{ start: '17:00', end: '09:00' }] } } }
    expect(stepBlocker('when', backwards), 'a reversed window seats no meeting').toBe('needsHours')
  })

  it('lets step 3 pass with no words at all — the defaults carry it', () => {
    expect(stepBlocker('look', { content: { heading: '', body: '', logoText: '' } })).toBeNull()
  })

  it('lets step 4 pass untouched', () => {
    expect(stepBlocker('after', {})).toBeNull()
  })

  it('stops the last step without a name', () => {
    expect(stepBlocker('publish', { ...withHours, title: '   ' })).toBe('needsName')
    expect(stepBlocker('publish', { ...withHours, title: 'פגישות היכרות' })).toBeNull()
  })
})

describe('moving between steps', () => {
  it('runs offer → when → look → after → publish', () => {
    expect(WIZARD_STEPS).toEqual(['offer', 'when', 'look', 'after', 'publish'])
  })

  it('walks forward to the end and stops', () => {
    expect(nextStep('offer')).toBe('when')
    expect(nextStep('publish')).toBeNull()
    expect(isLastStep('publish')).toBe(true)
    expect(isLastStep('offer')).toBe(false)
  })

  it('walks back to the first step and stops', () => {
    expect(prevStep('when')).toBe('offer')
    expect(prevStep('offer')).toBeNull()
  })

})

describe('the name a page carries before it is named', () => {
  const BASE = 'דף חדש'

  it('uses the plain name when nothing has taken it', () => {
    expect(provisionalTitle(BASE, [])).toBe(BASE)
    expect(provisionalTitle(BASE, ['פגישות היכרות'])).toBe(BASE)
  })

  it('numbers only when it has to, and skips what is taken', () => {
    expect(provisionalTitle(BASE, [BASE])).toBe(`${BASE} 2`)
    expect(provisionalTitle(BASE, [BASE, `${BASE} 2`])).toBe(`${BASE} 3`)
  })

  it('ignores whitespace differences when deciding what is taken', () => {
    expect(provisionalTitle(BASE, [`  ${BASE}  `])).toBe(`${BASE} 2`)
  })

  it('recognises its own provisional names, so step 5 offers an empty box', () => {
    expect(isProvisionalTitle(BASE, BASE)).toBe(true)
    expect(isProvisionalTitle(`${BASE} 7`, BASE)).toBe(true)
    expect(isProvisionalTitle('', BASE)).toBe(true)
  })

  it('leaves a real name alone', () => {
    expect(isProvisionalTitle('פגישות היכרות', 'דף חדש')).toBe(false)
    expect(isProvisionalTitle('דף חדש לגמרי', 'דף חדש')).toBe(false)
  })
})

describe('parking a page mid-setup', () => {
  it('reports no step for a page nobody paused', () => {
    expect(pausedAtStep({ content: {} })).toBeNull()
    expect(pausedAtStep({})).toBeNull()
    expect(pausedAtStep(null)).toBeNull()
  })

  it('reads back the step it was parked at', () => {
    expect(pausedAtStep({ content: { [WIZARD_STEP_KEY]: 'after' } })).toBe('after')
  })

  it('rebuilds the draft from the parked page, so nothing is retyped', () => {
    const page = {
      title: 'פגישות היכרות',
      auto_confirm: true,
      meeting_type_ids: ['a'],
      availability: { weekly: { ...EMPTY_WEEKLY, 1: [{ start: '10:00', end: '14:00' }] } },
      content: { heading: 'שלום', [WIZARD_STEP_KEY]: 'look' },
    }
    const draft = draftFromPage(page)
    expect(draft.title).toBe('פגישות היכרות')
    expect(draft.auto_confirm).toBe(true)
    expect(draft.meeting_type_ids).toEqual(['a'])
    expect(openDays(draft.availability.weekly)).toBe(1)
    expect(draft.content.heading).toBe('שלום')
  })

  it('keeps the parked step inside content, where the round-trip preserves it', () => {
    /* content is a jsonb blob both editors write back whole — that is the only
       reason this needs no column and no migration. If draftFromPage ever
       stopped spreading page.content, resuming would silently forget. */
    expect(draftFromPage({ content: { [WIZARD_STEP_KEY]: 'when' } }).content[WIZARD_STEP_KEY]).toBe('when')
  })

  it('gives a fresh page no parked step', () => {
    expect(pausedAtStep({ content: newBookingPageDraft().content })).toBeNull()
  })
})
