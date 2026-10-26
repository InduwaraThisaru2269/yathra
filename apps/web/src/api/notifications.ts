import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, api } from './client';
import type { AppNotification, NotificationSettings, NotificationType } from './types';

const nk = {
  count: ['notifications', 'count'] as const,
  list: ['notifications', 'list'] as const,
  settings: ['notifications', 'settings'] as const,
};

/** Light poll for the bell badge; the full list loads only when the panel opens. */
export const useUnreadCount = () =>
  useQuery({
    queryKey: nk.count,
    queryFn: () => get<{ unreadCount: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

export const useNotificationList = (enabled: boolean) =>
  useQuery({
    queryKey: nk.list,
    queryFn: () => get<{ items: AppNotification[]; unreadCount: number }>('/notifications?take=40'),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  });

export const useNotificationSettings = (enabled: boolean) =>
  useQuery({ queryKey: nk.settings, queryFn: () => get<NotificationSettings>('/notifications/settings'), enabled });

export function useNotificationActions() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: nk.count });
    qc.invalidateQueries({ queryKey: nk.list });
  };
  return {
    read: useMutation({ mutationFn: (id: string) => post(`/notifications/${id}/read`), onSuccess: refresh }),
    readAll: useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: refresh }),
    saveSettings: useMutation({
      mutationFn: (emailFor: NotificationType[]) => api<NotificationSettings>('PUT', '/notifications/settings', { emailFor }),
      onSuccess: (s) => qc.setQueryData(nk.settings, s),
    }),
  };
}
