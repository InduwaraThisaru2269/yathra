import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post } from './client';
import type {
  BaBoard,
  Backlog,
  Comment,
  DevBoard,
  IssueCard,
  IssueDetail,
  IssueType,
  LinkType,
  Me,
  Member,
  Priority,
  Project,
  ProjectSummary,
  Role,
  Sprint,
  SprintReport,
  Status,
  UserSummary,
  Velocity,
} from './types';

export const qk = {
  me: ['me'] as const,
  projects: ['projects'] as const,
  project: (key: string) => ['project', key] as const,
  members: (key: string) => ['project', key, 'members'] as const,
  backlog: (key: string) => ['project', key, 'backlog'] as const,
  board: (key: string) => ['project', key, 'board'] as const,
  baBoard: (key: string) => ['project', key, 'ba-board'] as const,
  sprints: (key: string) => ['project', key, 'sprints'] as const,
  velocity: (key: string) => ['project', key, 'velocity'] as const,
  epics: (key: string) => ['project', key, 'epics'] as const,
  issue: (issueKey: string) => ['issue', issueKey] as const,
  report: (sprintId: string) => ['sprint-report', sprintId] as const,
};

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => get<Me>('/me') });
export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => get<ProjectSummary[]>('/projects') });
export const useProject = (key: string) =>
  useQuery({ queryKey: qk.project(key), queryFn: () => get<Project>(`/projects/${key}`), staleTime: 60_000 });
export const useMembers = (key: string) =>
  useQuery({ queryKey: qk.members(key), queryFn: () => get<Member[]>(`/projects/${key}/members`) });
export const useBacklog = (key: string) =>
  useQuery({ queryKey: qk.backlog(key), queryFn: () => get<Backlog>(`/projects/${key}/backlog`) });
export const useDevBoard = (key: string) =>
  useQuery({ queryKey: qk.board(key), queryFn: () => get<DevBoard>(`/projects/${key}/board`), refetchInterval: 20_000 });
export const useBaBoard = (key: string) =>
  useQuery({ queryKey: qk.baBoard(key), queryFn: () => get<BaBoard>(`/projects/${key}/ba-board`), refetchInterval: 20_000 });
export const useSprints = (key: string) =>
  useQuery({ queryKey: qk.sprints(key), queryFn: () => get<Sprint[]>(`/projects/${key}/sprints`) });
export const useVelocity = (key: string) =>
  useQuery({ queryKey: qk.velocity(key), queryFn: () => get<Velocity>(`/projects/${key}/reports/velocity`) });
export const useEpics = (key: string) =>
  useQuery({ queryKey: qk.epics(key), queryFn: () => get<IssueCard[]>(`/projects/${key}/issues?type=EPIC&take=200`) });
export const useIssue = (issueKey: string | null) =>
  useQuery({
    queryKey: qk.issue(issueKey ?? ''),
    queryFn: () => get<IssueDetail>(`/issues/${issueKey}`),
    enabled: !!issueKey,
  });
export const useSprintReport = (sprintId: string | null) =>
  useQuery({
    queryKey: qk.report(sprintId ?? ''),
    queryFn: () => get<SprintReport>(`/sprints/${sprintId}/report`),
    enabled: !!sprintId,
  });
export const useUserSearch = (q: string) =>
  useQuery({ queryKey: ['users', q], queryFn: () => get<UserSummary[]>(`/users?q=${encodeURIComponent(q)}`) });

/** After any planning change, refresh every view of that project plus the open issue. */
function useRefresh(projectKey: string) {
  const qc = useQueryClient();
  return (issueKey?: string) => {
    qc.invalidateQueries({ queryKey: ['project', projectKey] });
    qc.invalidateQueries({ queryKey: ['sprint-report'] });
    if (issueKey) qc.invalidateQueries({ queryKey: qk.issue(issueKey) });
  };
}

export interface CreateIssueInput {
  type: IssueType;
  title: string;
  description?: string;
  priority?: Priority;
  storyPoints?: number;
  assigneeId?: string;
  parentId?: string;
  sprintId?: string;
  labels?: string[];
}

export function usePlanning(projectKey: string) {
  const refresh = useRefresh(projectKey);
  const qc = useQueryClient();

  return {
    createIssue: useMutation({
      mutationFn: (input: CreateIssueInput) => post<IssueCard>(`/projects/${projectKey}/issues`, input),
      onSuccess: () => refresh(),
    }),
    updateIssue: useMutation({
      mutationFn: ({ key, ...body }: { key: string } & Record<string, unknown>) => patch<IssueCard>(`/issues/${key}`, body),
      onSuccess: (_, v) => refresh(v.key),
      onError: (_, v) => refresh(v.key),
    }),
    transition: useMutation({
      mutationFn: ({ key, ...body }: { key: string; to: Status; reason?: string; comment?: string }) =>
        post<IssueCard>(`/issues/${key}/transition`, body),
      onSuccess: (_, v) => refresh(v.key),
      onError: (_, v) => refresh(v.key),
    }),
    move: useMutation({
      mutationFn: ({ key, ...body }: { key: string; sprintId: string | null; beforeId?: string }) =>
        post<IssueCard>(`/issues/${key}/move`, body),
      onSuccess: (_, v) => refresh(v.key),
      onError: (_, v) => refresh(v.key),
    }),
    deleteIssue: useMutation({
      mutationFn: (key: string) => del(`/issues/${key}`),
      onSuccess: () => refresh(),
    }),
    addComment: useMutation({
      mutationFn: ({ key, body }: { key: string; body: string }) => post<Comment>(`/issues/${key}/comments`, { body }),
      onSuccess: (_, v) => refresh(v.key),
    }),
    deleteComment: useMutation({
      mutationFn: ({ key, id }: { key: string; id: string }) => del(`/issues/${key}/comments/${id}`),
      onSuccess: (_, v) => refresh(v.key),
    }),
    addLink: useMutation({
      mutationFn: ({ key, toKey, type }: { key: string; toKey: string; type: LinkType }) =>
        post(`/issues/${key}/links`, { toKey, type }),
      onSuccess: (_, v) => {
        refresh(v.key);
        qc.invalidateQueries({ queryKey: qk.issue(v.toKey.toUpperCase()) });
      },
    }),
    removeLink: useMutation({
      mutationFn: ({ key, id }: { key: string; id: string }) => del(`/issues/${key}/links/${id}`),
      onSuccess: (_, v) => refresh(v.key),
    }),
    createSprint: useMutation({
      mutationFn: (body: { name?: string; goal?: string }) => post<Sprint>(`/projects/${projectKey}/sprints`, body),
      onSuccess: () => refresh(),
    }),
    updateSprint: useMutation({
      mutationFn: ({ id, ...body }: { id: string; name?: string; goal?: string; startDate?: string; endDate?: string }) =>
        patch<Sprint>(`/sprints/${id}`, body),
      onSuccess: () => refresh(),
    }),
    deleteSprint: useMutation({
      mutationFn: (id: string) => del(`/sprints/${id}`),
      onSuccess: () => refresh(),
    }),
    startSprint: useMutation({
      mutationFn: ({ id, ...body }: { id: string; name?: string; goal?: string; startDate: string; endDate: string }) =>
        post<Sprint>(`/sprints/${id}/start`, body),
      onSuccess: () => refresh(),
    }),
    completeSprint: useMutation({
      mutationFn: ({ id, ...body }: { id: string; moveOpenTo: 'BACKLOG' | 'SPRINT' | 'NEW'; targetSprintId?: string }) =>
        post<{ completedCount: number; completedPoints: number; carriedCount: number; movedTo: { name: string } | null }>(
          `/sprints/${id}/complete`,
          body,
        ),
      onSuccess: () => refresh(),
    }),
  };
}

export function useProjectAdmin(projectKey: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['project', projectKey] });
    qc.invalidateQueries({ queryKey: qk.projects });
  };
  return {
    update: useMutation({
      mutationFn: (body: { name?: string; description?: string }) => patch(`/projects/${projectKey}`, body),
      onSuccess: refresh,
    }),
    addMember: useMutation({
      mutationFn: (body: { email: string; role: Role }) => post<Member>(`/projects/${projectKey}/members`, body),
      onSuccess: refresh,
    }),
    updateMember: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
        patch(`/projects/${projectKey}/members/${userId}`, { role }),
      onSuccess: refresh,
    }),
    removeMember: useMutation({
      mutationFn: (userId: string) => del(`/projects/${projectKey}/members/${userId}`),
      onSuccess: refresh,
    }),
  };
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { key: string; name: string; description?: string }) => post<Project>('/projects', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}
