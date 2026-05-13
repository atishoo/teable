/**
 * IMPORTANT LEGAL NOTICE:
 *
 * This file is part of Teable, licensed under the GNU Affero General Public License (AGPL).
 *
 * While Teable is open source software, the brand assets (including but not limited to
 * the Teable name, logo, and brand identity) are protected intellectual property.
 * Modification, replacement, or removal of these brand assets is strictly prohibited
 * and constitutes a violation of our trademark rights and the terms of the AGPL license.
 *
 * Under Section 7(e) of AGPLv3, we explicitly reserve all rights to the
 * Teable brand assets. Any unauthorized modification, redistribution, or use
 * of these assets, including creating derivative works that remove or replace
 * the brand assets, may result in legal action.
 */

import { useEffect } from 'react';
import { useBrand } from './useBrand';

const FAVICON_RELS = ['icon', 'shortcut icon', 'apple-touch-icon'];

const applyBrandFavicon = (brandLogo: string) => {
  const href = new URL(brandLogo, window.location.origin).href;
  document
    .querySelectorAll("link[rel*='icon'], link[rel='manifest']")
    .forEach((link) => link.remove());

  FAVICON_RELS.forEach((rel) => {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
  });

  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = `data:application/manifest+json,${encodeURIComponent(
    JSON.stringify({
      icons: [{ src: href, sizes: 'any' }],
    })
  )}`;
  document.head.appendChild(manifest);
};

export const useAutoFavicon = () => {
  const { brandLogo } = useBrand();

  useEffect(() => {
    if (!brandLogo) {
      return;
    }

    const refreshFavicon = () => applyBrandFavicon(brandLogo);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshFavicon();
      }
    };

    refreshFavicon();
    window.addEventListener('focus', refreshFavicon);
    window.addEventListener('pageshow', refreshFavicon);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', refreshFavicon);
      window.removeEventListener('pageshow', refreshFavicon);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [brandLogo]);
};
