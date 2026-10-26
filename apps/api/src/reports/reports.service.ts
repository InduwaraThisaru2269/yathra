import { Injectable } from '@nestjs/common';
import { IssueStatus, SprintState } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const endOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Committed vs completed points for the last 10 closed sprints. */
  async velocity(projectKey: string, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    const sprints = await this.prisma.sprint.findMany({
      where: { projectId: a.project.id, state: SprintState.CLOSED },
      select: { id: true, name: true, committedPoints: true, completedPoints: true, completedAt: true },
      orderBy: { sequence: 'desc' },
      take: 10,
    });
    const ordered = sprints.reverse();
    const last3 = ordered.slice(-3);
    const average = last3.length ? Math.round(last3.reduce((s, x) => s + (x.completedPoints ?? 0), 0) / last3.length) : null;
    return { sprints: ordered, averageVelocity: average };
  }

  /** Scope, outcome and a daily burndown of remaining points for one sprint. */
  async sprintReport(sprintId: string, user: AuthUser) {
    const { sprint } = await this.access.forSprint(sprintId, user);
    const logs = await this.prisma.sprintIssueLog.findMany({
      where: { sprintId },
      include: {
        issue: {
          select: {
            id: true,
            key: true,
            title: true,
            type: true,
            status: true,
            storyPoints: true,
            events: { where: { field: 'status' }, select: { toValue: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
          },
        },
      },
      orderBy: { addedAt: 'asc' },
    });

    const points = (l: (typeof logs)[number]) => l.issue.storyPoints ?? l.points ?? 0;
    const doneAt = (l: (typeof logs)[number], t: Date) => {
      let status: string | null = null;
      for (const e of l.issue.events) {
        if (e.createdAt > t) break;
        status = e.toValue;
      }
      return status === IssueStatus.DONE;
    };
    const inScopeAt = (l: (typeof logs)[number], t: Date) => l.addedAt <= t && (!l.removedAt || l.removedAt > t);

    const burndown: { date: string; remaining: number | null; ideal: number }[] = [];
    const start = sprint.startedAt ?? sprint.startDate;
    if (start && sprint.state !== SprintState.PLANNED) {
      const plannedEnd = sprint.endDate ?? new Date(start.getTime() + 14 * DAY_MS);
      const lastActual = sprint.completedAt ?? new Date();
      const lastDay = endOfDay(plannedEnd > lastActual ? plannedEnd : lastActual);
      const days = Math.max(1, Math.round((endOfDay(plannedEnd).getTime() - endOfDay(start).getTime()) / DAY_MS));
      const committed = sprint.committedPoints ?? 0;

      for (let t = endOfDay(start), i = 0; t <= lastDay; t = new Date(t.getTime() + DAY_MS), i++) {
        const at = t > lastActual ? null : t;
        burndown.push({
          date: isoDay(t),
          remaining: at
            ? logs.filter((l) => inScopeAt(l, at) && !doneAt(l, at)).reduce((s, l) => s + points(l), 0)
            : null,
          ideal: Math.max(0, Math.round((committed * (1 - i / days)) * 10) / 10),
        });
      }
    }

    const row = (l: (typeof logs)[number]) => ({
      key: l.issue.key,
      title: l.issue.title,
      type: l.issue.type,
      status: l.issue.status,
      points: points(l),
      addedAfterStart: l.addedAfterStart,
      outcome: l.outcome,
    });

    return {
      sprint,
      burndown,
      completed: logs.filter((l) => l.outcome === 'completed' || (!l.removedAt && l.issue.status === IssueStatus.DONE)).map(row),
      notCompleted: logs.filter((l) => l.outcome === 'carried over' || (!l.removedAt && l.issue.status !== IssueStatus.DONE && !l.outcome)).map(row),
      addedAfterStart: logs.filter((l) => l.addedAfterStart).map(row),
      removed: logs.filter((l) => l.removedAt && l.outcome !== 'carried over').map(row),
    };
  }
}
