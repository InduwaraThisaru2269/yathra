import { IssueStatus, IssueType, ProjectRole } from '@prisma/client';

const S = IssueStatus;
const R = ProjectRole;

export const STATUS_LABEL: Record<IssueStatus, string> = {
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

/** BA & Lead board lanes, in order. */
export const BA_LANES: IssueStatus[] = [S.BA_IN_PROGRESS, S.BA_ON_HOLD, S.LEAD_REVIEW, S.TO_GROOM];

/** Developer & QA board lanes, in order. */
export const DEV_LANES: IssueStatus[] = [
  S.DEV_TODO,
  S.DEV_IN_PROGRESS,
  S.DEV_CODE_REVIEW,
  S.QA_TODO,
  S.QA_IN_PROGRESS,
  S.ON_HOLD,
  S.DONE,
];

/** Statuses that mean the story is still being written; such issues cannot be planned into a sprint. */
export const UNGROOMED: IssueStatus[] = [S.BA_IN_PROGRESS, S.BA_ON_HOLD, S.LEAD_REVIEW];

export type Requirement = 'reason' | 'comment' | 'ready';

export interface TransitionRule {
  from: IssueStatus[];
  to: IssueStatus;
  roles: ProjectRole[];
  needs?: Requirement;
  label: string;
}

const DEV_WORK: IssueStatus[] = [S.DEV_TODO, S.DEV_IN_PROGRESS, S.DEV_CODE_REVIEW, S.QA_TODO, S.QA_IN_PROGRESS];

export const RULES: TransitionRule[] = [
  { from: [S.BA_IN_PROGRESS], to: S.BA_ON_HOLD, roles: [R.BA, R.LEAD, R.PM], needs: 'reason', label: 'Put on hold' },
  { from: [S.BA_ON_HOLD], to: S.BA_IN_PROGRESS, roles: [R.BA, R.LEAD, R.PM], label: 'Resume' },
  { from: [S.BA_IN_PROGRESS], to: S.LEAD_REVIEW, roles: [R.BA, R.LEAD, R.PM], needs: 'ready', label: 'Send to Lead review' },
  { from: [S.LEAD_REVIEW], to: S.TO_GROOM, roles: [R.LEAD], label: 'Approve for grooming' },
  { from: [S.LEAD_REVIEW], to: S.BA_IN_PROGRESS, roles: [R.LEAD], needs: 'comment', label: 'Return to BA' },
  { from: [S.TO_GROOM], to: S.DEV_TODO, roles: [R.LEAD, R.PM], label: 'Ready for development' },
  { from: [S.DEV_TODO, S.DEV_CODE_REVIEW], to: S.DEV_IN_PROGRESS, roles: [R.DEV, R.LEAD], label: 'Start work' },
  { from: [S.DEV_IN_PROGRESS], to: S.DEV_TODO, roles: [R.DEV, R.LEAD], label: 'Stop work' },
  { from: [S.DEV_IN_PROGRESS], to: S.DEV_CODE_REVIEW, roles: [R.DEV, R.LEAD], label: 'Send to code review' },
  { from: [S.DEV_CODE_REVIEW], to: S.QA_TODO, roles: [R.DEV, R.LEAD], label: 'Ready for QA' },
  { from: [S.QA_TODO], to: S.QA_IN_PROGRESS, roles: [R.QA, R.LEAD], label: 'Start testing' },
  { from: [S.QA_IN_PROGRESS], to: S.QA_TODO, roles: [R.QA, R.LEAD], label: 'Stop testing' },
  { from: [S.QA_IN_PROGRESS], to: S.DONE, roles: [R.QA, R.LEAD], label: 'Pass QA' },
  { from: [S.QA_TODO, S.QA_IN_PROGRESS], to: S.DEV_TODO, roles: [R.QA, R.LEAD], needs: 'comment', label: 'Fail QA' },
  { from: DEV_WORK, to: S.ON_HOLD, roles: [R.DEV, R.QA, R.LEAD, R.PM], needs: 'reason', label: 'Put on hold' },
  { from: [S.DONE], to: S.QA_IN_PROGRESS, roles: [R.QA, R.LEAD], needs: 'comment', label: 'Reopen' },
];

/** Epics are containers: they only move between "to groom" and "done". */
const EPIC_RULES: TransitionRule[] = [
  { from: [...UNGROOMED, S.TO_GROOM], to: S.DONE, roles: [R.LEAD, R.PM], label: 'Close epic' },
  { from: [S.DONE], to: S.TO_GROOM, roles: [R.LEAD, R.PM], label: 'Reopen epic' },
];

export function initialStatus(type: IssueType): IssueStatus {
  return type === IssueType.STORY || type === IssueType.EPIC ? S.BA_IN_PROGRESS : S.TO_GROOM;
}

/**
 * Finds the rule that allows a move. Leaving On Hold is special: the card goes back
 * to the lane it came from, which only the issue itself knows.
 */
export function findRule(
  type: IssueType,
  from: IssueStatus,
  to: IssueStatus,
  holdFromStatus: IssueStatus | null,
): TransitionRule | undefined {
  if (from === S.ON_HOLD) {
    return holdFromStatus === to
      ? { from: [S.ON_HOLD], to, roles: [R.DEV, R.QA, R.LEAD, R.PM], label: 'Release hold' }
      : undefined;
  }
  const rules = type === IssueType.EPIC ? EPIC_RULES : RULES;
  return rules.find((r) => r.to === to && r.from.includes(from));
}

/** Rule table sent to the web app so it can ask for a reason or comment before calling the API. */
export function publicRules() {
  return {
    baLanes: BA_LANES,
    devLanes: DEV_LANES,
    ungroomed: UNGROOMED,
    rules: RULES.map((r) => ({ from: r.from, to: r.to, roles: r.roles, needs: r.needs ?? null, label: r.label })),
    epicRules: EPIC_RULES.map((r) => ({ from: r.from, to: r.to, roles: r.roles, needs: r.needs ?? null, label: r.label })),
  };
}
