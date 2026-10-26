import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Project, ProjectRole } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

export interface ProjectAccess {
  project: Project;
  user: AuthUser;
  role: ProjectRole | null;
}

/** Project membership and role checks. Org admins can do everything. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async forProjectKey(key: string, user: AuthUser): Promise<ProjectAccess> {
    const project = await this.prisma.project.findUnique({ where: { key: key.toUpperCase() } });
    if (!project) throw new NotFoundException(`Project ${key} not found`);
    return this.forProject(project, user);
  }

  async forProjectId(projectId: string, user: AuthUser): Promise<ProjectAccess> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    return this.forProject(project, user);
  }

  async forIssueKey(issueKey: string, user: AuthUser) {
    const issue = await this.prisma.issue.findUnique({ where: { key: issueKey.toUpperCase() } });
    if (!issue) throw new NotFoundException(`Issue ${issueKey} not found`);
    return { issue, access: await this.forProjectId(issue.projectId, user) };
  }

  async forSprint(sprintId: string, user: AuthUser) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundException('Sprint not found');
    return { sprint, access: await this.forProjectId(sprint.projectId, user) };
  }

  async forWikiPage(pageId: string, user: AuthUser) {
    const page = await this.prisma.wikiPage.findUnique({ where: { id: pageId } });
    if (!page || page.archivedAt) throw new NotFoundException('Page not found');
    return { page, access: await this.forProjectId(page.projectId, user) };
  }

  can(access: ProjectAccess, roles: ProjectRole[]): boolean {
    return access.user.isAdmin || (access.role !== null && roles.includes(access.role));
  }

  require(access: ProjectAccess, roles: ProjectRole[], action: string) {
    if (!this.can(access, roles)) {
      throw new ForbiddenException(`Only ${roles.join(', ')} can ${action}`);
    }
  }

  private async forProject(project: Project, user: AuthUser): Promise<ProjectAccess> {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
    });
    if (!member && !user.isAdmin) {
      throw new ForbiddenException(`You are not a member of ${project.key}`);
    }
    return { project, user, role: member?.role ?? null };
  }
}
