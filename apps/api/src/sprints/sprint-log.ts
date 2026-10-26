import { Prisma, SprintState } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** Records an issue joining a sprint. Joining an active sprint counts as scope change. */
export function enterSprint(
  tx: Tx,
  issue: { id: string; storyPoints: number | null },
  sprint: { id: string; state: SprintState },
) {
  return tx.sprintIssueLog.create({
    data: {
      sprintId: sprint.id,
      issueId: issue.id,
      points: issue.storyPoints,
      addedAfterStart: sprint.state === SprintState.ACTIVE,
    },
  });
}

export function leaveSprint(tx: Tx, issueId: string, sprintId: string, outcome: string) {
  return tx.sprintIssueLog.updateMany({
    where: { sprintId, issueId, removedAt: null },
    data: { removedAt: new Date(), outcome },
  });
}

export function recordEvents(
  tx: Tx,
  issueId: string,
  actorId: string | null,
  changes: { field: string; from?: unknown; to?: unknown }[],
) {
  if (!changes.length) return Promise.resolve({ count: 0 });
  const str = (v: unknown) => (v === null || v === undefined ? null : Array.isArray(v) ? v.join(', ') : String(v));
  return tx.issueEvent.createMany({
    data: changes.map((c) => ({ issueId, actorId, field: c.field, fromValue: str(c.from), toValue: str(c.to) })),
  });
}

/** Ranks are floats spaced by RANK_GAP so an issue can be dropped between two others without renumbering. */
export const RANK_GAP = 1024;

export async function nextRank(tx: Tx, projectId: string, sprintId: string | null) {
  const max = await tx.issue.aggregate({ where: { projectId, sprintId }, _max: { rank: true } });
  return (max._max.rank ?? 0) + RANK_GAP;
}
