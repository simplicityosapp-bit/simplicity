/* ════════════════════════════════════════════════════════════════
   SETTINGS TREE — the shape of the settings screen, shared by both apps.
   ════════════════════════════════════════════════════════════════
   Keys only: which sections exist, and which group holds each one. The
   titles live in the `settings` i18n namespace (also shared), and the
   ICONS stay in each app — web draws from lucide-react, mobile from
   lucide-react-native, and the two packages are not interchangeable.

   Why here and not once per app: the two screens each held their own copy
   of this list while reading their labels from the SAME namespace. Web
   regrouped on 2026-07-28 and mobile — untouched, unbuilt, its own file —
   silently started rendering raw keys as headings, because every title it
   asked for had been retired out from under it. Nothing failed loudly;
   the drift was only visible by opening the screen, on a platform that
   currently has no device to open it on.

   So the structure is stated once. An app can still choose not to render
   a section (mobile has no home-screen widget editor on some builds), but
   it can no longer disagree about what the tree IS.
   ════════════════════════════════════════════════════════════════ */

export interface SettingsGroup {
  /** i18n: groups.<key>.title / .sub */
  key: string
  /** i18n: sections.<key>.title / .sub — and the deep-link contract. */
  items: string[]
  /**
   * Rows that LEAVE settings, rendered after the group's sections.
   * i18n: links.<key>.title / .sub. Each app resolves the key to its own
   * destination, because the two navigation systems share no vocabulary —
   * a react-router path means nothing to react-navigation. An app that
   * cannot resolve a key simply doesn't draw that row.
   */
  links?: string[]
}

/* Group order is the screen order. Section order within a group likewise.

   The shape answers two complaints about the five groups this replaced:
   every appearance setting now sits in ONE group (עיצוב used to be filed
   under "אישי" while the group subtitled "עיצוב המסך" held the widgets),
   and the irreversible actions have a door of their own instead of living
   at the bottom of the export/import scroll. */
export const SETTINGS_TREE: SettingsGroup[] = [
  { key: 'personal', items: ['profile'] },
  { key: 'appearance', items: ['design', 'home', 'payments'] },
  {
    key: 'work',
    items: ['meetingTypes', 'questions'],
    /* Both taxonomies are edited on the screen that USES them, and settings
       points at those screens rather than keeping thinner copies.

       Neither link was safe until the destination could actually host the
       editor. Leads was: its screen already had stages and sources. Clients
       was not — that screen only READ statuses, so the settings section was
       the only place in the app able to create or delete one, and a link
       would have removed the feature rather than moved it. Both editors now
       live on their screens (ClientStatusesModal, LeadSourcesPanel), which
       is what makes these rows honest. */
    links: ['clients', 'leads'],
  },
  /* `reset`, not `account` — a section must never share its group's name. */
  {
    key: 'account',
    items: ['data', 'reset', 'about'],
    /* Settings was a dead end: the neighbouring screens a user looks for
       here ("where do I connect my calendar?") live only in the side menu. */
    links: ['connections', 'trash', 'subscription'],
  },
]

/* Section key → the group holding it. A deep link only ever names the
   SECTION it wants ("open the profile"), and a section renders solely
   inside an open group — so a caller passing the section alone used to
   land on a fully-collapsed screen with nothing to show for the click.
   The group is derivable, so it is derived rather than asked of every
   call site, where it can only be forgotten again. */
export function groupOfSection(sectionKey: string | null | undefined): string | null {
  if (!sectionKey) return null
  const group = SETTINGS_TREE.find((g) => g.items.includes(sectionKey))
  return group ? group.key : null
}

/* The one section a group holds, or null when it holds several. A
   one-section group is that section: both apps render its body directly
   under the group header rather than opening a door onto a door. */
export function soleSectionKeyOf(group: SettingsGroup | null | undefined): string | null {
  return group?.items?.length === 1 ? group.items[0] : null
}
