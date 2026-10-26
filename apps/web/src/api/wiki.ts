import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post } from './client';
import type { WikiPage, WikiSearchHit, WikiTreeItem, WikiVersion, WikiVersionSummary } from './types';

export const wk = {
  tree: (key: string) => ['project', key, 'wiki-tree'] as const,
  page: (id: string) => ['wiki', id] as const,
  versions: (id: string) => ['wiki', id, 'versions'] as const,
  version: (id: string, n: number) => ['wiki', id, 'version', n] as const,
  search: (key: string, q: string) => ['project', key, 'wiki-search', q] as const,
};

export const useWikiTree = (key: string) =>
  useQuery({ queryKey: wk.tree(key), queryFn: () => get<WikiTreeItem[]>(`/projects/${key}/wiki`) });

export const useWikiPage = (id: string | undefined) =>
  useQuery({ queryKey: wk.page(id ?? ''), queryFn: () => get<WikiPage>(`/wiki/${id}`), enabled: !!id });

export const useWikiVersions = (id: string, enabled: boolean) =>
  useQuery({ queryKey: wk.versions(id), queryFn: () => get<WikiVersionSummary[]>(`/wiki/${id}/versions`), enabled });

export const useWikiVersion = (id: string, n: number | null) =>
  useQuery({
    queryKey: wk.version(id, n ?? 0),
    queryFn: () => get<WikiVersion>(`/wiki/${id}/versions/${n}`),
    enabled: !!n && n > 0,
    staleTime: Infinity, // versions never change
  });

export const useWikiSearch = (key: string, q: string) =>
  useQuery({
    queryKey: wk.search(key, q),
    queryFn: () => get<WikiSearchHit[]>(`/projects/${key}/wiki/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

export function useWikiActions(projectKey: string) {
  const qc = useQueryClient();
  const refresh = (pageId?: string) => {
    qc.invalidateQueries({ queryKey: wk.tree(projectKey) });
    if (pageId) qc.invalidateQueries({ queryKey: ['wiki', pageId] });
    // Ticket links changed, so issue panels showing "Wiki pages" may be stale.
    qc.invalidateQueries({ queryKey: ['issue'] });
  };

  return {
    create: useMutation({
      mutationFn: (body: { title: string; parentId?: string; content?: string }) =>
        post<{ id: string }>(`/projects/${projectKey}/wiki`, body),
      onSuccess: () => refresh(),
    }),
    save: useMutation({
      mutationFn: ({ id, ...body }: { id: string; title: string; content: string; baseVersion: number }) =>
        patch<{ id: string; version: number }>(`/wiki/${id}`, body),
      onSuccess: (_, v) => refresh(v.id),
    }),
    move: useMutation({
      mutationFn: ({ id, ...body }: { id: string; parentId: string | null; beforeId?: string }) => post(`/wiki/${id}/move`, body),
      onSuccess: (_, v) => refresh(v.id),
      onError: () => refresh(),
    }),
    remove: useMutation({
      mutationFn: (id: string) => del<{ archived: number }>(`/wiki/${id}`),
      onSuccess: () => refresh(),
    }),
    restore: useMutation({
      mutationFn: ({ id, version, baseVersion }: { id: string; version: number; baseVersion: number }) =>
        post(`/wiki/${id}/versions/${version}/restore`, { baseVersion }),
      onSuccess: (_, v) => refresh(v.id),
    }),
  };
}
