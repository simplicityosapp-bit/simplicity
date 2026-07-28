/* ════════════════════════════════════════════════════════════════
   SETTINGS — this app's view of the shared section tree.
   ════════════════════════════════════════════════════════════════
   The STRUCTURE (which sections exist, which group holds each) lives in
   @simplicity/core, because mobile renders the same tree from the same
   i18n namespace and the two copies drifted the moment web regrouped.
   What stays here is the part that cannot be shared: the icons, which
   come from lucide-react and have no meaning in a React Native build.

   Its own module rather than the screen file so `groupOfSection` can be
   exported (and tested) while the screen keeps exporting nothing but its
   component — which is what react-refresh needs to hot-reload it.
   ════════════════════════════════════════════════════════════════ */

import {
  User, Palette, LayoutGrid, Wallet, CalendarClock, Sparkles, Users, Leaf,
  Database, Trash2, Info, Eye, Briefcase, Settings2, Plug, Gem,
} from 'lucide-react'
import { SETTINGS_TREE, groupOfSection, soleSectionKeyOf } from '@simplicity/core'
import { ROUTES } from '../../lib/routes'
import { SUBSCRIPTION_NAV_ENABLED } from '../../lib/subscriptionNav'

/* Section identity. Titles + subtitles are translated at render time via
   t(`sections.${key}.title` / `.sub`); only the icon is decided here. */
const SECTION_ICONS = {
  profile: User,
  design: Palette,
  home: LayoutGrid,
  payments: CalendarClock,
  meetingTypes: Wallet,
  questions: Sparkles,
  data: Database,
  reset: Trash2,
  about: Info,
}

const GROUP_ICONS = {
  personal: User,
  appearance: Eye,
  work: Briefcase,
  account: Settings2,
}

export const SECTION_DEFS = Object.fromEntries(
  Object.entries(SECTION_ICONS).map(([key, icon]) => [
    key,
    { key, icon, titleKey: `sections.${key}.title`, subKey: `sections.${key}.sub` },
  ]),
)

/* Rows that leave settings. `enabled` is evaluated at render, not here —
   the subscription screen is behind a flag that also hides it from the side
   menu, and a row pointing at a screen that redirects home is worse than no
   row. Anything this app can't resolve is simply not drawn. */
const LINK_DEFS = {
  clients: { icon: Users, to: ROUTES.CLIENTS },
  leads: { icon: Leaf, to: ROUTES.LEADS },
  connections: { icon: Plug, to: ROUTES.CONNECTIONS },
  trash: { icon: Trash2, to: ROUTES.TRASH },
  subscription: { icon: Gem, to: ROUTES.SUBSCRIPTION, enabled: () => SUBSCRIPTION_NAV_ENABLED },
}

export const SECTION_GROUPS = SETTINGS_TREE.map((group) => ({
  ...group,
  icon: GROUP_ICONS[group.key],
  titleKey: `groups.${group.key}.title`,
  subKey: `groups.${group.key}.sub`,
  links: (group.links || [])
    .map((key) => (LINK_DEFS[key] ? { key, ...LINK_DEFS[key], titleKey: `links.${key}.title`, subKey: `links.${key}.sub` } : null))
    .filter(Boolean),
}))

/* Re-exported so the screen and its tests have one import to reach for.
   `soleSectionOf` resolves the key to this app's full section def. */
export { groupOfSection }

export function soleSectionOf(group) {
  const key = soleSectionKeyOf(group)
  return key ? SECTION_DEFS[key] : null
}
