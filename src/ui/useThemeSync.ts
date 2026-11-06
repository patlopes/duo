import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { BRAND } from '../brand';
import { readSettings } from '../db/database';
import type { ThemeMode } from '../schemas/settingsDefaults';

const THEME_MIRROR_KEY = 'duo-theme';

function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  // The status bar follows these tags, and each one is tied to a system color scheme.
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((meta) => {
    const followsDark = meta.media.includes('dark');
    if (theme === 'system') {
      meta.content = followsDark ? BRAND.themeColorDark : BRAND.themeColorLight;
    } else {
      meta.content = theme === 'dark' ? BRAND.themeColorDark : BRAND.themeColorLight;
    }
  });

  try {
    if (theme === 'system') localStorage.removeItem(THEME_MIRROR_KEY);
    else localStorage.setItem(THEME_MIRROR_KEY, theme);
  } catch {
    // Private mode can refuse storage: the only cost is a brief flash on the next launch.
  }
}

export function useThemeSync(): void {
  const theme = useLiveQuery(async () => (await readSettings()).theme);

  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);
}
