import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, ProjectRole } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/auth-user';
import { userSummary } from '../common/selects';
import { PrismaService } from '../prisma/prisma.service';
import { publicRules } from '../workflow/workflow';
import { AddMemberDto, CreateProjectDto, UpdateMemberDto, UpdateProjectDto } from './projects.dto';

const MANAGERS: ProjectRole[] = [ProjectRole.PM];

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser) {
    const projects = await this.prisma.project.findMany({
      where: user.isAdmin ? {} : { members: { some: { userId: user.id } } },
      include: {
        members: { where: { userId: user.id }, select: { role: true } },
        sprints: { where: { state: 'ACTIVE' }, select: { id: true, name: true, endDate: true } },
        _count: { select: { members: true, issues: true } },
      },
      orderBy: { name: 'asc' },
    });
    return projects.map(({ members, sprints, ...p }) => ({
      ...p,
      myRole: members[0]?.role ?? null,
      activeSprint: sprints[0] ?? null,
    }));
  }

  /** Any signed-in user can start a project and becomes its PM. */
  async create(dto: CreateProjectDto, user: AuthUser) {
    const exists = await this.prisma.project.findUnique({ where: { key: dto.key } });
    if (exists) throw new ConflictException(`Project key ${dto.key} is already used`);

    return this.prisma.project.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        members: { create: { userId: user.id, role: ProjectRole.PM } },
      },
    });
  }

  async get(key: string, user: AuthUser) {
    const a = await this.access.forProjectKey(key, user);
    return { ...a.project, myRole: a.role, isAdmin: user.isAdmin, workflow: publicRules() };
  }

  async update(key: string, dto: UpdateProjectDto, user: AuthUser) {
    const a = await this.access.forProjectKey(key, user);
    this.access.require(a, MANAGERS, 'edit project settings');
    return this.prisma.project.update({ where: { id: a.project.id }, data: dto });
  }

  async members(key: string, user: AuthUser) {
    const a = await this.access.forProjectKey(key, user);
    return this.prisma.projectMember.findMany({
      where: { projectId: a.project.id },
      select: { role: true, addedAt: true, user: userSummary },
      orderBy: { user: { name: 'asc' } },
    });
  }

  async addMember(key: string, dto: AddMemberDto, user: AuthUser) {
    const a = await this.access.forProjectKey(key, user);
    this.access.require(a, MANAGERS, 'manage members');

    const target = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!target || !target.emailVerified) {
      throw new NotFoundException(`${dto.email} has no verified Yathra account yet. Ask them to sign up or sign in once, then add them.`);
    }
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: a.project.id, userId: target.id } },
    });
    const member = await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: a.project.id, userId: target.id } },
      create: { projectId: a.project.id, userId: target.id, role: dto.role },
      update: { role: dto.role },
      select: { role: true, addedAt: true, user: userSummary },
    });
    if (!existing) {
      await this.notifications.notify({
        type: NotificationType.ADDED_TO_PROJECT,
        recipients: [target.id],
        actorId: user.id,
        projectId: a.project.id,
        title: `You were added to ${a.project.name} (${a.project.key})`,
        body: `${user.name} added you as ${dto.role}.`,
        link: `/p/${a.project.key}/backlog`,
      });
    }
    return member;
  }

  async updateMember(key: string, userId: string, dto: UpdateMemberDto, user: AuthUser) {
    const a = await this.access.forProjectKey(key, user);
    this.access.require(a, MANAGERS, 'manage members');
    if (dto.role !== ProjectRole.PM) await this.ensureAnotherPm(a.project.id, userId);
    return this.prisma.projectMember.update({
      where: { projectId_userId: { projectId: a.project.id, userId } },
      data: { role: dto.role },
      select: { role: true, addedAt: true, user: userSummary },
    });
  }

  async removeMember(key: string, userId: string, user: AuthUser) {
    const a = await this.access.forProjectKey(key, user);
    this.access.require(a, MANAGERS, 'manage members');
    await this.ensureAnotherPm(a.project.id, userId);
    await this.prisma.projectMember.delete({ where: { projectId_userId: { projectId: a.project.id, userId } } });
    return { ok: true };
  }

  /** A project must always keep at least one PM, or nobody could manage it. */
  private async ensureAnotherPm(projectId: string, leavingUserId: string) {
    const pms = await this.prisma.projectMember.findMany({ where: { projectId, role: ProjectRole.PM } });
    if (pms.length === 1 && pms[0].userId === leavingUserId) {
      throw new BadRequestException('A project needs at least one PM');
    }
  }
}
