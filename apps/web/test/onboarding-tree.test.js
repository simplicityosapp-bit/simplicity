/* ════════════════════════════════════════════════════════════════
   ONBOARDING — the tree grows, and it finishes grown.
   ════════════════════════════════════════════════════════════════
   The stage was `stepIndex + 2`, which landed on the full canopy only
   because the flow happened to have nine steps. Cutting it to five would
   have quietly stopped the tree at stage 6 — the payoff of the whole
   metaphor never shown, and nothing anywhere would have failed.

   These pin the two promises regardless of how many steps the flow has:
   it ends on stage 10, and it only ever grows. The asset check is the
   other half — a stage with no file renders a broken image, which no
   type or lint catches.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { treeStage } from '../src/screens/onboarding/treeStage'
import { ONBOARDING_STEPS } from '../src/lib/preferences'

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'onboarding-tree')
const stagesFor = (total) => Array.from({ length: total }, (_, i) => treeStage(i, total))

describe('the current flow', () => {
  const stages = stagesFor(ONBOARDING_STEPS.length)

  it('starts past the bare seedling', () => {
    /* Stage 1 is reserved for a pre-flow placement. */
    expect(stages[0]).toBe(2)
  })

  it('ends on the full canopy', () => {
    expect(stages.at(-1)).toBe(10)
  })

  it('has an image on disk for every step', () => {
    for (const stage of stages) {
      expect(existsSync(join(ASSETS, `${stage}.png`)), `missing onboarding-tree/${stage}.png`).toBe(true)
    }
  })

  it('grows by an even stride, skipping middles rather than repeating', () => {
    expect(stages).toEqual([2, 4, 6, 8, 10])
  })
})

describe('any step count', () => {
  /* The flow has been nine steps and is now five; it will change again. */
  for (const total of [2, 3, 4, 5, 6, 8, 9, 10]) {
    it(`ends on the canopy with ${total} steps`, () => {
      expect(stagesFor(total).at(-1)).toBe(10)
    })

    it(`never shrinks with ${total} steps`, () => {
      const stages = stagesFor(total)
      for (let i = 1; i < stages.length; i++) expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1])
    })

    it(`stays inside the asset set with ${total} steps`, () => {
      for (const stage of stagesFor(total)) {
        expect(stage).toBeGreaterThanOrEqual(1)
        expect(stage).toBeLessThanOrEqual(10)
        expect(existsSync(join(ASSETS, `${stage}.png`))).toBe(true)
      }
    })
  }
})

describe('out-of-range input', () => {
  it('clamps rather than pointing at a file that does not exist', () => {
    /* stepIndex comes from indexOf, which returns -1 for an unknown step. */
    expect(treeStage(-1, 5)).toBe(2)
    expect(treeStage(99, 5)).toBe(10)
  })

  it('survives a single-step flow', () => {
    expect(treeStage(0, 1)).toBe(2)
  })
})
