import type { SsrApi } from '@/backend/api/rest/ssr-api';

export async function getBrand(ssrApi: SsrApi) {
  const publicSetting = await ssrApi.getPublicSetting();
  return {
    brandName: publicSetting.brandName,
    logoUrl: publicSetting.brandLogo,
  };
}
