// Warm Precision (Mångata) design tokens, mapped from apps/web tokens.css to
// RN-friendly values. The single source the mobile screens read (analogous to
// the web's CSS custom properties + Box/Txt primitives).

export const colors = {
  // surfaces
  bg: '#F7F3EE', // bone — screen base (behind the photo, and where no photo)
  card: '#FFFCF7', // cream — opaque surface (non-glass contexts)
  cardFlat: '#F5EFE2', // warm cream — pressed / alt surface
  glassTint: 'rgba(255,252,247,0.34)', // cream veil @ ~0.30 like web --mg-card-bg (heavy native blur carries the rest)
  scrim: 'rgba(247,243,238,0.14)', // very soft warm veil — keep the photo crisp (was washing it out)
  // text — matches web tokens.css EXACTLY (stone/mist were darkened 24.05.26 to
  // near-black for max legibility over the day-view photo backgrounds).
  text: '#2A2520', // espresso — headings, numbers, body
  textSub: '#2C2621', // stone — labels, secondary, icons (near-black, per web)
  textFaint: '#3A332B', // mist — placeholders, meta (near-black, per web)
  // brand + status
  brand: '#C97B5E', // terracotta — primary, key accent
  brandSoft: '#F4E3DA', // blush — highlight / selected
  positive: '#8BA888', // sage — success / goals / urgent
  amberWarn: '#D4A574', // soft amber — attention rows (not a hard danger)
  danger: '#B5634E', // clay — real warnings only
  moonDeep: '#5a6a8c', // dusk blue — daily-question slider fill / thumb
  moonHi: '#b8c4e0', // light dusk — slider gradient top (web --moon-hi)
  onBrand: '#FFFFFF',
  // lines
  border: 'rgba(42,37,32,0.08)',
  glassBorder: 'rgba(255,255,255,0.5)',
  divider: 'rgba(42,37,32,0.07)',
}

export const type = {
  displayXL: { fontSize: 34, fontWeight: '600', color: colors.text }, // huge numbers
  displayL: { fontSize: 24, fontWeight: '600', color: colors.text }, // card numbers
  heading: { fontSize: 17, fontWeight: '600', color: colors.text }, // card titles
  body: { fontSize: 15, fontWeight: '400', color: colors.text }, // body
  caption: { fontSize: 13, fontWeight: '500', color: colors.textSub }, // secondary
  micro: { fontSize: 11, fontWeight: '500', color: colors.textFaint }, // labels under numbers
}

export const radius = { card: 20, pill: 999 }
export const space = { screenPadH: 20, cardPadV: 16, cardPadH: 16, gap: 12, headerTop: 56 }
export const shadow = {
  // Web --mg-card-shadow: 0 1px 2px @0.04, 0 8px 24px @0.06 — RN takes one layer,
  // so approximate the soft ambient one (8px offset, 24 blur, low opacity).
  card: { shadowColor: '#2A2520', shadowOpacity: 0.07, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
}

// Per-screen background photos (day set), mapped like web's --screen-bg.
export const backgrounds = {
  home: require('../../assets/backgrounds/home.webp'),
  clients: require('../../assets/backgrounds/clients.webp'),
  finance: require('../../assets/backgrounds/finance.webp'),
  goals: require('../../assets/backgrounds/goals.webp'),
  leads: require('../../assets/backgrounds/leads.webp'),
  calendar: require('../../assets/backgrounds/calendar.webp'),
  tasks: require('../../assets/backgrounds/tasks.webp'),
  moon: require('../../assets/backgrounds/moon.webp'),
}
