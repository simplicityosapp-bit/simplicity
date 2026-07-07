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
  moonDeep: '#5a6a8c', moonHi: '#b8c4e0', onBrand: '#FFFFFF',
  border: 'rgba(42,37,32,0.08)', glassBorder: 'rgba(255,255,255,0.5)', divider: 'rgba(42,37,32,0.07)',
}
const DARK = {
  bg: '#14130F', card: '#22262B', cardFlat: '#2A2F36',
  glassTint: 'rgba(28,33,40,0.55)', scrim: 'rgba(8,10,8,0.46)', blurTint: 'dark',
  text: '#F0EBE0', textSub: '#C3CBC0', textFaint: '#8B948C',
  brand: '#C97B5E', brandSoft: 'rgba(201,123,94,0.22)', positive: '#8FB08C', amberWarn: '#C99A6A', danger: '#D98C76',
  moonDeep: '#9aa6c8', moonHi: '#e6edff', onBrand: '#FFFFFF',
  border: 'rgba(240,235,224,0.12)', glassBorder: 'rgba(255,255,255,0.12)', divider: 'rgba(240,235,224,0.08)',
}

// Mutable — the single object every screen imports. applyThemeColors mutates it
// in place (same reference) so all `import { colors }` see the active palette.
export const colors = { ...LIGHT }

export const type = {
  displayXL: { fontSize: 34, fontWeight: '600', color: colors.text },
  displayL: { fontSize: 24, fontWeight: '600', color: colors.text },
  heading: { fontSize: 17, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text },
  caption: { fontSize: 13, fontWeight: '500', color: colors.textSub },
  micro: { fontSize: 11, fontWeight: '500', color: colors.textFaint },
}

// Apply a palette in place (colors + the color-carrying type entries), BEFORE any
// screen's StyleSheet.create runs. Called from index.js boot.
export function applyThemeColors(mode) {
  Object.assign(colors, mode === 'dark' ? DARK : LIGHT)
  type.displayXL.color = colors.text
  type.displayL.color = colors.text
  type.heading.color = colors.text
  type.body.color = colors.text
  type.caption.color = colors.textSub
  type.micro.color = colors.textFaint
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
