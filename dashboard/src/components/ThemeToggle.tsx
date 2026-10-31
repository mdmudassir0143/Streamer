'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export const THEME_KEY = 'hashtream:theme';
type Theme = 'dark' | 'light';

/** Dark is the default; the choice is applied before paint by the inline script in the root layout. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    if (next === 'light') root.dataset.theme = 'light';
    else delete root.dataset.theme;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked */ }
    setTheme(next);
  };

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun key="sun" className="theme-icon" size={16} strokeWidth={1.9} /> : <Moon key="moon" className="theme-icon" size={16} strokeWidth={1.9} />}
    </button>
  );
}
