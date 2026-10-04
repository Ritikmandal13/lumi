import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import { useColorScheme, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors, shadows, type ThemeMode, type ColorToken } from './tokens';

export type ColorsTheme = Record<ColorToken, string>;

export interface Theme {
  mode: ThemeMode;
  colors: ColorsTheme;
  shadows: (typeof shadows)['light'];
}

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  preference: 'system' | 'light' | 'dark';
  setPreference: (pref: 'system' | 'light' | 'dark') => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const THEME_STORAGE_KEY = 'lumi_theme_preference';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveMode(preference: 'system' | 'light' | 'dark', systemScheme?: string | null): ThemeMode {
  if (preference === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return preference;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  // Default to light theme for a minimal, clean aesthetic
  const [preference, setPreferenceState] = useState<'system' | 'light' | 'dark'>('light');

  // Load saved preference on mount
  useEffect(() => {
    async function loadPreference() {
      try {
        if (Platform.OS !== 'web') {
          const saved = await SecureStore.getItemAsync(THEME_STORAGE_KEY);
          if (saved === 'system' || saved === 'light' || saved === 'dark') {
            setPreferenceState(saved);
          }
        }
      } catch {
        // Fallback silently to default
      }
    }
    loadPreference();
  }, []);

  const mode = resolveMode(preference, systemScheme);

  const setPreference = useCallback((pref: 'system' | 'light' | 'dark') => {
    setPreferenceState(pref);
    if (Platform.OS !== 'web') {
      SecureStore.setItemAsync(THEME_STORAGE_KEY, pref).catch(() => {});
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setPreference(next);
  }, [mode, setPreference]);

  const theme: Theme = useMemo(
    () => ({
      mode,
      colors: colors[mode] as unknown as ColorsTheme,
      shadows: shadows[mode] as unknown as (typeof shadows)['light'],
    }),
    [mode],
  );

  const value: ThemeContextValue = useMemo(
    () => ({
      theme,
      mode,
      preference,
      setPreference,
      toggleTheme,
      isDark: mode === 'dark',
    }),
    [theme, mode, preference, setPreference, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

export function useColors(): ColorsTheme {
  return useTheme().theme.colors;
}
