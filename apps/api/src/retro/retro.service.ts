import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectRole, RetroColumn, SprintState } from '@prisma/client';
import { AccessService, ProjectAccess } from '../access/access.service';
import { AuthUser } from '../auth/auth-user';
import { userSummary } from '../common/selects';
import { IssuesService } from '../issues/issues.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActionToTicketDto, CreateRetroItemDto, UpdateRetroItemDto } from './retro.dto';

/** Dot voting: each person spreads this many votes across a retro's notes. */
export const VOTES_PER_PERSON = 5;
const MANAGERS: ProjectRole[] = [ProjectRole.LEAD, ProjectRole.PM];
const ticketSelect = { select: { id: true, key: true, title: true, status: true, type: true } } as const;

@Injectable()
export class RetroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly issues: IssuesService,
  ) {}

  /** The retro board for a sprint, created on first open. Planned sprints have nothing to look back on yet. */
  async board(sprintId: string, user: AuthUser) {
    const { sprint, access } = await this.access.forSprint(sprintId, user);
    if (sprint.state === SprintState.PLANNED) {
      throw new BadRequestException(`${sprint.name} hasn't started yet, so there's nothing to look back on.`);
    }
    const retro = await this.prisma.retro.upsert({ where: { sprintId }, create: { sprintId }, update: {} });

    const [items, myVotes, previous, nextSprint] = await Promise.all([
      this.prisma.retroItem.findMany({
        where: { retroId: retro.id },
        include: { author: userSummary, issue: ticketSelect, votes: { select: { userId: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.retroVote.count({ where: { userId: user.id, item: { retroId: retro.id } } }),
      this.previousActions(sprint.projectId, sprint.sequence),
      this.nextPlannedSprint(sprint.projectId),
    ]);

    return {
      retro,
      sprint: {
        id: sprint.id,
        name: sprint.name,
        goal: sprint.goal,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        committedPoints: sprint.committedPoints,
        completedPoints: sprint.completedPoints,
      },
      items: items.map((i) => ({
        id: i.id,
        column: i.column,
        text: i.text,
        anonymous: i.anonymous,
        // Anonymous notes hide their author from everyone, Leads included; the author still sees it's theirs.
        author: i.anonymous ? null : i.author,
        mine: i.authorId === user.id,
        votes: i.votes.length,
        voted: i.votes.some((v) => v.userId === user.id),
        issue: i.issue,
        createdAt: i.createdAt,
      })),
      votesPerPerson: VOTES_PER_PERSON,
      votesLeft: Math.max(0, VOTES_PER_PERSON - myVotes),
      canManage: this.access.can(access, MANAGERS),
      previousActions: previous,
      nextSprint,
    };
  }

  async addItem(sprintId: string, dto: CreateRetroItemDto, user: AuthUser) {
    const { sprint } = await this.access.forSprint(sprintId, user);
    if (sprint.state === SprintState.PLANNED) throw new BadRequestException(`${sprint.name} hasn't started yet`);
    const retro = await this.prisma.retro.upsert({ where: { sprintId }, create: { sprintId }, update: {} });
    this.assertOpen(retro);
    return this.prisma.retroItem.create({
      data: { retroId: retro.id, column: dto.column, text: dto.text.trim(), anonymous: dto.anonymous ?? false, authorId: user.id },
    });
  }

  async updateItem(itemId: string, dto: UpdateRetroItemDto, user: AuthUser) {
    const { item } = await this.loadItem(itemId, user);
    if (item.authorId !== user.id) throw new ForbiddenException('You can only edit your own notes');
    this.assertOpen(item.retro);
    if (item.issueId && dto.column && dto.column !== RetroColumn.ACTION) {
      throw new BadRequestException('This action already has a ticket, so it stays in Actions');
    }
    return this.prisma.retroItem.update({
      where: { id: item.id },
      data: { text: dto.text?.trim(), column: dto.column },
    });
  }

  async deleteItem(itemId: string, user: AuthUser) {
    const { item, access } = await this.loadItem(itemId, user);
    if (item.authorId !== user.id) this.access.require(access, MANAGERS, "delete other people's notes");
    this.assertOpen(item.retro);
    await this.prisma.retroItem.delete({ where: { id: item.id } });
    return { ok: true };
  }

  /** Adds or removes the user's vote on a note, within their vote budget for this retro. */
  async toggleVote(itemId: string, user: AuthUser) {
    const { item } = await this.loadItem(itemId, user);
    this.assertOpen(item.retro);
    const existing = await this.prisma.retroVote.findUnique({ where: { itemId_userId: { itemId, userId: user.id } } });
    if (existing) {
      await this.prisma.retroVote.delete({ where: { itemId_userId: { itemId, userId: user.id } } });
      return { voted: false };
    }
    const used = await this.prisma.retroVote.count({ where: { userId: user.id, item: { retroId: item.retroId } } });
    if (used >= VOTES_PER_PERSON) {
      throw new BadRequestException(`You've used all ${VOTES_PER_PERSON} votes. Remove one to vote for this note.`);
    }
    await this.prisma.retroVote.create({ data: { itemId, userId: user.id } });
    return { voted: true };
  }

  /**
   * Turns an action into a TASK labelled retro-action, planned into the next sprint or the backlog.
   * Works on closed retros too, because teams often create the tickets right after closing.
   */
  async toTicket(itemId: string, dto: ActionToTicketDto, user: AuthUser) {
    const { item, access } = await this.loadItem(itemId, user);
    if (item.column !== RetroColumn.ACTION) throw new BadRequestException('Only notes in Actions can become tickets');
    if (item.issueId) throw new BadRequestException('This action already has a ticket');

    const next = dto.destination === 'NEXT_SPRINT' ? await this.nextPlannedSprint(access.project.id) : null;
    if (dto.destination === 'NEXT_SPRINT' && !next) {
      throw new BadRequestException('There is no planned sprint yet. Create one, or send the action to the backlog.');
    }

    const sprint = await this.prisma.sprint.findUniqueOrThrow({ where: { id: item.retro.sprintId } });
    const title = item.text.length > 255 ? `${item.text.slice(0, 252)}…` : item.text;
    const issue = await this.issues.create(
      access.project.key,
      {
        type: 'TASK',
        title,
        description: `Action from the ${sprint.name} retro.\n\n> ${item.text}`,
        labels: ['retro-action'],
        assigneeId: dto.assigneeId,
        sprintId: next?.id,
      },
      user,
    );
    await this.prisma.retroItem.update({ where: { id: item.id }, data: { issueId: issue.id } });
    return issue;
  }

  async close(sprintId: string, user: AuthUser) {
    const { access } = await this.access.forSprint(sprintId, user);
    this.access.require(access, MANAGERS, 'close a retro');
    const retro = await this.prisma.retro.findUnique({ where: { sprintId } });
    if (!retro) throw new NotFoundException('This sprint has no retro yet');
    return this.prisma.retro.update({ where: { id: retro.id }, data: { closedAt: new Date() } });
  }

  async reopen(sprintId: string, user: AuthUser) {
    const { access } = await this.access.forSprint(sprintId, user);
    this.access.require(access, MANAGERS, 'reopen a retro');
    const retro = await this.prisma.retro.findUnique({ where: { sprintId } });
    if (!retro) throw new NotFoundException('This sprint has no retro yet');
    return this.prisma.retro.update({ where: { id: retro.id }, data: { closedAt: null } });
  }

  /** Sprints that can have a retro (started or finished), newest first, for the sprint picker. */
  async sprints(projectKey: string, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    const sprints = await this.prisma.sprint.findMany({
      where: { projectId: a.project.id, state: { not: SprintState.PLANNED } },
      select: { id: true, name: true, state: true, endDate: true, retro: { select: { closedAt: true, _count: { select: { items: true } } } } },
      orderBy: { sequence: 'desc' },
    });
    return sprints.map(({ retro, ...s }) => ({
      ...s,
      retroStatus: !retro ? 'NOT_STARTED' : retro.closedAt ? 'CLOSED' : 'OPEN',
      noteCount: retro?._count.items ?? 0,
    }));
  }

  /** Actions from the most recent earlier retro, with their tickets' current status: did we follow through? */
  private async previousActions(projectId: string, sequence: number) {
    const prev = await this.prisma.sprint.findFirst({
      where: { projectId, sequence: { lt: sequence }, retro: { isNot: null } },
      orderBy: { sequence: 'desc' },
      select: { name: true, retro: { select: { items: { where: { column: RetroColumn.ACTION }, select: { id: true, text: true, issue: ticketSelect }, orderBy: { createdAt: 'asc' } } } } },
    });
    return prev?.retro?.items.length ? { sprintName: prev.name, items: prev.retro.items } : null;
  }

  private nextPlannedSprint(projectId: string) {
    return this.prisma.sprint.findFirst({
      where: { projectId, state: SprintState.PLANNED },
      orderBy: { sequence: 'asc' },
      select: { id: true, name: true },
    });
  }

  private async loadItem(itemId: string, user: AuthUser): Promise<{ item: Awaited<ReturnType<RetroService['findItem']>>; access: ProjectAccess }> {
    const item = await this.findItem(itemId);
    const sprint = await this.prisma.sprint.findUniqueOrThrow({ where: { id: item.retro.sprintId } });
    return { item, access: await this.access.forProjectId(sprint.projectId, user) };
  }

  private async findItem(itemId: string) {
    const item = await this.prisma.retroItem.findUnique({ where: { id: itemId }, include: { retro: true } });
    if (!item) throw new NotFoundException('Note not found');
    return item;
  }

  private assertOpen(retro: { closedAt: Date | null }) {
    if (retro.closedAt) throw new BadRequestException('This retro is closed. A Lead or PM can reopen it.');
  }
}
