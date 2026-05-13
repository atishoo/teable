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

import { getPublicSetting } from '@teable/openapi';
import { useEffect, useState } from 'react';
import { useEnv } from './useEnv';

const BRAND_UPDATED_EVENT = 'teable-brand-updated';

type Brand = {
  brandName: string;
  brandLogo?: string;
};

let brandCache: Brand | undefined;
let brandRequest: Promise<Brand> | undefined;

const buildFallbackBrand = (brandName?: string, brandLogo?: string): Brand => ({
  brandName: brandName || 'Teable',
  brandLogo,
});

const fetchBrand = (fallback: Brand) => {
  if (!brandRequest) {
    brandRequest = getPublicSetting()
      .then(({ data }) => {
        const nextBrand = {
          brandName: data.brandName || fallback.brandName,
          brandLogo: data.brandLogo || fallback.brandLogo,
        };
        brandCache = nextBrand;
        return nextBrand;
      })
      .catch(() => fallback)
      .finally(() => {
        brandRequest = undefined;
      });
  }
  return brandRequest;
};

export const notifyBrandUpdated = (brand?: Partial<Brand>) => {
  brandCache = {
    brandName: brand?.brandName || brandCache?.brandName || 'Teable',
    brandLogo: brand?.brandLogo ?? brandCache?.brandLogo,
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BRAND_UPDATED_EVENT, { detail: brand }));
  }
};

export const useBrand = (): { brandName: string; brandLogo?: string } => {
  const env = useEnv();
  const fallbackBrandName = env.brandName || 'Teable';
  const fallbackBrandLogo = env.brandLogo;
  const [brand, setBrand] = useState<Brand>(
    () => brandCache || buildFallbackBrand(fallbackBrandName, fallbackBrandLogo)
  );

  useEffect(() => {
    let mounted = true;
    const fallback = buildFallbackBrand(fallbackBrandName, fallbackBrandLogo);

    const refreshBrand = (event?: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as Partial<Brand>) : undefined;

      if (detail) {
        setBrand((currentBrand) => ({ ...currentBrand, ...detail }));
        return;
      }

      void fetchBrand(fallback).then((nextBrand) => {
        if (mounted) {
          setBrand((currentBrand) => ({ ...currentBrand, ...nextBrand }));
        }
      });
    };

    refreshBrand();
    window.addEventListener(BRAND_UPDATED_EVENT, refreshBrand);

    return () => {
      mounted = false;
      window.removeEventListener(BRAND_UPDATED_EVENT, refreshBrand);
    };
  }, [fallbackBrandLogo, fallbackBrandName]);

  return brand;
};
