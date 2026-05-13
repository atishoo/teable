import type { Action, ActionPrefix as ActionPrefixType, IRole } from '@teable/core';
import { ActionPrefix, RoleLevel, RolePermission } from '@teable/core';
import { usePermissionActionsStatic } from '@teable/sdk/hooks';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@teable/ui-lib/shadcn';
import { Check, Minus } from 'lucide-react';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';

const hiddenPrefixes = new Set<ActionPrefixType>([ActionPrefix.Enterprise, ActionPrefix.Instance]);

export function AuthorityMatrixPage() {
  const { t } = useTranslation('common');
  const { actionStaticMap, actionPrefixStaticMap, actionPrefixDisplayOrder } =
    usePermissionActionsStatic();

  const roles = RoleLevel as IRole[];
  const groupedActions = useMemo(() => {
    const actions = Object.keys(RolePermission.owner) as Action[];
    return actionPrefixDisplayOrder
      .filter((prefix) => !hiddenPrefixes.has(prefix))
      .map((prefix) => ({
        prefix,
        actions: actions.filter((action) => action.startsWith(`${prefix}|`)),
      }))
      .filter(({ actions }) => actions.length > 0);
  }, [actionPrefixDisplayOrder]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Head>
        <title>{t('noun.authorityMatrix')}</title>
      </Head>
      <div className="shrink-0 border-b px-8 py-6">
        <div className="items-center justify-between space-y-2 lg:flex">
          <h2 className="text-3xl font-bold tracking-tight">{t('noun.authorityMatrix')}</h2>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="space-y-8">
          {groupedActions.map(({ prefix, actions }) => (
            <section key={prefix} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {actionPrefixStaticMap[prefix].title}
              </h3>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[360px]">{t('actions.title')}</TableHead>
                      {roles.map((role) => (
                        <TableHead key={role} className="w-28 text-center">
                          {t(`role.title.${role}`)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actions.map((action) => (
                      <TableRow key={action}>
                        <TableCell className="font-medium">
                          {actionStaticMap[action]?.description ?? action}
                        </TableCell>
                        {roles.map((role) => {
                          const enabled = RolePermission[role][action];
                          return (
                            <TableCell key={`${role}-${action}`} className="text-center">
                              <span
                                className={cn(
                                  'inline-flex size-6 items-center justify-center rounded-full',
                                  enabled
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-muted text-muted-foreground'
                                )}
                              >
                                {enabled ? (
                                  <Check className="size-4" />
                                ) : (
                                  <Minus className="size-4" />
                                )}
                              </span>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
