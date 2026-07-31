/* ════════════════════════════════════════════════════════════════
   PAGE SETUP — what a public page still needs before it is shareable.
   ════════════════════════════════════════════════════════════════
   Both builders (the block engine behind landing/lead pages, and the booking
   builder) can save a page that is technically stored and practically unusable:
   no internal name, so the list reads "דף ללא שם" three times over, and no
   address, so the link you hand a client is a raw uuid.

   Nothing asked for either. The name only surfaced as a save error in the
   booking builder, and the address was a field halfway down a settings panel
   that opens closed. This module is the single answer to "is this page set up
   yet?", so the wizard, both builders and the tests agree on one definition.

   REQUIRED means the page is not usable without it and the wizard will not
   close until it is filled. SUGGESTED means the wizard offers it once and
   takes no for an answer — an empty slug still resolves, it is just ugly.
   ════════════════════════════════════════════════════════════════ */

export const SETUP_FIELDS = { TITLE: 'title', SLUG: 'slug' }

/* What is still missing on a page.
     page  — { title, slug, published }
   Returns { required: [...], suggested: [...] }, both arrays of SETUP_FIELDS. */
export function missingSetup(page) {
  const title = String(page?.title ?? '').trim()
  const slug = String(page?.slug ?? '').trim()
  return {
    required: title ? [] : [SETUP_FIELDS.TITLE],
    suggested: slug ? [] : [SETUP_FIELDS.SLUG],
  }
}

/* Should the setup wizard open after this save?

   `firstSave` is the builder telling us this is the first successful save of a
   page in this editing session. On its own that is not enough — re-opening a
   finished page and pressing save should not re-ask — so it only counts while
   the page has no address and has never been published, which together mean
   "nobody has set this up yet".

   Anything REQUIRED that is missing always opens it, whenever that happens. */
export function needsSetupWizard(page, { firstSave = false } = {}) {
  const { required } = missingSetup(page)
  if (required.length) return true
  if (!firstSave) return false
  return !String(page?.slug ?? '').trim() && !page?.published
}
