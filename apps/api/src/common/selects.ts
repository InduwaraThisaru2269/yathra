import { Prisma } from '@prisma/client';

export const userSummary = { select: { id: true, name: true, email: true } } satisfies Prisma.UserDefaultArgs;

/** Fields a board card or backlog row needs. */
export const issueCard = {
  id: true,
  key: true,
  type: true,
  title: true,
  status: true,
  priority: true,
  storyPoints: true,
  labels: true,
  rank: true,
  sprintId: true,
  parentId: true,
  holdReason: true,
  holdFromStatus: true,
  carryOverCount: true,
  version: true,
  updatedAt: true,
  assignee: userSummary,
  parent: { select: { id: true, key: true, title: true, type: true } },
  _count: { select: { children: true, comments: true } },
} satisfies Prisma.IssueSelect;
