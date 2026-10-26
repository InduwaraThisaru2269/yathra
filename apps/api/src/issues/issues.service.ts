import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Issue, IssueStatus, IssueType, NotificationType, Prisma, ProjectRole, SprintState } from '@prisma/client';
import { AccessService, ProjectAccess } from '../access/access.service';
import { AuthUser } from '../auth/auth-user';
import { issueCard, userSummary } from '../common/selects';
import { mentionedUserIds, NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { enterSprint, leaveSprint, nextRank, RANK_GAP, recordEvents } from '../sprints/sprint-log';
import { findRule, initialStatus, STATUS_LABEL, UNGROOMED } from '../workflow/workflow';
import {
  CommentDto,
  CreateIssueDto,
  LinkDto,
  ListIssuesQuery,
  MoveIssueDto,
  TransitionDto,
  UpdateIssueDto,
} from './issues.dto';

const R = ProjectRole;
const HOLD_STATUSES: IssueStatus[] = [IssueStatus.ON_HOLD, IssueStatus.BA_ON_HOLD];
type IssueCardRow = Prisma.IssueGetPayload<{ select: typeof issueCard }>;

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(projectKey: string, query: ListIssuesQuery, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    const q = query.q?.trim();
    const keys = query.keys?.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean).slice(0, 200);
    return this.prisma.issue.findMany({
      where: {
        projectId: a.project.id,
        ...(keys?.length ? { key: { in: keys } } : {}),
        type: query.type,
        status: query.status,
        assigneeId: query.assigneeId,
        parentId: query.epicId,
        ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { key: { contains: q.toUpperCase() } }] } : {}),
      },
      select: issueCard,
      orderBy: { updatedAt: 'desc' },
      take: query.take ?? 50,
    });
  }

  async create(projectKey: string, dto: CreateIssueDto, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    if (dto.type === IssueType.EPIC || dto.type === IssueType.STORY) {
      this.access.require(a, [R.BA, R.LEAD, R.PM], `create ${dto.type.toLowerCase()}s`);
    }

    await this.validateParent(a, dto.type, dto.parentId ?? null);
    if (dto.assigneeId) await this.validateAssignee(a, dto.assigneeId);

    const status = initialStatus(dto.type);
    const sprint = dto.sprintId ? await this.plannableSprint(a, dto.sprintId) : null;
    if (sprint) this.assertPlannable(dto.type, status);

    const created = await this.prisma.$transaction(async (tx) => {
      const { issueCounter } = await tx.project.update({
        where: { id: a.project.id },
        data: { issueCounter: { increment: 1 } },
        select: { issueCounter: true },
      });
      const issue = await tx.issue.create({
        data: {
          projectId: a.project.id,
          number: issueCounter,
          key: `${a.project.key}-${issueCounter}`,
          type: dto.type,
          title: dto.title.trim(),
          description: dto.description,
          status: sprint?.state === SprintState.ACTIVE && status === IssueStatus.TO_GROOM ? IssueStatus.DEV_TODO : status,
          priority: dto.priority,
          storyPoints: dto.storyPoints,
          labels: dto.labels ?? [],
          rank: await nextRank(tx, a.project.id, sprint?.id ?? null),
          assigneeId: dto.assigneeId,
          reporterId: user.id,
          parentId: dto.parentId,
          sprintId: sprint?.id,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        },
        select: issueCard,
      });
      await recordEvents(tx, issue.id, user.id, [{ field: 'created', to: issue.status }]);
      if (sprint) await enterSprint(tx, issue, sprint);
      return issue;
    });

    if (created.assignee) {
      await this.notifyIssue(a, created, NotificationType.ASSIGNED, [created.assignee.id], user, `${created.key} was assigned to you`);
    }
    return created;
  }

  async get(key: string, user: AuthUser) {
    const { issue, access } = await this.access.forIssueKey(key, user);
    const full = await this.prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
      include: {
        assignee: userSummary,
        reporter: userSummary,
        parent: { select: { id: true, key: true, title: true, type: true, status: true } },
        children: { select: issueCard, orderBy: { rank: 'asc' } },
        sprint: { select: { id: true, name: true, state: true } },
        comments: { include: { author: userSummary }, orderBy: { createdAt: 'asc' } },
        events: { include: { actor: userSummary }, orderBy: { createdAt: 'desc' }, take: 100 },
        linksOut: { include: { toIssue: { select: { id: true, key: true, title: true, status: true, type: true } } } },
        linksIn: { include: { fromIssue: { select: { id: true, key: true, title: true, status: true, type: true } } } },
        wikiLinks: { where: { page: { archivedAt: null } }, select: { page: { select: { id: true, title: true } } } },
      },
    });
    const { wikiLinks, ...rest } = full;
    return { ...rest, wikiPages: wikiLinks.map((l) => l.page), projectKey: access.project.key, myRole: access.role };
  }

  async update(key: string, dto: UpdateIssueDto, user: AuthUser) {
    const { issue, access } = await this.access.forIssueKey(key, user);
    if (dto.version !== undefined && dto.version !== issue.version) {
      throw new ConflictException(`${issue.key} was changed by someone else. Reload it and try again.`);
    }
    if (dto.parentId !== undefined) await this.validateParent(access, issue.type, dto.parentId, issue.id);
    if (dto.assigneeId) await this.validateAssignee(access, dto.assigneeId);

    const data: Prisma.IssueUncheckedUpdateInput = {};
    const changes: { field: string; from: unknown; to: unknown }[] = [];
    const set = <K extends keyof Issue>(field: K, value: Issue[K]) => {
      const before = issue[field];
      const same =
        before instanceof Date || value instanceof Date
          ? String(before) === String(value)
          : JSON.stringify(before) === JSON.stringify(value);
      if (same) return;
      (data as Record<string, unknown>)[field] = value;
      changes.push({ field, from: before, to: value });
    };

    if (dto.title !== undefined) set('title', dto.title.trim());
    if (dto.description !== undefined) set('description', dto.description);
    if (dto.priority !== undefined) set('priority', dto.priority);
    if (dto.storyPoints !== undefined) set('storyPoints', dto.storyPoints);
    if (dto.assigneeId !== undefined) set('assigneeId', dto.assigneeId);
    if (dto.parentId !== undefined) set('parentId', dto.parentId);
    if (dto.labels !== undefined) set('labels', dto.labels);
    if (dto.dueDate !== undefined) set('dueDate', dto.dueDate ? new Date(dto.dueDate) : null);

    if (!changes.length) return this.card(issue.id);

    const saved = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: issue.id },
        data: { ...data, version: { increment: 1 } },
        select: issueCard,
      });
      // Description bodies can be long; the history only notes that it changed.
      await recordEvents(
        tx,
        issue.id,
        user.id,
        changes.map((c) => (c.field === 'description' ? { field: c.field } : c)),
      );
      return updated;
    });

    if (dto.assigneeId && dto.assigneeId !== issue.assigneeId) {
      await this.notifyIssue(access, saved, NotificationType.ASSIGNED, [dto.assigneeId], user, `${saved.key} was assigned to you`);
    }
    return saved;
  }

  async transition(key: string, dto: TransitionDto, user: AuthUser) {
    const { issue, access } = await this.access.forIssueKey(key, user);
    const from = issue.status;
    const to = dto.to;
    if (from === to) return this.card(issue.id);

    const rule = findRule(issue.type, from, to, issue.holdFromStatus);
    if (!rule) {
      throw new BadRequestException(`${STATUS_LABEL[from]} → ${STATUS_LABEL[to]} is not an allowed move`);
    }
    this.access.require(access, rule.roles, rule.label.toLowerCase());

    if (rule.needs === 'reason' && !dto.reason?.trim()) {
      throw new BadRequestException('Give a reason for putting this on hold');
    }
    if (rule.needs === 'comment' && !dto.comment?.trim()) {
      throw new BadRequestException(`Add a comment explaining "${rule.label}"`);
    }
    if (rule.needs === 'ready') this.assertReady(issue);

    const goingOnHold = HOLD_STATUSES.includes(to);
    const moved = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: issue.id },
        data: {
          status: to,
          holdReason: goingOnHold ? dto.reason!.trim() : null,
          holdFromStatus: goingOnHold ? from : null,
          resolvedAt: to === IssueStatus.DONE ? new Date() : null,
          version: { increment: 1 },
        },
        select: issueCard,
      });
      await recordEvents(tx, issue.id, user.id, [
        { field: 'status', from, to },
        ...(goingOnHold ? [{ field: 'holdReason', to: dto.reason!.trim() }] : []),
      ]);
      if (dto.comment?.trim()) {
        await tx.issueComment.create({
          data: { issueId: issue.id, authorId: user.id, body: `**${rule.label}:** ${dto.comment.trim()}` },
        });
      }
      return updated;
    });

    await this.notifyTransition(access, issue, moved, from, to, dto.comment?.trim(), user);
    return moved;
  }

  /** Tells the people who act next. Each move notifies at most one group. */
  private async notifyTransition(
    access: ProjectAccess,
    before: Issue,
    issue: IssueCardRow,
    from: IssueStatus,
    to: IssueStatus,
    comment: string | undefined,
    user: AuthUser,
  ) {
    const S = IssueStatus;
    const owners = [before.reporterId, before.assigneeId];
    if (to === S.LEAD_REVIEW) {
      const leads = await this.notifications.membersWithRole(access.project.id, [R.LEAD]);
      await this.notifyIssue(access, issue, NotificationType.LEAD_REVIEW_REQUESTED, leads, user, `${issue.key} is ready for Lead review`);
    } else if (from === S.LEAD_REVIEW && to === S.BA_IN_PROGRESS) {
      await this.notifyIssue(access, issue, NotificationType.RETURNED_TO_BA, owners, user, `${issue.key} was returned to the BA`, comment);
    } else if ((from === S.QA_TODO || from === S.QA_IN_PROGRESS) && to === S.DEV_TODO) {
      await this.notifyIssue(access, issue, NotificationType.QA_FAILED, [before.assigneeId], user, `${issue.key} failed QA`, comment);
    } else if (to === S.QA_TODO) {
      const qas = await this.notifications.membersWithRole(access.project.id, [R.QA]);
      await this.notifyIssue(access, issue, NotificationType.READY_FOR_QA, qas, user, `${issue.key} is ready for QA`);
    } else if (to === S.DONE) {
      await this.notifyIssue(access, issue, NotificationType.ISSUE_DONE, owners, user, `${issue.key} is done`);
    }
  }

  private notifyIssue(
    access: ProjectAccess,
    issue: { key: string; title: string },
    type: NotificationType,
    recipients: (string | null)[],
    user: AuthUser,
    title: string,
    body?: string,
  ) {
    return this.notifications.notify({
      type,
      recipients,
      actorId: user.id,
      projectId: access.project.id,
      title: `${title}: ${issue.title}`,
      body: body ? `${user.name}: ${body}` : `By ${user.name}`,
      link: `/p/${access.project.key}/backlog?issue=${issue.key}`,
    });
  }

  /** Re-ranks an issue and/or moves it between the backlog and sprints. */
  async move(key: string, dto: MoveIssueDto, user: AuthUser) {
    const { issue, access } = await this.access.forIssueKey(key, user);
    const targetSprintId = dto.sprintId ?? null;
    const sprintChanges = targetSprintId !== issue.sprintId;

    if (issue.type === IssueType.EPIC && targetSprintId) throw new BadRequestException('Epics are not planned into sprints');
    if (issue.type === IssueType.SUBTASK) throw new BadRequestException('Sub-tasks move with their parent');

    let target: { id: string; state: SprintState } | null = null;
    if (sprintChanges) {
      this.access.require(access, [R.LEAD, R.PM], 'plan sprints');
      if (issue.sprintId) {
        const current = await this.prisma.sprint.findUniqueOrThrow({ where: { id: issue.sprintId } });
        if (current.state === SprintState.CLOSED) throw new BadRequestException('Issues in a closed sprint cannot be moved');
      }
      if (targetSprintId) {
        target = await this.plannableSprint(access, targetSprintId);
        this.assertPlannable(issue.type, issue.status);
      }
    } else {
      this.access.require(access, [R.BA, R.LEAD, R.PM], 'rank the backlog');
    }

    const rank = await this.rankFor(access.project.id, targetSprintId, issue.id, dto.beforeId);
    const startsWork = target?.state === SprintState.ACTIVE && issue.status === IssueStatus.TO_GROOM;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: issue.id },
        data: {
          rank,
          sprintId: targetSprintId,
          status: startsWork ? IssueStatus.DEV_TODO : undefined,
          version: { increment: 1 },
        },
        select: issueCard,
      });
      if (sprintChanges) {
        if (issue.sprintId) await leaveSprint(tx, issue.id, issue.sprintId, targetSprintId ? 'moved' : 'removed');
        if (target) await enterSprint(tx, issue, target);
        await tx.issue.updateMany({
          where: { parentId: issue.id, type: IssueType.SUBTASK },
          data: { sprintId: targetSprintId },
        });
        await recordEvents(tx, issue.id, user.id, [
          { field: 'sprint', from: issue.sprintId, to: targetSprintId },
          ...(startsWork ? [{ field: 'status', from: issue.status, to: IssueStatus.DEV_TODO }] : []),
        ]);
      }
      return updated;
    });
  }

  /**
   * Mentioned members get MENTIONED; the reporter and assignee get COMMENTED, unless they were
   * mentioned already. Mentions of people outside the project are ignored.
   */
  async addComment(key: string, dto: CommentDto, user: AuthUser) {
    const { issue, access } = await this.access.forIssueKey(key, user);
    const comment = await this.prisma.issueComment.create({
      data: { issueId: issue.id, authorId: user.id, body: dto.body.trim() },
      include: { author: userSummary },
    });

    const mentioned = await this.notifications.onlyMembers(access.project.id, mentionedUserIds(comment.body));
    await this.notifyIssue(access, issue, NotificationType.MENTIONED, mentioned, user, `${user.name} mentioned you on ${issue.key}`, comment.body);
    const watchers = [issue.reporterId, issue.assigneeId].filter((id) => id && !mentioned.includes(id));
    await this.notifyIssue(access, issue, NotificationType.COMMENTED, watchers, user, `New comment on ${issue.key}`, comment.body);
    return comment;
  }

  async deleteComment(key: string, commentId: string, user: AuthUser) {
    const { issue, access } = await this.access.forIssueKey(key, user);
    const comment = await this.prisma.issueComment.findFirst({ where: { id: commentId, issueId: issue.id } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== user.id) this.access.require(access, [R.LEAD, R.PM], "delete other people's comments");
    await this.prisma.issueComment.delete({ where: { id: comment.id } });
    return { ok: true };
  }

  async addLink(key: string, dto: LinkDto, user: AuthUser) {
    const { issue } = await this.access.forIssueKey(key, user);
    const other = await this.prisma.issue.findUnique({ where: { key: dto.toKey.toUpperCase() } });
    if (!other || other.projectId !== issue.projectId) throw new NotFoundException(`Issue ${dto.toKey} not found in this project`);
    if (other.id === issue.id) throw new BadRequestException('An issue cannot link to itself');
    return this.prisma.issueLink.upsert({
      where: { fromIssueId_toIssueId_type: { fromIssueId: issue.id, toIssueId: other.id, type: dto.type } },
      create: { fromIssueId: issue.id, toIssueId: other.id, type: dto.type },
      update: {},
      include: { toIssue: { select: { id: true, key: true, title: true, status: true, type: true } } },
    });
  }

  async removeLink(key: string, linkId: string, user: AuthUser) {
    const { issue } = await this.access.forIssueKey(key, user);
    await this.prisma.issueLink.deleteMany({
      where: { id: linkId, OR: [{ fromIssueId: issue.id }, { toIssueId: issue.id }] },
    });
    return { ok: true };
  }

  async remove(key: string, user: AuthUser) {
    const { issue, access } = await this.access.forIssueKey(key, user);
    if (issue.reporterId !== user.id) this.access.require(access, [R.LEAD, R.PM], 'delete issues');
    if (issue.sprintId) {
      const sprint = await this.prisma.sprint.findUniqueOrThrow({ where: { id: issue.sprintId } });
      if (sprint.state !== SprintState.PLANNED) {
        throw new BadRequestException('Remove the issue from its sprint before deleting it');
      }
    }
    await this.prisma.issue.delete({ where: { id: issue.id } });
    return { ok: true };
  }

  private card(id: string) {
    return this.prisma.issue.findUniqueOrThrow({ where: { id }, select: issueCard });
  }

  private async rankFor(projectId: string, sprintId: string | null, movingId: string, beforeId?: string) {
    if (!beforeId) {
      const max = await this.prisma.issue.aggregate({
        where: { projectId, sprintId, id: { not: movingId } },
        _max: { rank: true },
      });
      return (max._max.rank ?? 0) + RANK_GAP;
    }
    const before = await this.prisma.issue.findFirst({ where: { id: beforeId, projectId, sprintId } });
    if (!before) throw new BadRequestException('The issue to drop before is not in that list');
    const prev = await this.prisma.issue.findFirst({
      where: { projectId, sprintId, rank: { lt: before.rank }, id: { not: movingId } },
      orderBy: { rank: 'desc' },
    });
    return prev ? (prev.rank + before.rank) / 2 : before.rank - RANK_GAP;
  }

  private async plannableSprint(a: ProjectAccess, sprintId: string) {
    const sprint = await this.prisma.sprint.findFirst({ where: { id: sprintId, projectId: a.project.id } });
    if (!sprint) throw new NotFoundException('Sprint not found in this project');
    if (sprint.state === SprintState.CLOSED) throw new BadRequestException(`${sprint.name} is closed`);
    return sprint;
  }

  private assertPlannable(type: IssueType, status: IssueStatus) {
    if (type === IssueType.EPIC) throw new BadRequestException('Epics are not planned into sprints');
    if (UNGROOMED.includes(status)) {
      throw new BadRequestException(
        `Only groomed issues can be planned. This one is in ${STATUS_LABEL[status]}; send it through Lead review first.`,
      );
    }
  }

  /** Definition of Ready for leaving the BA lanes. */
  private assertReady(issue: Issue) {
    const missing: string[] = [];
    if (!issue.description?.trim()) missing.push('a description with acceptance criteria');
    if (missing.length) throw new BadRequestException(`Not ready for Lead review: add ${missing.join(' and ')}`);
  }

  private async validateParent(a: ProjectAccess, type: IssueType, parentId: string | null, selfId?: string) {
    if (type === IssueType.SUBTASK && !parentId) throw new BadRequestException('A sub-task needs a parent issue');
    if (!parentId) return;
    if (type === IssueType.EPIC) throw new BadRequestException('Epics cannot have a parent');
    if (parentId === selfId) throw new BadRequestException('An issue cannot be its own parent');

    const parent = await this.prisma.issue.findFirst({ where: { id: parentId, projectId: a.project.id } });
    if (!parent) throw new NotFoundException('Parent issue not found in this project');
    if (type === IssueType.SUBTASK && (parent.type === IssueType.EPIC || parent.type === IssueType.SUBTASK)) {
      throw new BadRequestException('A sub-task belongs to a story, task or bug');
    }
    if (type !== IssueType.SUBTASK && parent.type !== IssueType.EPIC) {
      throw new BadRequestException('Stories, tasks and bugs can only belong to an epic');
    }
  }

  private async validateAssignee(a: ProjectAccess, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: a.project.id, userId } },
    });
    if (!member) throw new BadRequestException(`The assignee is not a member of ${a.project.key}`);
  }
}
