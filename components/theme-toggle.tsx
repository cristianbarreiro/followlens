'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'followlens-theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark') {
        setTheme('dark');
        const root = document.documentElement;
        root.setAttribute('data-theme', 'dark');
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else if (saved === 'light') {
        setTheme('light');
        const root = document.documentElement;
        root.setAttribute('data-theme', 'light');
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    } catch {
      // Ignore storage access errors in restricted browser contexts
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);

    const root = document.documentElement;
    root.setAttribute('data-theme', nextTheme);
    root.style.colorScheme = nextTheme;
    if (nextTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage errors in restricted browser contexts
    }
  };

  const isLight = theme === 'light';
  const ariaLabel = isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';

  return (
    <button
      type="button"
      className="theme-toggle"
      data-hydrated={mounted ? 'true' : undefined}
      onClick={toggleTheme}
      aria-label={ariaLabel}
      aria-pressed={!isLight}
      title={ariaLabel}
    >
      {isLight ? (
        <Sun size={18} aria-hidden="true" className="theme-toggle-icon" />
      ) : (
        <Moon size={18} aria-hidden="true" className="theme-toggle-icon" />
      )}
    </button>
  );
}
