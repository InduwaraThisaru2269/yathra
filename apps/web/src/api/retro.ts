import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post } from './client';
import type { IssueCard, RetroBoard, RetroColumn, RetroSprint } from './types';

export const rk = {
  sprints: (key: string) => ['project', key, 'retros'] as const,
  board: (sprintId: string) => ['retro', sprintId] as const,
};

export const useRetroSprints = (key: string) =>
  useQuery({ queryKey: rk.sprints(key), queryFn: () => get<RetroSprint[]>(`/projects/${key}/retros`) });

/** Polls so notes and votes from teammates appear during a live retro. */
export const useRetroBoard = (sprintId: string | undefined) =>
  useQuery({
    queryKey: rk.board(sprintId ?? ''),
    queryFn: () => get<RetroBoard>(`/sprints/${sprintId}/retro`),
    enabled: !!sprintId,
    refetchInterval: 5000,
  });

export function useRetroActions(projectKey: string, sprintId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: rk.board(sprintId) });
    qc.invalidateQueries({ queryKey: rk.sprints(projectKey) });
  };
  return {
    add: useMutation({
      mutationFn: (body: { column: RetroColumn; text: string; anonymous: boolean }) => post(`/sprints/${sprintId}/retro/items`, body),
      onSuccess: refresh,
    }),
    edit: useMutation({
      mutationFn: ({ id, ...body }: { id: string; text?: string; column?: RetroColumn }) => patch(`/retro-items/${id}`, body),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => del(`/retro-items/${id}`), onSuccess: refresh }),
    vote: useMutation({ mutationFn: (id: string) => post<{ voted: boolean }>(`/retro-items/${id}/vote`), onSuccess: refresh }),
    toTicket: useMutation({
      mutationFn: ({ id, ...body }: { id: string; destination: 'NEXT_SPRINT' | 'BACKLOG'; assigneeId?: string }) =>
        post<IssueCard>(`/retro-items/${id}/ticket`, body),
      onSuccess: () => {
        refresh();
        qc.invalidateQueries({ queryKey: ['project', projectKey] });
      },
    }),
    close: useMutation({ mutationFn: () => post(`/sprints/${sprintId}/retro/close`), onSuccess: refresh }),
    reopen: useMutation({ mutationFn: () => post(`/sprints/${sprintId}/retro/reopen`), onSuccess: refresh }),
  };
}
