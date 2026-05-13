import { HoverCard, HoverCardTrigger, HoverCardContent, HoverCardPortal } from '@teable/ui-lib';
import type { ReactNode } from 'react';
import colors from 'tailwindcss/colors';
import type { IUser } from '../../context';
import { useTranslation } from '../../context/app/i18n';
import { useSession } from '../../hooks';
import { UserAvatar } from '../cell-value';

const collaboratorColors = [
  '#ef4444',
  '#22c55e',
  '#3b82f6',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#d946ef',
  '#10b981',
  '#eab308',
  '#0ea5e9',
  '#f43f5e',
];

export const collaboratorColorCount = collaboratorColors.length;

export type ICollaboratorUser = Omit<
  IUser,
  'phone' | 'notifyMeta' | 'hasPassword' | 'isAdmin' | 'avatar'
> & {
  borderColor?: string;
  avatar?: ReactNode;
};

const getCollaboratorColorIndex = (seedSource: string) => {
  let seed = 0;

  for (let i = 0; i < seedSource.length; i++) {
    seed = (seed << 5) - seed + seedSource.charCodeAt(i);
    seed |= 0;
  }

  return Math.abs(seed) % collaboratorColorCount;
};

export const getCollaboratorColor = (seedSource: string) => {
  return collaboratorColors[getCollaboratorColorIndex(seedSource)];
};

export const getCollaboratorColorMap = (seedSources: string[]) => {
  const usedColorIndices = new Set<number>();

  return new Map(
    Array.from(new Set(seedSources))
      .sort()
      .map((seedSource) => {
        let colorIndex = getCollaboratorColorIndex(seedSource);

        if (usedColorIndices.size < collaboratorColorCount) {
          while (usedColorIndices.has(colorIndex)) {
            colorIndex = (colorIndex + 1) % collaboratorColorCount;
          }
        }

        usedColorIndices.add(colorIndex);
        return [seedSource, collaboratorColors[colorIndex]];
      })
  );
};

export const CollaboratorWithHoverCard = (props: ICollaboratorUser) => {
  const { id, name, avatar, email, borderColor } = props;
  const { user } = useSession();
  const { t } = useTranslation();

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <div className="relative overflow-hidden">
          <UserAvatar
            name={name}
            avatar={avatar}
            className="size-6 cursor-pointer border-2"
            style={{
              borderColor: borderColor ?? colors.gray[500],
            }}
          />
        </div>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent className="flex w-max max-w-[160px] flex-col justify-center gap-1 truncate px-3 py-2 text-sm">
          <div className="truncate">
            <span className="font-medium" title={name}>
              {name}
            </span>
            <span className="pl-2 text-xs text-muted-foreground">
              {id === user.id ? `(${t('noun.you')})` : null}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            <span title={email}>{email}</span>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};
