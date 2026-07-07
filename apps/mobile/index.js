import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyThemeColors, THEME_KEY } from './src/theme/theme';

// Apply the saved light/dark palette BEFORE the app (and every screen's
// StyleSheet.create) evaluates — RN freezes StyleSheet colors at module load, so
// the palette must be set first. App is imported dynamically so its module graph
// (screens → StyleSheet.create) runs only after applyThemeColors.
async function boot() {
  try {
    const mode = await AsyncStorage.getItem(THEME_KEY);
    applyThemeColors(mode === 'dark' ? 'dark' : 'light');
  } catch {
    applyThemeColors('light');
  }
  const { default: App } = await import('./App');
  registerRootComponent(App);
}

boot();
