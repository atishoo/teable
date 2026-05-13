import type { DehydratedState } from '@tanstack/react-query';
import {
  Database,
  MagicAi,
  Settings,
  LayoutTemplate as TemplateIcon,
  ShieldUser,
  User,
} from '@teable/icons';
import type { IUser } from '@teable/sdk';
import { SessionProvider } from '@teable/sdk';
import { AppProvider } from '@teable/sdk/context';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { Sidebar } from '@/features/app/components/sidebar/Sidebar';
import { SidebarHeaderLeft } from '@/features/app/components/sidebar/SidebarHeaderLeft';
import { useSdkLocale } from '@/features/app/hooks/useSdkLocale';
import { AppLayout } from '@/features/app/layouts';
import { SidebarContent } from '../components/sidebar/SidebarContent';

export const AdminLayout: React.FC<{
  children: React.ReactNode;
  user?: IUser;
  dehydratedState?: DehydratedState;
}> = ({ children, user, dehydratedState }) => {
  const sdkLocale = useSdkLocale();
  const { i18n } = useTranslation();
  const { t } = useTranslation('common');
  const router = useRouter();

  const onBack = () => {
    router.push({ pathname: '/space' });
  };

  const routes = [
    {
      Icon: User,
      label: '用户管理',
      route: '/admin/user',
      pathTo: '/admin/user',
    },
    {
      Icon: Database,
      label: '空间管理',
      route: '/admin/space',
      pathTo: '/admin/space',
    },
    {
      Icon: Settings,
      label: t('settings.title'),
      route: '/admin/setting',
      pathTo: '/admin/setting',
    },
    {
      Icon: MagicAi,
      label: 'AI 设置',
      route: '/admin/ai-setting',
      pathTo: '/admin/ai-setting',
    },
    {
      Icon: TemplateIcon,
      label: t('settings.templateAdmin.title'),
      route: '/admin/template',
      pathTo: '/admin/template',
    },
  ];

  return (
    <AppLayout>
      <Head>
        <title>{t('noun.adminPanel')}</title>
      </Head>
      <AppProvider locale={sdkLocale} lang={i18n.language} dehydratedState={dehydratedState}>
        <SessionProvider user={user}>
          <div id="portal" className="relative flex h-screen w-full items-start">
            <Sidebar
              headerLeft={
                <SidebarHeaderLeft
                  title={t('noun.adminPanel')}
                  icon={<ShieldUser className="size-5 shrink-0" />}
                  onBack={onBack}
                />
              }
            >
              <SidebarContent routes={routes} />
            </Sidebar>
            {children}
          </div>
        </SessionProvider>
      </AppProvider>
    </AppLayout>
  );
};
