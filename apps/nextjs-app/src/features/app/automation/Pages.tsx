import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { useBaseResource, type IBaseResourceWorkflow } from '../hooks/useBaseResource';

const WorkFlowPanel = dynamic(
  () =>
    import('./workflow-panel/WorkFlowPanel').then((module) => ({
      default: module.WorkFlowPanel,
    })),
  { ssr: false }
);

export function AutomationPage() {
  const { t } = useTranslation('common');
  const { baseId, workflowId } = useBaseResource() as IBaseResourceWorkflow;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <Head>
          <title>{t('noun.automation')}</title>
        </Head>
        {workflowId ? (
          <WorkFlowPanel baseId={baseId} workflowId={workflowId} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-4">
            <div className="text-sm text-muted-foreground">{t('noun.automation')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
