import { useQuery } from '@tanstack/react-query';
import { getCollaboratorsChannel } from '@teable/core';
import { getUserCollaborators } from '@teable/openapi';
import type { ICollaboratorUser } from '@teable/sdk';
import {
  useSession,
  CollaboratorWithHoverCard,
  getCollaboratorColorMap,
  ReactQueryKeys,
} from '@teable/sdk';
import { useBaseId, useConnection, useTableId } from '@teable/sdk/hooks';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@teable/ui-lib/shadcn';
import { chunk, isEmpty } from 'lodash';
import React, { useEffect, useMemo, useState } from 'react';
import type { Presence } from 'sharedb/lib/client';

interface CollaboratorsProps {
  className?: string;
  maxAvatarLen?: number;
}

export const Collaborators: React.FC<CollaboratorsProps> = ({ className, maxAvatarLen = 3 }) => {
  const { connection } = useConnection();
  const baseId = useBaseId();
  const tableId = useTableId();
  const { user: sessionUser } = useSession();

  const [presence, setPresence] = useState<Presence>();
  const user = useMemo(
    () => ({
      id: sessionUser.id,
      avatar: sessionUser.avatar,
      name: sessionUser.name,
      email: sessionUser.email,
    }),
    [sessionUser]
  );
  const [users, setUsers] = useState<ICollaboratorUser[]>([{ ...user }]);
  const userIds = useMemo(() => Array.from(new Set(users.map(({ id }) => id))).sort(), [users]);
  const { data: collaboratorProfiles, refetch: refetchCollaboratorProfiles } = useQuery({
    queryKey: ReactQueryKeys.baseCollaboratorListUser(baseId as string, {
      includeSystem: true,
      take: userIds.length ? userIds.length * 2 : 1,
      userIds,
    }),
    queryFn: ({ queryKey }) =>
      getUserCollaborators(queryKey[1], queryKey[2]).then((res) => res.data.users),
    enabled: Boolean(baseId && userIds.length),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const collaboratorProfileMap = useMemo(
    () => new Map((collaboratorProfiles ?? []).map((profile) => [profile.id, profile])),
    [collaboratorProfiles]
  );
  const displayUsers = useMemo(
    () =>
      users.map((user) => {
        const profile = collaboratorProfileMap.get(user.id);
        if (user.id === sessionUser.id) {
          return profile ? { ...profile, ...user } : user;
        }
        return profile ? { ...user, ...profile } : user;
      }),
    [collaboratorProfileMap, sessionUser.id, users]
  );
  const [boardUsers, hiddenUser] = chunk(displayUsers, maxAvatarLen);
  const collaboratorColorMap = useMemo(
    () => getCollaboratorColorMap(displayUsers.map(({ id }) => `${tableId}_${id}`)),
    [tableId, displayUsers]
  );

  useEffect(() => {
    if (!connection || !tableId || !user) {
      return;
    }
    const channel = getCollaboratorsChannel(tableId as string);
    setPresence(connection.getPresence(channel));
    setUsers([{ ...user }]);
  }, [connection, tableId, user]);

  useEffect(() => {
    if (!presence) {
      return;
    }

    const channelTableId = presence.channel.split('_').pop();

    if (presence.subscribed && tableId !== channelTableId) {
      return;
    }

    presence.subscribe();

    const presenceKey = `${tableId}_${user.id}`;
    const localPresence = presence.create(presenceKey);
    localPresence.submit(user, (error) => {
      error && console.error('submit error:', error);
    });

    const receiveHandler = () => {
      let newUser;
      const { remotePresences } = presence;
      if (isEmpty(remotePresences)) {
        newUser = [{ ...user }];
      } else {
        const remoteUsers = Object.values(remotePresences);
        newUser = [{ ...user }, ...remoteUsers];
      }
      setUsers(newUser);
      refetchCollaboratorProfiles();
    };

    presence.on('receive', receiveHandler);

    return () => {
      presence.unsubscribe();
      presence?.removeListener('receive', receiveHandler);
    };
  }, [connection, presence, refetchCollaboratorProfiles, tableId, user]);

  return (
    <div className={cn('gap-1 items-center flex', className)}>
      {boardUsers?.map(({ id, name, avatar, email }) => {
        const borderColor = collaboratorColorMap.get(`${tableId}_${id}`);
        return (
          <CollaboratorWithHoverCard
            key={id}
            id={id}
            name={name}
            avatar={avatar}
            email={email}
            borderColor={borderColor}
          />
        );
      })}
      {hiddenUser ? (
        <Popover>
          <PopoverTrigger asChild>
            <div className="relative size-6 shrink-0 grow-0 cursor-pointer select-none overflow-hidden rounded-full border hover:bg-accent">
              <p className="flex size-full items-center justify-center rounded-full text-center text-xs">
                +{hiddenUser.length}
              </p>
            </div>
          </PopoverTrigger>
          <PopoverContent className="flex max-h-64 w-auto min-w-[120px] max-w-60 flex-col gap-1 overflow-y-auto rounded-md p-2">
            {hiddenUser.map(({ id, name, avatar, email }) => {
              const borderColor = collaboratorColorMap.get(`${tableId}_${id}`);
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 truncate rounded-sm p-1 hover:bg-accent"
                >
                  <CollaboratorWithHoverCard
                    id={id}
                    name={name}
                    avatar={avatar}
                    email={email}
                    borderColor={borderColor}
                  />
                  <div className="flex-1 truncate text-sm">{name}</div>
                </div>
              );
            })}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
};
