/* ════════════════════════════════════════════════════════════════
   SETTINGS SEARCH — answering "where do I change X?"
   ════════════════════════════════════════════════════════════════
   The tree is four groups deep-ish and holds seven sections plus four
   rows out. That is small enough to browse and still large enough that a
   user who wants ONE thing has to guess which heading it lives under:
   is the currency filed under money, or under display? (It is under
   "מראה ותצוגה", with the date and time formats — obvious once you know.)

   Matching is deliberately dumb — substring, over three sources:
     • the section's title
     • its subtitle
     • a list of SYNONYMS in the settings namespace (search.keywords.*)

   The synonyms are the part that earns its keep. Nobody types "מטבע"
   when what they want is "שקל", or "גודל טקסט" when the word in their
   head is "פונט". Those live in i18n like any other copy, so each
   language gets the words its speakers actually reach for rather than a
   translation of someone else's.
   ════════════════════════════════════════════════════════════════ */

/* Fold a query and a haystack to the same shape before comparing. Latin
   text lowercases; Hebrew has no case, so this is a no-op there and the
   quotation marks users copy from a label are what the trim handles. */
const fold = (s) => String(s || '').toLowerCase().trim()

/* Every string a given key can be found by. `t` is the settings-namespace
   translator; a key with no synonym list just isn't findable by synonym. */
function haystack(t, kind, key) {
  return [
    t(`${kind}.${key}.title`, { defaultValue: '' }),
    t(`${kind}.${key}.sub`, { defaultValue: '' }),
    t(`search.keywords.${key}`, { defaultValue: '' }),
  ].map(fold).join(' ')
}

export function matches(t, kind, key, query) {
  const q = fold(query)
  if (!q) return true
  return haystack(t, kind, key).includes(q)
}

/* The tree, filtered to what a query matches. Returns one entry per group
   that still has anything in it, carrying only the sections and link rows
   that matched — so the screen renders the answer rather than the tree
   with the answer somewhere inside it.

   An empty query returns every group whole, which is what lets the screen
   use one render path for both states. */
export function searchTree(groups, t, query) {
  const q = fold(query)
  if (!q) return groups.map((group) => ({ group, items: group.items, links: group.links || [] }))
  return groups
    .map((group) => ({
      group,
      items: group.items.filter((key) => matches(t, 'sections', key, q)),
      links: (group.links || []).filter((link) => matches(t, 'links', link.key, q)),
    }))
    .filter((entry) => entry.items.length > 0 || entry.links.length > 0)
}
