import { useQuery } from '@tanstack/react-query';
import { getDashboardList, LastVisitResourceType, updateUserLastVisit } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useBaseId, useIsReadOnlyPreview } from '@teable/sdk/hooks';
import { Spin } from '@teable/ui-lib/base';
import { useEffect } from 'react';
import { useBaseResource } from '../hooks/useBaseResource';
import type { IBaseResourceDashboard } from '../hooks/useBaseResource';
import { useInitializationZodI18n } from '../hooks/useInitializationZodI18n';
import { DashboardHeader } from './DashboardHeader';
import { DashboardMain } from './DashboardMain';
import { EmptyDashboard } from './EmptyDashboard';

export function DashboardPage() {
  const baseId = useBaseId() as string;
  const isReadOnlyPreview = useIsReadOnlyPreview();
  useInitializationZodI18n();
  const { dashboardId: dashboardQueryId } = useBaseResource() as IBaseResourceDashboard;
  const { data: dashboardList, isLoading } = useQuery({
    queryKey: ReactQueryKeys.getDashboardList(baseId),
    queryFn: ({ queryKey }) => getDashboardList(queryKey[1]).then((res) => res.data),
    enabled: !!baseId,
  });
  useEffect(() => {
    // Skip last visit tracking in template or share mode
    if (isReadOnlyPreview) return;
    if (dashboardQueryId) {
      updateUserLastVisit({
        resourceId: dashboardQueryId,
        parentResourceId: baseId,
        resourceType: LastVisitResourceType.Dashboard,
      });
    }
  }, [dashboardQueryId, baseId, isReadOnlyPreview]);

  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="ml-4 mt-4 min-w-0 flex-1">
          <Spin />
        </div>
      </div>
    );
  }
  if (!isLoading && !dashboardList?.length) {
    return (
      <div className="flex h-full">
        <div className="min-w-0 flex-1">
          <EmptyDashboard />
        </div>
      </div>
    );
  }
  const dashboardId = dashboardQueryId ?? dashboardList?.[0]?.id;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader dashboardId={dashboardId} />
        <DashboardMain dashboardId={dashboardId} />
      </div>
    </div>
  );
}
