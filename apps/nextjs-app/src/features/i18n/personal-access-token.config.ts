import type { I18nActiveNamespaces } from '@/lib/i18n';

export interface IPersonalAccessTokenConfig {
  i18nNamespaces: I18nActiveNamespaces<
    'common' | 'sdk' | 'setting' | 'developer' | 'token' | 'oauth' | 'zod'
  >;
}

export const personalAccessTokenConfig: IPersonalAccessTokenConfig = {
  i18nNamespaces: ['common', 'sdk', 'setting', 'developer', 'token', 'oauth', 'zod'],
};
