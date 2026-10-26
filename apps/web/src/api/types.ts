export type Role = 'BA' | 'LEAD' | 'DEV' | 'QA' | 'PM';
export type IssueType = 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'SUBTASK';
export type Priority = 'HIGHEST' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOWEST';
export type SprintState = 'PLANNED' | 'ACTIVE' | 'CLOSED';
export type LinkType = 'BLOCKS' | 'RELATES' | 'DUPLICATES';
export type Status =
  | 'BA_IN_PROGRESS'
  | 'BA_ON_HOLD'
  | 'LEAD_REVIEW'
  | 'TO_GROOM'
  | 'DEV_TODO'
  | 'DEV_IN_PROGRESS'
  | 'DEV_CODE_REVIEW'
  | 'QA_TODO'
  | 'QA_IN_PROGRESS'
  | 'ON_HOLD'
  | 'DONE';

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export interface Me extends UserSummary {
  isAdmin: boolean;
}

export interface Member {
  role: Role;
  addedAt?: string;
  user: UserSummary;
}

export interface Rule {
  from: Status[];
  to: Status;
  roles: Role[];
  needs: 'reason' | 'comment' | 'ready' | null;
  label: string;
}

export interface Workflow {
  baLanes: Status[];
  devLanes: Status[];
  ungroomed: Status[];
  rules: Rule[];
  epicRules: Rule[];
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  myRole: Role | null;
  activeSprint: { id: string; name: string; endDate: string | null } | null;
  _count: { members: number; issues: number };
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  myRole: Role | null;
  isAdmin: boolean;
  workflow: Workflow;
}

export interface IssueCard {
  id: string;
  key: string;
  type: IssueType;
  title: string;
  status: Status;
  priority: Priority;
  storyPoints: number | null;
  labels: string[];
  rank: number;
  sprintId: string | null;
  parentId: string | null;
  holdReason: string | null;
  holdFromStatus: Status | null;
  carryOverCount: number;
  version: number;
  updatedAt: string;
  assignee: UserSummary | null;
  parent: { id: string; key: string; title: string; type: IssueType } | null;
  _count: { children: number; comments: number };
}

export interface Sprint {
  id: string;
  projectId: string;
  sequence: number;
  name: string;
  goal: string | null;
  state: SprintState;
  startDate: string | null;
  endDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  committedPoints: number | null;
  completedPoints: number | null;
}

export interface Column {
  status: Status;
  name: string;
  issues: IssueCard[];
}

export interface DevBoard {
  sprint: Sprint | null;
  stats: { totalPoints: number; donePoints: number; issueCount: number; openCount: number };
  columns: Column[];
  members: Member[];
}

export interface BaBoard {
  columns: Column[];
  members: Member[];
}

export interface EpicSummary {
  id: string;
  key: string;
  title: string;
  status: Status;
  issueCount: number;
  doneCount: number;
  points: number;
}

export interface Backlog {
  sprints: (Sprint & { issues: IssueCard[] })[];
  backlog: IssueCard[];
  epics: EpicSummary[];
  members: Member[];
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: UserSummary;
}

export interface IssueEvent {
  id: string;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
  actor: UserSummary | null;
}

export interface LinkedIssue {
  id: string;
  key: string;
  title: string;
  status: Status;
  type: IssueType;
}

export interface IssueDetail extends Omit<IssueCard, 'parent' | '_count'> {
  description: string | null;
  dueDate: string | null;
  createdAt: string;
  projectKey: string;
  myRole: Role | null;
  reporter: UserSummary;
  parent: (LinkedIssue & { status: Status }) | null;
  children: IssueCard[];
  sprint: { id: string; name: string; state: SprintState } | null;
  comments: Comment[];
  events: IssueEvent[];
  linksOut: { id: string; type: LinkType; toIssue: LinkedIssue }[];
  linksIn: { id: string; type: LinkType; fromIssue: LinkedIssue }[];
  wikiPages: { id: string; title: string }[];
}

export interface ReportRow {
  key: string;
  title: string;
  type: IssueType;
  status: Status;
  points: number;
  addedAfterStart: boolean;
  outcome: string | null;
}

export interface SprintReport {
  sprint: Sprint;
  burndown: { date: string; remaining: number | null; ideal: number }[];
  completed: ReportRow[];
  notCompleted: ReportRow[];
  addedAfterStart: ReportRow[];
  removed: ReportRow[];
}

export interface Velocity {
  sprints: { id: string; name: string; committedPoints: number | null; completedPoints: number | null }[];
  averageVelocity: number | null;
}

export interface WikiTreeItem {
  id: string;
  title: string;
  parentId: string | null;
  position: number;
  updatedAt: string;
  updatedBy: UserSummary;
}

export interface WikiPage {
  id: string;
  projectId: string;
  projectKey: string;
  parentId: string | null;
  title: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: UserSummary;
  updatedBy: UserSummary;
  children: { id: string; title: string }[];
  breadcrumbs: { id: string; title: string }[];
  linkedIssues: LinkedIssue[];
}

export interface WikiVersionSummary {
  version: number;
  title: string;
  createdAt: string;
  editedBy: UserSummary;
}

export interface WikiVersion extends WikiVersionSummary {
  content: string;
}

export interface WikiSearchHit {
  id: string;
  title: string;
  snippet: string;
  updatedAt: string;
}

export type RetroColumn = 'WENT_WELL' | 'TO_IMPROVE' | 'ACTION';

export interface RetroItem {
  id: string;
  column: RetroColumn;
  text: string;
  anonymous: boolean;
  author: UserSummary | null;
  mine: boolean;
  votes: number;
  voted: boolean;
  issue: LinkedIssue | null;
  createdAt: string;
}

export interface RetroBoard {
  retro: { id: string; sprintId: string; createdAt: string; closedAt: string | null };
  sprint: {
    id: string;
    name: string;
    goal: string | null;
    state: SprintState;
    startDate: string | null;
    endDate: string | null;
    committedPoints: number | null;
    completedPoints: number | null;
  };
  items: RetroItem[];
  votesPerPerson: number;
  votesLeft: number;
  canManage: boolean;
  previousActions: { sprintName: string; items: { id: string; text: string; issue: LinkedIssue | null }[] } | null;
  nextSprint: { id: string; name: string } | null;
}

export interface RetroSprint {
  id: string;
  name: string;
  state: SprintState;
  endDate: string | null;
  retroStatus: 'NOT_STARTED' | 'OPEN' | 'CLOSED';
  noteCount: number;
}

export type NotificationType =
  | 'ASSIGNED'
  | 'MENTIONED'
  | 'COMMENTED'
  | 'LEAD_REVIEW_REQUESTED'
  | 'RETURNED_TO_BA'
  | 'READY_FOR_QA'
  | 'QA_FAILED'
  | 'ISSUE_DONE'
  | 'ADDED_TO_PROJECT'
  | 'SPRINT_STARTED'
  | 'SPRINT_COMPLETED';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string;
  readAt: string | null;
  createdAt: string;
  actor: UserSummary | null;
  project: { key: string; name: string } | null;
}

export interface NotificationSettings {
  emailFor: NotificationType[];
  allTypes: NotificationType[];
}
