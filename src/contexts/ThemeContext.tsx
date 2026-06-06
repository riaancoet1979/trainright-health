import { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { getUserSettings, saveUserSettings } from '../utils/storage';

type Theme = 'light' | 'dark';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

// Exported so the dedicated useTheme hook (./useTheme.ts) can read it.
// Splitting the hook into its own file keeps this file component-only which
// lets Vite Fast Refresh work across edits (M-06).
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const settings = getUserSettings();
    return settings.theme;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      const settings = getUserSettings();
      settings.theme = newTheme;
      saveUserSettings(settings);
      return newTheme;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

