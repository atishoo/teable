import type {
  INotificationIcon,
  INotificationSystemIcon,
  INotificationUserIcon,
  NotificationTypeEnum,
} from '@teable/core';
import { TeableNew } from '@teable/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@teable/ui-lib';
import React from 'react';
import { UserAvatar } from '@/features/app/components/user/UserAvatar';
import { useBrand } from '../../hooks/useBrand';

interface NotificationIconProps {
  notifyIcon: INotificationIcon;
  notifyType: NotificationTypeEnum;
}

const isUserIcon = (notifyIcon: INotificationIcon): notifyIcon is INotificationUserIcon =>
  'userId' in notifyIcon;

const SystemNotificationIcon = (props: { iconUrl?: string }) => {
  const { iconUrl } = props;
  const { brandName, brandLogo } = useBrand();
  const logoUrl = brandLogo || iconUrl;

  return (
    <Avatar className="size-9 border bg-background">
      {logoUrl && <AvatarImage src={logoUrl} alt={brandName} className="object-contain p-1" />}
      <AvatarFallback className="bg-background">
        <TeableNew className="size-5 text-black dark:text-white" />
      </AvatarFallback>
    </Avatar>
  );
};

const NotificationIcon = (props: NotificationIconProps) => {
  const { notifyIcon } = props;

  if (isUserIcon(notifyIcon)) {
    const { userAvatarUrl, userName } = notifyIcon;

    if (userAvatarUrl) {
      return (
        <div className="relative flex flex-none items-center self-start pr-2">
          <UserAvatar className="size-9 border" user={{ name: userName, avatar: userAvatarUrl }} />
        </div>
      );
    }
  }

  const { iconUrl } = notifyIcon as INotificationSystemIcon;

  return (
    <div className="relative flex flex-none items-center self-start pr-2">
      <SystemNotificationIcon iconUrl={iconUrl} />
    </div>
  );
};

export { NotificationIcon };
