import { Injectable } from '@nestjs/common';
import { IssueStatus, IssueType, SprintState } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { AuthUser } from '../auth/auth-user';
import { issueCard, userSummary } from '../common/selects';
import { PrismaService } from '../prisma/prisma.service';
import { BA_LANES, DEV_LANES, STATUS_LABEL } from '../workflow/workflow';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Developer & QA board: the active sprint's issues in the seven delivery lanes. */
  async devBoard(projectKey: string, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    const sprint = await this.prisma.sprint.findFirst({ where: { projectId: a.project.id, state: SprintState.ACTIVE } });
    const issues = sprint
      ? await this.prisma.issue.findMany({
          where: { sprintId: sprint.id, type: { notIn: [IssueType.EPIC, IssueType.SUBTASK] } },
          select: issueCard,
          orderBy: { rank: 'asc' },
        })
      : [];

    const totalPoints = issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
    const donePoints = issues.filter((i) => i.status === IssueStatus.DONE).reduce((s, i) => s + (i.storyPoints ?? 0), 0);

    return {
      sprint,
      stats: { totalPoints, donePoints, issueCount: issues.length, openCount: issues.filter((i) => i.status !== 'DONE').length },
      columns: DEV_LANES.map((status) => ({
        status,
        name: STATUS_LABEL[status],
        issues: issues.filter((i) => i.status === status),
      })),
      members: await this.members(a.project.id),
    };
  }

  /** BA & Lead board: stories and epics being written, reviewed and groomed. */
  async baBoard(projectKey: string, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    const issues = await this.prisma.issue.findMany({
      where: { projectId: a.project.id, status: { in: BA_LANES }, type: { not: IssueType.SUBTASK } },
      select: issueCard,
      orderBy: { rank: 'asc' },
    });
    return {
      columns: BA_LANES.map((status) => ({
        status,
        name: STATUS_LABEL[status],
        issues: issues.filter((i) => i.status === status),
      })),
      members: await this.members(a.project.id),
    };
  }

  /** Backlog view: active and planned sprints on top, then the ranked backlog, plus the epics panel. */
  async backlog(projectKey: string, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    const listable = { type: { notIn: [IssueType.EPIC, IssueType.SUBTASK] } };

    const [sprints, backlog, epics, members] = await Promise.all([
      this.prisma.sprint.findMany({
        where: { projectId: a.project.id, state: { in: [SprintState.ACTIVE, SprintState.PLANNED] } },
        include: { issues: { where: listable, select: issueCard, orderBy: { rank: 'asc' } } },
        orderBy: { sequence: 'asc' },
      }),
      this.prisma.issue.findMany({
        where: { projectId: a.project.id, sprintId: null, status: { not: IssueStatus.DONE }, ...listable },
        select: issueCard,
        orderBy: { rank: 'asc' },
      }),
      this.prisma.issue.findMany({
        where: { projectId: a.project.id, type: IssueType.EPIC },
        select: {
          id: true,
          key: true,
          title: true,
          status: true,
          children: { select: { status: true, storyPoints: true } },
        },
        orderBy: { rank: 'asc' },
      }),
      this.members(a.project.id),
    ]);

    return {
      // The active sprint always sits on top, like Jira.
      sprints: [...sprints].sort((x, y) => Number(y.state === SprintState.ACTIVE) - Number(x.state === SprintState.ACTIVE)),
      backlog,
      epics: epics.map(({ children, ...e }) => ({
        ...e,
        issueCount: children.length,
        doneCount: children.filter((c) => c.status === IssueStatus.DONE).length,
        points: children.reduce((s, c) => s + (c.storyPoints ?? 0), 0),
      })),
      members,
    };
  }

  private members(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      select: { role: true, user: userSummary },
      orderBy: { user: { name: 'asc' } },
    });
  }
}
