// MUST be first: makes Hermes's partial Intl safe (Hebrew-calendar DateTimeFormat
// + RelativeTimeFormat) BEFORE the @simplicity/core barrel evaluates at App load.
import './src/lib/intlSafe';
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyThemeColors, THEME_KEY } from './src/theme/theme';
import { setBootLanguage, LANG_KEY } from './src/lib/bootPrefs';

// Release builds have no redbox: an uncaught error while evaluating the App
// module graph (a screen import, i18n, theme…) closes the app instantly with no
// screen. Render the error instead so a device failure is diagnosable from a
// screenshot — no adb needed.
function makeCrashScreen(err) {
  // eslint-disable-next-line global-require
  const React = require('react');
  // eslint-disable-next-line global-require
  const { ScrollView, Text } = require('react-native');
  const msg = String((err && (err.stack || err.message)) || err).slice(0, 2000);
  return function CrashScreen() {
    return React.createElement(
      ScrollView,
      { style: { flex: 1, backgroundColor: '#1a1512' }, contentContainerStyle: { padding: 20, paddingTop: 60 } },
      React.createElement(Text, { style: { color: '#ff8a65', fontSize: 20, fontWeight: '700', marginBottom: 12 } }, 'Startup error'),
      React.createElement(Text, { style: { color: '#fff', fontSize: 13 } }, msg),
    );
  };
}

// The saved palette must be applied BEFORE the app (and every screen's
// StyleSheet.create) evaluates — RN freezes StyleSheet colors at module load.
// Reading it means awaiting AsyncStorage, which is asynchronous.
//
// That await must NOT sit between module evaluation and registerRootComponent:
// native calls runApplication('main') as soon as the bundle finishes evaluating,
// and in a release build (embedded bundle, no Metro round-trip to absorb the
// delay) native wins that race — crashing with `Invariant Violation: "main" has
// not been registered` before the await resolves. Dev builds hide this; the
// launcher's own timing lets registration land first.
//
// So Root registers SYNCHRONOUSLY below and does the async work in an effect,
// with `require('./App')` still deferred until after the palette is set — which
// keeps the frozen-StyleSheet invariant intact.
function Root() {
  // eslint-disable-next-line global-require
  const React = require('react');
  // eslint-disable-next-line global-require
  const { View, ActivityIndicator } = require('react-native');
  const [Screen, setScreen] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mode, lang] = await Promise.all([
          AsyncStorage.getItem(THEME_KEY),
          AsyncStorage.getItem(LANG_KEY),
        ]);
        applyThemeColors(mode === 'dark' ? 'dark' : 'light');
        // Layout direction follows the language and can only be applied to the
        // NEXT process, so setupI18n has to see the chosen language rather than
        // the device locale. Same read, same reason as the palette.
        setBootLanguage(lang);
      } catch {
        try { applyThemeColors('light'); } catch { /* palette stays at defaults */ }
      }
      if (cancelled) return;
      let Next;
      try {
        // eslint-disable-next-line global-require
        Next = require('./App').default;
      } catch (e) {
        Next = makeCrashScreen(e);
      }
      // Store the component itself, not a lazy initialiser result.
      setScreen(() => Next);
    })();
    return () => { cancelled = true; };
  }, []);

  // Deliberately inline styles from the app's own palette-free constants: this
  // renders before the App graph is required, so it must not pull in any module
  // that calls StyleSheet.create with `colors`.
  if (!Screen) {
    return React.createElement(
      View,
      { style: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbf7f2' } },
      React.createElement(ActivityIndicator, { color: '#C97B5E' }),
    );
  }
  return React.createElement(Screen);
}

registerRootComponent(Root);
