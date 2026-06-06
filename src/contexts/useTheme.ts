import { useContext } from 'react';
import { ThemeContext } from './ThemeContext';
import type { ThemeContextType } from './ThemeContext';

/**
 * Access the theme context. Lives in its own file so ThemeContext.tsx only
 * exports components — required for Vite Fast Refresh to work correctly
 * (eslint react-refresh/only-export-components).
 */
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
