// Back-compat shim — usePreferences now lives in the app-wide PreferencesProvider
// (lib/preferences.js) so all screens share one reactive prefs instance.
export { usePreferences } from '../lib/preferences'
