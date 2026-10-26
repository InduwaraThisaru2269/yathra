import type { IssueType, Priority, Project, Role, Rule, Status } from '../api/types';

export const STATUS_LABEL: Record<Status, string> = {
  BA_IN_PROGRESS: 'BA In Progress',
  BA_ON_HOLD: 'BA On Hold',
  LEAD_REVIEW: 'Lead Review',
  TO_GROOM: 'To Groom',
  DEV_TODO: 'Dev To Do',
  DEV_IN_PROGRESS: 'Dev In Progress',
  DEV_CODE_REVIEW: 'Dev Code Review',
  QA_TODO: 'QA To Do',
  QA_IN_PROGRESS: 'QA In Progress',
  ON_HOLD: 'On Hold',
  DONE: 'Done',
};

/** Lane header colour and lighter body tint, matching the prototype. */
export const LANE_COLOR: Record<Status, { head: string; body: string }> = {
  BA_IN_PROGRESS: { head: '#8EC5FF', body: '#E3EFFF' },
  BA_ON_HOLD: { head: '#FF6B6B', body: '#FFE3E3' },
  LEAD_REVIEW: { head: '#B69CFF', body: '#EFE9FF' },
  TO_GROOM: { head: '#2EE59D', body: '#DDFBEF' },
  DEV_TODO: { head: '#FFFFFF', body: '#FAFAFD' },
  DEV_IN_PROGRESS: { head: '#8EC5FF', body: '#E3EFFF' },
  DEV_CODE_REVIEW: { head: '#B69CFF', body: '#EFE9FF' },
  QA_TODO: { head: '#FFD23F', body: '#FFF6D1' },
  QA_IN_PROGRESS: { head: '#FF9F1C', body: '#FFEBD1' },
  ON_HOLD: { head: '#FF6B6B', body: '#FFE3E3' },
  DONE: { head: '#2EE59D', body: '#DDFBEF' },
};

export const EMPTY_TEXT: Partial<Record<Status, string>> = {
  DEV_TODO: 'All clear. Nothing to pick up.',
  DEV_IN_PROGRESS: 'Nothing in progress.',
  DEV_CODE_REVIEW: 'No reviews waiting.',
  QA_TODO: 'QA is all caught up.',
  QA_IN_PROGRESS: 'No tests running.',
  ON_HOLD: 'Nothing blocked.',
  DONE: 'Drop finished work here.',
  BA_IN_PROGRESS: 'No stories being written.',
  BA_ON_HOLD: 'Nothing on hold.',
  LEAD_REVIEW: 'Nothing waiting for review.',
  TO_GROOM: 'Nothing ready to groom yet.',
};

export const TYPE_META: Record<IssueType, { label: string; cls: string }> = {
  EPIC: { label: 'Epic', cls: 's-epic' },
  STORY: { label: 'Story', cls: 's-feat' },
  TASK: { label: 'Task', cls: 's-tech' },
  BUG: { label: 'Bug', cls: 's-bug' },
  SUBTASK: { label: 'Sub-task', cls: 's-sub' },
};

export const PRIORITIES: Priority[] = ['HIGHEST', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'];
export const PRIORITY_LABEL: Record<Priority, string> = {
  HIGHEST: 'Highest',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  LOWEST: 'Lowest',
};
export const STORY_POINTS = [0, 1, 2, 3, 5, 8, 13, 21];
export const ROLES: Role[] = ['BA', 'LEAD', 'DEV', 'QA', 'PM'];
export const ROLE_LABEL: Record<Role, string> = { BA: 'BA', LEAD: 'Lead', DEV: 'Developer', QA: 'QA', PM: 'PM' };

const AVATAR_COLORS = ['#3D5AFE', '#2EE59D', '#B69CFF', '#FF9F1C', '#FF6B6B', '#FFD23F', '#8EC5FF'];
export function avatarColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return { bg, fg: bg === '#3D5AFE' ? '#FFFFFF' : '#121212' };
}
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** Mirrors the server's rule lookup so the UI can ask for a reason or comment before calling the API. */
export function findRule(project: Project, type: IssueType, from: Status, to: Status, holdFrom: Status | null): Rule | null {
  if (from === 'ON_HOLD') {
    return holdFrom === to ? { from: ['ON_HOLD'], to, roles: ['DEV', 'QA', 'LEAD', 'PM'], needs: null, label: 'Release hold' } : null;
  }
  const rules = type === 'EPIC' ? project.workflow.epicRules : project.workflow.rules;
  return rules.find((r) => r.to === to && r.from.includes(from)) ?? null;
}

export function canUse(project: Project, rule: Rule) {
  return project.isAdmin || (project.myRole !== null && rule.roles.includes(project.myRole));
}

export function canPlan(project: Project) {
  return project.isAdmin || project.myRole === 'LEAD' || project.myRole === 'PM';
}

export function nextMoves(project: Project, type: IssueType, from: Status, holdFrom: Status | null): Rule[] {
  if (from === 'ON_HOLD') return holdFrom ? [findRule(project, type, from, holdFrom, holdFrom)!] : [];
  const rules = type === 'EPIC' ? project.workflow.epicRules : project.workflow.rules;
  return rules.filter((r) => r.from.includes(from));
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

export function daysLeft(endIso: string | null) {
  if (!endIso) return null;
  return Math.max(0, Math.ceil((new Date(endIso).getTime() - Date.now()) / 86_400_000));
}
