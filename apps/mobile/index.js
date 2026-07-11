import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyThemeColors, THEME_KEY } from './src/theme/theme';

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

// Apply the saved light/dark palette BEFORE the app (and every screen's
// StyleSheet.create) evaluates — RN freezes StyleSheet colors at module load, so
// the palette must be set first. App is required AFTER applyThemeColors so its
// module graph (screens → StyleSheet.create) runs only once the palette is set.
async function boot() {
  try {
    const mode = await AsyncStorage.getItem(THEME_KEY);
    applyThemeColors(mode === 'dark' ? 'dark' : 'light');
  } catch {
    try { applyThemeColors('light'); } catch { /* palette stays at defaults */ }
  }
  let App;
  try {
    // eslint-disable-next-line global-require
    App = require('./App').default;
  } catch (e) {
    App = makeCrashScreen(e);
  }
  registerRootComponent(App);
}

boot();
