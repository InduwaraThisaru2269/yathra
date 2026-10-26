import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IssueStatus, IssueType, NotificationType, Prisma, ProjectRole, Sprint, SprintState } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { AuthUser } from '../auth/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { STATUS_LABEL, UNGROOMED } from '../workflow/workflow';
import { enterSprint, leaveSprint, nextRank, RANK_GAP, recordEvents } from './sprint-log';
import { CompleteSprintDto, CreateSprintDto, StartSprintDto, UpdateSprintDto } from './sprints.dto';

const PLANNERS: ProjectRole[] = [ProjectRole.LEAD, ProjectRole.PM];
type Tx = Prisma.TransactionClient;

@Injectable()
export class SprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(projectKey: string, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    return this.prisma.sprint.findMany({
      where: { projectId: a.project.id },
      include: { _count: { select: { issues: true } } },
      orderBy: { sequence: 'desc' },
    });
  }

  async create(projectKey: string, dto: CreateSprintDto, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    this.access.require(a, PLANNERS, 'create sprints');
    this.assertDates(dto.startDate, dto.endDate);

    return this.prisma.$transaction(async (tx) => {
      const { sprintCounter } = await tx.project.update({
        where: { id: a.project.id },
        data: { sprintCounter: { increment: 1 } },
        select: { sprintCounter: true },
      });
      return tx.sprint.create({
        data: {
          projectId: a.project.id,
          sequence: sprintCounter,
          name: dto.name?.trim() || `${a.project.key} Sprint ${sprintCounter}`,
          goal: dto.goal,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        },
      });
    });
  }

  async update(sprintId: string, dto: UpdateSprintDto, user: AuthUser) {
    const { sprint, access } = await this.access.forSprint(sprintId, user);
    this.access.require(access, PLANNERS, 'edit sprints');
    if (sprint.state === SprintState.CLOSED) throw new BadRequestException('Closed sprints cannot be edited');
    this.assertDates(dto.startDate ?? sprint.startDate?.toISOString(), dto.endDate ?? sprint.endDate?.toISOString());

    return this.prisma.sprint.update({
      where: { id: sprint.id },
      data: {
        name: dto.name?.trim() || undefined,
        goal: dto.goal,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  /** Deleting a planned sprint sends its issues back to the bottom of the backlog. */
  async remove(sprintId: string, user: AuthUser) {
    const { sprint, access } = await this.access.forSprint(sprintId, user);
    this.access.require(access, PLANNERS, 'delete sprints');
    if (sprint.state !== SprintState.PLANNED) throw new BadRequestException('Only planned sprints can be deleted');

    await this.prisma.$transaction(async (tx) => {
      await this.moveIssues(tx, sprint, null, user.id, 'sprint deleted', false);
      await tx.sprint.delete({ where: { id: sprint.id } });
    });
    return { ok: true };
  }

  async start(sprintId: string, dto: StartSprintDto, user: AuthUser) {
    const { sprint, access } = await this.access.forSprint(sprintId, user);
    this.access.require(access, PLANNERS, 'start sprints');
    if (sprint.state !== SprintState.PLANNED) throw new BadRequestException(`${sprint.name} is not a planned sprint`);
    this.assertDates(dto.startDate, dto.endDate, true);

    const active = await this.prisma.sprint.findFirst({ where: { projectId: sprint.projectId, state: SprintState.ACTIVE } });
    if (active) throw new BadRequestException(`${active.name} is still active. Complete it before starting another sprint.`);

    const issues = await this.prisma.issue.findMany({ where: { sprintId: sprint.id } });
    const ungroomed = issues.filter((i) => UNGROOMED.includes(i.status));
    if (ungroomed.length) {
      throw new BadRequestException(
        `These issues are not groomed yet: ${ungroomed.map((i) => `${i.key} (${STATUS_LABEL[i.status]})`).join(', ')}`,
      );
    }
    if (!issues.length) throw new BadRequestException('Plan at least one issue into the sprint before starting it');

    const committedPoints = issues
      .filter((i) => i.type !== IssueType.SUBTASK)
      .reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);

    const started = await this.prisma.$transaction(async (tx) => {
      const toStart = issues.filter((i) => i.status === IssueStatus.TO_GROOM);
      if (toStart.length) {
        await tx.issue.updateMany({
          where: { id: { in: toStart.map((i) => i.id) } },
          data: { status: IssueStatus.DEV_TODO },
        });
        for (const i of toStart) {
          await recordEvents(tx, i.id, user.id, [{ field: 'status', from: i.status, to: IssueStatus.DEV_TODO }]);
        }
      }
      // Snapshot the points each issue carried into the sprint.
      for (const i of issues) {
        await tx.sprintIssueLog.updateMany({
          where: { sprintId: sprint.id, issueId: i.id, removedAt: null },
          data: { points: i.storyPoints },
        });
      }
      return tx.sprint.update({
        where: { id: sprint.id },
        data: {
          state: SprintState.ACTIVE,
          name: dto.name?.trim() || undefined,
          goal: dto.goal,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          startedAt: new Date(),
          committedPoints,
        },
      });
    });

    await this.notifications.notify({
      type: NotificationType.SPRINT_STARTED,
      recipients: await this.notifications.allMembers(sprint.projectId),
      actorId: user.id,
      projectId: sprint.projectId,
      title: `${started.name} has started`,
      body: started.goal ? `Goal: ${started.goal}` : `${issues.length} issues, ${committedPoints} points committed.`,
      link: `/p/${access.project.key}/board`,
    });
    return started;
  }

  async complete(sprintId: string, dto: CompleteSprintDto, user: AuthUser) {
    const { sprint, access } = await this.access.forSprint(sprintId, user);
    this.access.require(access, PLANNERS, 'complete sprints');
    if (sprint.state !== SprintState.ACTIVE) throw new BadRequestException(`${sprint.name} is not active`);

    let target: Sprint | null = null;
    if (dto.moveOpenTo === 'SPRINT') {
      target = await this.prisma.sprint.findFirst({
        where: { id: dto.targetSprintId, projectId: sprint.projectId, state: SprintState.PLANNED },
      });
      if (!target) throw new NotFoundException('Pick a planned sprint in this project for the open issues');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.moveOpenTo === 'NEW') {
        const { sprintCounter, key } = await tx.project.update({
          where: { id: sprint.projectId },
          data: { sprintCounter: { increment: 1 } },
          select: { sprintCounter: true, key: true },
        });
        target = await tx.sprint.create({
          data: { projectId: sprint.projectId, sequence: sprintCounter, name: `${key} Sprint ${sprintCounter}` },
        });
      }

      const issues = await tx.issue.findMany({ where: { sprintId: sprint.id, type: { not: IssueType.SUBTASK } } });
      const done = issues.filter((i) => i.status === IssueStatus.DONE);
      const completedPoints = done.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);

      await tx.sprintIssueLog.updateMany({
        where: { sprintId: sprint.id, issueId: { in: done.map((i) => i.id) }, removedAt: null },
        data: { outcome: 'completed' },
      });
      const carried = await this.moveIssues(tx, sprint, target, user.id, 'carried over', true);

      const closed = await tx.sprint.update({
        where: { id: sprint.id },
        data: { state: SprintState.CLOSED, completedAt: new Date(), completedPoints },
      });
      return {
        sprint: closed,
        completedCount: done.length,
        completedPoints,
        carriedCount: carried,
        movedTo: target ? { id: target.id, name: target.name } : null,
      };
    });

    await this.notifications.notify({
      type: NotificationType.SPRINT_COMPLETED,
      recipients: await this.notifications.allMembers(sprint.projectId),
      actorId: user.id,
      projectId: sprint.projectId,
      title: `${sprint.name} is complete. Add your retro notes`,
      body: `${result.completedPoints} points done, ${result.carriedCount} issues carried over.`,
      link: `/p/${access.project.key}/retro/${sprint.id}`,
    });
    return result;
  }

  /** Moves every unfinished top-level issue (and its sub-tasks) out of a sprint. Returns how many moved. */
  private async moveIssues(
    tx: Tx,
    from: Sprint,
    to: Sprint | null,
    actorId: string,
    outcome: string,
    countCarryOver: boolean,
  ) {
    const open = await tx.issue.findMany({
      where: { sprintId: from.id, type: { not: IssueType.SUBTASK }, status: { not: IssueStatus.DONE } },
      orderBy: { rank: 'asc' },
    });
    let rank = await nextRank(tx, from.projectId, to?.id ?? null);

    for (const issue of open) {
      await tx.issue.update({
        where: { id: issue.id },
        data: {
          sprintId: to?.id ?? null,
          rank,
          carryOverCount: countCarryOver ? { increment: 1 } : undefined,
          version: { increment: 1 },
        },
      });
      await tx.issue.updateMany({ where: { parentId: issue.id, type: IssueType.SUBTASK }, data: { sprintId: to?.id ?? null } });
      await leaveSprint(tx, issue.id, from.id, outcome);
      if (to) await enterSprint(tx, issue, to);
      await recordEvents(tx, issue.id, actorId, [{ field: 'sprint', from: from.id, to: to?.id ?? null }]);
      rank += RANK_GAP;
    }
    return open.length;
  }

  private assertDates(start?: string | null, end?: string | null, required = false) {
    if (required && (!start || !end)) throw new BadRequestException('Set a start and end date');
    if (start && end && new Date(end) <= new Date(start)) {
      throw new BadRequestException('The end date must be after the start date');
    }
  }
}
