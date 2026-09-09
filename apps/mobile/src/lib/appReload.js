import { Platform } from 'react-native'

/* Reload the JS application.
   ────────────────────────────────────────────────────────────────
   Two things in this app need it: switching the palette (RN freezes
   StyleSheet colours at module load, so a new one only takes effect on a
   fresh boot) and wiping the account (every screen is holding rows that
   no longer exist).

   It lives here, alone, because it was written twice — once in
   theme/theme.js and once inside SettingsScreen — and both copies were
   wrong in the same way. They called DevSettings.reload(), which React
   Native assigns ONLY inside `if (__DEV__)`, with no else branch. In a
   release build the module is undefined, the call throws, and a
   surrounding catch swallows it. Both features looked fine in every build
   we tested and did nothing in the one a user installs:

     · the theme switch saved the choice and left the app on the old
       palette until the user killed and reopened it themselves;
     · "delete everything" wiped the account and left every screen showing
       the deleted data, which reads as the delete having failed.

   Updates.reloadAsync() is the path that works in a release build. With
   OTA unconfigured — how this app ships — the native side falls to
   DisabledUpdatesController, which still implements
   relaunchReactApplicationForModule with a real RecreateReactContext
   procedure. It throws in __DEV__ by design, so DevSettings remains the
   development fallback.

   Best-effort throughout: a caller has already persisted whatever it
   needed to, so the worst case is that the change applies on next launch,
   never an exception thrown out of the action the user just took. */
export async function reloadApp() {
  if (Platform.OS === 'web') {
    try { if (typeof window !== 'undefined' && window.location) window.location.reload() } catch { /* noop */ }
    return
  }
  try {
    // eslint-disable-next-line global-require
    await require('expo-updates').reloadAsync()
    return
  } catch { /* dev build, or Expo Go — fall through */ }
  // eslint-disable-next-line global-require
  try { require('react-native').DevSettings.reload() } catch { /* applies on next launch */ }
}
