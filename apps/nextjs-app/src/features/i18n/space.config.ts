import type { I18nActiveNamespaces } from '@/lib/i18n';

export interface ISpaceConfig {
  i18nNamespaces: I18nActiveNamespaces<
    'common' | 'space' | 'sdk' | 'setting' | 'developer' | 'token' | 'oauth' | 'zod'
  >;
}

export const spaceConfig: ISpaceConfig = {
  i18nNamespaces: ['common', 'space', 'sdk', 'setting', 'developer', 'token', 'oauth', 'zod'],
};
