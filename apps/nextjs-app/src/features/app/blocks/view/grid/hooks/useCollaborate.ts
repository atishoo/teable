import { getCellCollaboratorsChannel } from '@teable/core';
import type { ICellItem, ICell } from '@teable/sdk';
import { useSession, getCollaboratorColor, getCollaboratorColorMap } from '@teable/sdk';
import { SelectionRegionType } from '@teable/sdk/components/grid';
import type { ICollaborator, CombinedSelection } from '@teable/sdk/components/grid';
import { useConnection, useIsReadOnlyPreview, useTableId, useViewId } from '@teable/sdk/hooks';
import { useEffect, useState, useMemo } from 'react';
import type { Presence } from 'sharedb/lib/sharedb';

export const useCollaborate = (
  selection: CombinedSelection | undefined,
  getCellContent: (cell: ICellItem) => ICell
) => {
  const tableId = useTableId();
  const { user } = useSession();
  const viewId = useViewId();
  const { connection } = useConnection();
  const isReadOnlyPreview = useIsReadOnlyPreview();
  const [presence, setPresence] = useState<Presence>();
  const [collaborators, setCollaborators] = useState<ICollaborator>([]);
  const activeCell = useMemo(() => {
    if (selection?.type === SelectionRegionType.Cells) {
      return selection?.ranges?.[0];
    }
    return null;
  }, [selection]);

  const localPresence = useMemo(() => {
    if (isReadOnlyPreview || !presence || !connection?.id) {
      return null;
    }
    return presence.create(`${tableId}_${user.id}_${connection.id}`);
  }, [isReadOnlyPreview, connection?.id, presence, tableId, user.id]);

  useEffect(() => {
    if (isReadOnlyPreview || !tableId || !connection || !viewId) {
      return;
    }
    // reset collaborators when table or view have been changed
    setCollaborators([]);
    const channel = getCellCollaboratorsChannel(tableId);
    setPresence(connection.getPresence(channel));
  }, [isReadOnlyPreview, connection, tableId, viewId]);

  useEffect(() => {
    if (isReadOnlyPreview) {
      return;
    }

    const receiveHandler = () => {
      if (presence?.remotePresences) {
        const remoteCollaborators = Object.values(presence.remotePresences) as ICollaborator;
        const collaboratorColorMap = getCollaboratorColorMap(
          remoteCollaborators.map(({ user }) => `${tableId}_${user.id}`)
        );

        setCollaborators(
          remoteCollaborators.map((collaborator) => ({
            ...collaborator,
            borderColor:
              collaboratorColorMap.get(`${tableId}_${collaborator.user.id}`) ??
              collaborator.borderColor,
          }))
        );
      }
    };

    if (presence) {
      presence.subscribe();
      presence.on('receive', receiveHandler);
    }

    return () => {
      presence?.unsubscribe();
      presence?.removeListener('receive', receiveHandler);
    };
  }, [isReadOnlyPreview, presence, tableId]);

  useEffect(() => {
    if (isReadOnlyPreview || !localPresence) {
      return;
    }
    if (!activeCell) {
      /**
       * if want to collaborate the same user in different tab, create with connectionId
       * reset presence data to null
       **/
      localPresence?.submit(null, (error) => {
        error && console.error('submit error:', error);
      });
    } else {
      const activeCellId = getCellContent(activeCell)?.id;
      activeCellId?.length &&
        localPresence.submit(
          {
            user: {
              id: user.id,
              name: user.name,
              avatar: user.avatar,
              email: user.email,
            },
            activeCellId: activeCellId,
            borderColor: getCollaboratorColor(`${tableId}_${user.id}`),
            timeStamp: Date.now(),
          },
          (error) => {
            error && console.error('submit error:', error);
          }
        );
    }
    // not include getCellContent, because it will be changed frequently
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadOnlyPreview, activeCell, localPresence, tableId, user]);

  return collaborators;
};
