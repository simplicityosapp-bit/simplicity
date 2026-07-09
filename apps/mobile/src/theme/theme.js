import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Warm Precision (Mångata) tokens, mapped from apps/web tokens.css. Light is the
// default; dark mirrors the web [data-theme="dark"] "Moonlight" remap.
//
// RN freezes StyleSheet.create() colors at module load, so the active palette is
// applied ONCE at boot (index.js: read the saved mode → applyThemeColors → then
// dynamically import the app) BEFORE any screen module evaluates. Switching theme
// persists the choice and reloads the app (like the RTL flip).

const LIGHT = {
  bg: '#F7F3EE', card: '#FFFCF7', cardFlat: '#F5EFE2',
  glassTint: 'rgba(255,252,247,0.34)', scrim: 'rgba(247,243,238,0.14)', blurTint: 'light',
  text: '#2A2520', textSub: '#2C2621', textFaint: '#3A332B',
  brand: '#C97B5E', brandSoft: '#F4E3DA', positive: '#8BA888', amberWarn: '#D4A574', danger: '#B5634E',
  moon: '#8a96b8', moonDeep: '#5a6a8c', moonHi: '#b8c4e0', onBrand: '#FFFFFF',
  border: 'rgba(42,37,32,0.08)', glassBorder: 'rgba(255,255,255,0.5)', divider: 'rgba(42,37,32,0.06)',
  // Theme-aware surface fills — subtle chips/pills/badges, input fields, toggle
  // knobs. These flip for dark mode (a dark tint on a dark card would vanish).
  fill: 'rgba(42,37,32,0.05)', fillStrong: 'rgba(42,37,32,0.08)', inputBg: 'rgba(255,255,255,0.4)', knob: '#FFFFFF',
  panelBg: 'rgba(255,252,247,0.74)', // drawer frosted panel veil (over the blur)
}
const DARK = {
  bg: '#15140F', card: '#20242A', cardFlat: '#282D34',
  glassTint: 'rgba(24,28,34,0.62)', scrim: 'rgba(8,11,16,0.30)', blurTint: 'dark',
  text: '#F0EBE0', textSub: '#C3CBC0', textFaint: '#8B948C',
  brand: '#C97B5E', brandSoft: 'rgba(201,123,94,0.24)', positive: '#8FB08C', amberWarn: '#C99A6A', danger: '#D98C76',
  moon: '#c9d2ec', moonDeep: '#9aa6c8', moonHi: '#e6edff', onBrand: '#FFFFFF',
  border: 'rgba(240,235,224,0.12)', glassBorder: 'rgba(255,255,255,0.10)', divider: 'rgba(240,235,224,0.14)',
  fill: 'rgba(255,255,255,0.06)', fillStrong: 'rgba(255,255,255,0.11)', inputBg: 'rgba(255,255,255,0.06)', knob: '#E8E4DA',
  panelBg: 'rgba(20,24,29,0.86)',
}

// Mutable — the single object every screen imports. applyThemeColors mutates it
// in place (same reference) so all `import { colors }` see the active palette.
export const colors = { ...LIGHT }

export const type = {
  displayXL: { fontSize: 36, fontWeight: '500', color: colors.text },
  displayL: { fontSize: 24, fontWeight: '500', color: colors.text },
  heading: { fontSize: 17, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text },
  caption: { fontSize: 13, fontWeight: '500', color: colors.textSub },
  micro: { fontSize: 11, fontWeight: '500', color: colors.textFaint },
}

// The mode actually applied this session (set at boot). The drawer toggle reads
// THIS (not prefs) so it always reflects what's on screen — prefs can lag the
// AsyncStorage boot cache (and is empty in the preview mock).
let activeMode = 'light'
export function getThemeMode() { return activeMode }

// Apply a palette in place (colors + the color-carrying type entries), BEFORE any
// screen's StyleSheet.create runs. Called from index.js boot.
export function applyThemeColors(mode) {
  activeMode = mode === 'dark' ? 'dark' : 'light'
  Object.assign(colors, activeMode === 'dark' ? DARK : LIGHT)
  type.displayXL.color = colors.text
  type.displayL.color = colors.text
  type.heading.color = colors.text
  type.body.color = colors.text
  type.caption.color = colors.textSub
  type.micro.color = colors.textFaint
  applyBackgroundSet(activeMode)
}

export const THEME_KEY = 'mg-theme'
// Persist the choice + reload so boot re-runs with the new palette (RN freezes
// StyleSheet colors, so a live swap isn't possible — mirrors the RTL reload).
export async function persistThemeAndReload(mode) {
  try { await AsyncStorage.setItem(THEME_KEY, mode) } catch { /* best-effort */ }
  if (Platform.OS === 'web') { try { window.location.reload() } catch { /* noop */ } return }
  try { require('react-native').DevSettings.reload() } catch { /* prod needs expo-updates.reloadAsync() */ }
}

export const radius = { card: 20, pill: 999 }
export const space = { screenPadH: 20, cardPadV: 16, cardPadH: 16, gap: 12, headerTop: 56 }
export const shadow = {
  card: { shadowColor: '#2A2520', shadowOpacity: 0.07, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
}

// Per-screen background photos, mapped like web's --screen-bg. Web keeps a
// separate day + night photo per screen and swaps on [data-theme]; mirror that
// with two sets so dark mode gets a genuinely dark, atmospheric image (not a
// day photo buried under a heavy scrim).
const DAY_BG = {
  login: require('../../assets/backgrounds/home.webp'), // pre-auth login/signup screen
  home: require('../../assets/backgrounds/home.webp'),
  clients: require('../../assets/backgrounds/clients.webp'),
  finance: require('../../assets/backgrounds/finance.webp'),
  goals: require('../../assets/backgrounds/goals.webp'),
  leads: require('../../assets/backgrounds/leads.webp'),
  calendar: require('../../assets/backgrounds/calendar.webp'),
  tasks: require('../../assets/backgrounds/tasks.webp'),
  moon: require('../../assets/backgrounds/moon.webp'),
  reports: require('../../assets/backgrounds/reports.webp'), // used by the 'simple' bg mode
}
const NIGHT_BG = {
  login: require('../../assets/backgrounds/night/home.webp'),
  home: require('../../assets/backgrounds/night/home.webp'),
  clients: require('../../assets/backgrounds/night/clients.webp'),
  finance: require('../../assets/backgrounds/night/finance.webp'),
  goals: require('../../assets/backgrounds/night/goals.webp'),
  leads: require('../../assets/backgrounds/night/leads.webp'),
  calendar: require('../../assets/backgrounds/night/calendar.webp'),
  tasks: require('../../assets/backgrounds/night/tasks.webp'),
  moon: require('../../assets/backgrounds/night/moon.webp'),
  reports: require('../../assets/backgrounds/night/reports.webp'),
}
// The active set flips with the boot palette (same reasoning as `colors`).
export const backgrounds = { ...DAY_BG }
function applyBackgroundSet(mode) { Object.assign(backgrounds, mode === 'dark' ? NIGHT_BG : DAY_BG) }
applyBackgroundSet(activeMode)
