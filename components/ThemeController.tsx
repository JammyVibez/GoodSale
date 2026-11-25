'use client';

import { useEffect } from 'react';

/** Follow OS appearance changes whenever the user keeps the system theme. */
export default function ThemeController() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const preference = window.localStorage.getItem('goodsale_theme') || 'system';
      document.documentElement.classList.toggle(
        'dark',
        preference === 'dark' || (preference === 'system' && media.matches)
      );
    };

    applyTheme();
    media.addEventListener('change', applyTheme);
    window.addEventListener('storage', applyTheme);
    return () => {
      media.removeEventListener('change', applyTheme);
      window.removeEventListener('storage', applyTheme);
    };
  }, []);

  return null;
}
