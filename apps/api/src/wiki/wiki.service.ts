import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectRole, WikiPage } from '@prisma/client';
import { AccessService, ProjectAccess } from '../access/access.service';
import { AuthUser } from '../auth/auth-user';
import { userSummary } from '../common/selects';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePageDto, MovePageDto, RestoreVersionDto, UpdatePageDto } from './wiki.dto';

type Tx = Prisma.TransactionClient;
const GAP = 1024;
const linkedIssue = { select: { id: true, key: true, title: true, status: true, type: true } } as const;

@Injectable()
export class WikiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** The whole page tree as a flat list; the web app nests it by parentId. */
  async tree(projectKey: string, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    return this.prisma.wikiPage.findMany({
      where: { projectId: a.project.id, archivedAt: null },
      select: { id: true, title: true, parentId: true, position: true, updatedAt: true, updatedBy: userSummary },
      orderBy: { position: 'asc' },
    });
  }

  async search(projectKey: string, q: string, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    const term = q.trim();
    if (term.length < 2) return [];
    const pages = await this.prisma.wikiPage.findMany({
      where: {
        projectId: a.project.id,
        archivedAt: null,
        OR: [{ title: { contains: term, mode: 'insensitive' } }, { content: { contains: term, mode: 'insensitive' } }],
      },
      select: { id: true, title: true, content: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    return pages.map(({ content, ...p }) => ({ ...p, snippet: snippet(content, term) }));
  }

  async get(pageId: string, user: AuthUser) {
    const { page, access } = await this.access.forWikiPage(pageId, user);
    const full = await this.prisma.wikiPage.findUniqueOrThrow({
      where: { id: page.id },
      include: {
        createdBy: userSummary,
        updatedBy: userSummary,
        children: { where: { archivedAt: null }, select: { id: true, title: true }, orderBy: { position: 'asc' } },
        issues: { select: { issue: linkedIssue } },
      },
    });
    const { issues, ...rest } = full;
    return {
      ...rest,
      projectKey: access.project.key,
      breadcrumbs: await this.ancestors(page),
      linkedIssues: issues.map((l) => l.issue),
    };
  }

  async create(projectKey: string, dto: CreatePageDto, user: AuthUser) {
    const a = await this.access.forProjectKey(projectKey, user);
    if (dto.parentId) await this.pageInProject(dto.parentId, a.project.id);
    const content = dto.content ?? '';

    return this.prisma.$transaction(async (tx) => {
      const max = await tx.wikiPage.aggregate({
        where: { projectId: a.project.id, parentId: dto.parentId ?? null, archivedAt: null },
        _max: { position: true },
      });
      const page = await tx.wikiPage.create({
        data: {
          projectId: a.project.id,
          parentId: dto.parentId ?? null,
          title: dto.title.trim(),
          content,
          position: (max._max.position ?? 0) + GAP,
          createdById: user.id,
          updatedById: user.id,
        },
      });
      await tx.wikiPageVersion.create({
        data: { pageId: page.id, version: 1, title: page.title, content, editedById: user.id },
      });
      await this.syncIssueLinks(tx, page.id, a.project, content);
      return page;
    });
  }

  /**
   * Saves a new version. The editor sends the version it started from; if someone saved in the
   * meantime the save is refused, so nobody silently overwrites a teammate's edit.
   */
  async update(pageId: string, dto: UpdatePageDto, user: AuthUser) {
    const { page, access } = await this.access.forWikiPage(pageId, user);
    const title = dto.title?.trim() ?? page.title;
    const content = dto.content ?? page.content;
    if (title === page.title && content === page.content) return page;
    return this.saveVersion(page, access, title, content, dto.baseVersion, user);
  }

  async versions(pageId: string, user: AuthUser) {
    await this.access.forWikiPage(pageId, user);
    return this.prisma.wikiPageVersion.findMany({
      where: { pageId },
      select: { version: true, title: true, createdAt: true, editedBy: userSummary },
      orderBy: { version: 'desc' },
    });
  }

  async version(pageId: string, version: number, user: AuthUser) {
    await this.access.forWikiPage(pageId, user);
    const v = await this.prisma.wikiPageVersion.findUnique({
      where: { pageId_version: { pageId, version } },
      include: { editedBy: userSummary },
    });
    if (!v) throw new NotFoundException(`Version ${version} not found`);
    return v;
  }

  /** Restoring copies an old version forward as the newest one, so history is never rewritten. */
  async restore(pageId: string, version: number, dto: RestoreVersionDto, user: AuthUser) {
    const { page, access } = await this.access.forWikiPage(pageId, user);
    const old = await this.prisma.wikiPageVersion.findUnique({ where: { pageId_version: { pageId, version } } });
    if (!old) throw new NotFoundException(`Version ${version} not found`);
    return this.saveVersion(page, access, old.title, old.content, dto.baseVersion, user);
  }

  async move(pageId: string, dto: MovePageDto, user: AuthUser) {
    const { page, access } = await this.access.forWikiPage(pageId, user);
    const parentId = dto.parentId ?? null;

    if (parentId) {
      if (parentId === page.id) throw new BadRequestException('A page cannot be its own parent');
      const parent = await this.pageInProject(parentId, access.project.id);
      // Walk up from the new parent: finding this page means the move would create a loop.
      for (const a of await this.ancestors(parent)) {
        if (a.id === page.id) throw new BadRequestException('A page cannot move under one of its own sub-pages');
      }
    }

    let position: number;
    if (dto.beforeId) {
      const before = await this.prisma.wikiPage.findFirst({
        where: { id: dto.beforeId, projectId: access.project.id, parentId, archivedAt: null },
      });
      if (!before) throw new BadRequestException('The page to drop before is not in that place');
      const prev = await this.prisma.wikiPage.findFirst({
        where: { projectId: access.project.id, parentId, archivedAt: null, position: { lt: before.position }, id: { not: page.id } },
        orderBy: { position: 'desc' },
      });
      position = prev ? (prev.position + before.position) / 2 : before.position - GAP;
    } else {
      const max = await this.prisma.wikiPage.aggregate({
        where: { projectId: access.project.id, parentId, archivedAt: null, id: { not: page.id } },
        _max: { position: true },
      });
      position = (max._max.position ?? 0) + GAP;
    }

    return this.prisma.wikiPage.update({ where: { id: page.id }, data: { parentId, position } });
  }

  /** Archives the page and everything under it. Authors, Leads and PMs can delete. */
  async remove(pageId: string, user: AuthUser) {
    const { page, access } = await this.access.forWikiPage(pageId, user);
    if (page.createdById !== user.id) {
      this.access.require(access, [ProjectRole.LEAD, ProjectRole.PM], "delete other people's pages");
    }
    const ids = await this.descendantIds(page.id);
    await this.prisma.wikiPage.updateMany({ where: { id: { in: [page.id, ...ids] } }, data: { archivedAt: new Date() } });
    return { ok: true, archived: ids.length + 1 };
  }

  /** Pages that mention an issue, for the "Wiki pages" section of the issue panel. */
  async pagesForIssue(issueId: string) {
    const links = await this.prisma.wikiIssueLink.findMany({
      where: { issueId, page: { archivedAt: null } },
      select: { page: { select: { id: true, title: true, updatedAt: true } } },
    });
    return links.map((l) => l.page);
  }

  private async saveVersion(page: WikiPage, access: ProjectAccess, title: string, content: string, baseVersion: number, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      // The version check and the bump are one statement, so two saves cannot both win.
      const bumped = await tx.wikiPage.updateMany({
        where: { id: page.id, version: baseVersion, archivedAt: null },
        data: { title, content, version: { increment: 1 }, updatedById: user.id },
      });
      if (bumped.count === 0) {
        const current = await tx.wikiPage.findUnique({ where: { id: page.id }, include: { updatedBy: userSummary } });
        throw new ConflictException(
          `${current?.updatedBy.name ?? 'Someone'} saved a newer version (v${current?.version}) while you were editing. ` +
            'Copy your changes, reload the page and apply them again.',
        );
      }
      await tx.wikiPageVersion.create({
        data: { pageId: page.id, version: baseVersion + 1, title, content, editedById: user.id },
      });
      await this.syncIssueLinks(tx, page.id, access.project, content);
      return tx.wikiPage.findUniqueOrThrow({ where: { id: page.id } });
    });
  }

  /** Rebuilds which issues of this project the page mentions (keys like TN-123, outside code). */
  private async syncIssueLinks(tx: Tx, pageId: string, project: { id: string; key: string }, content: string) {
    const keys = extractIssueKeys(content, project.key);
    const issues = keys.length
      ? await tx.issue.findMany({ where: { projectId: project.id, key: { in: keys } }, select: { id: true } })
      : [];
    await tx.wikiIssueLink.deleteMany({ where: { pageId } });
    if (issues.length) {
      await tx.wikiIssueLink.createMany({ data: issues.map((i) => ({ pageId, issueId: i.id })), skipDuplicates: true });
    }
  }

  private async pageInProject(id: string, projectId: string) {
    const page = await this.prisma.wikiPage.findFirst({ where: { id, projectId, archivedAt: null } });
    if (!page) throw new NotFoundException('Parent page not found in this project');
    return page;
  }

  /** Root-first chain of ancestors. Page trees are shallow, so one query per level is fine. */
  private async ancestors(page: Pick<WikiPage, 'parentId'>) {
    const chain: { id: string; title: string }[] = [];
    let parentId = page.parentId;
    while (parentId && chain.length < 50) {
      const p = await this.prisma.wikiPage.findUnique({ where: { id: parentId }, select: { id: true, title: true, parentId: true } });
      if (!p) break;
      chain.unshift({ id: p.id, title: p.title });
      parentId = p.parentId;
    }
    return chain;
  }

  private async descendantIds(rootId: string) {
    const ids: string[] = [];
    let frontier = [rootId];
    while (frontier.length) {
      const kids = await this.prisma.wikiPage.findMany({
        where: { parentId: { in: frontier }, archivedAt: null },
        select: { id: true },
      });
      frontier = kids.map((k) => k.id);
      ids.push(...frontier);
    }
    return ids;
  }
}

/** Issue keys of one project mentioned in Markdown, ignoring fenced and inline code. */
export function extractIssueKeys(markdown: string, projectKey: string): string[] {
  const text = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  // Not preceded by a letter, digit or hyphen, so "TN-YT-2" does not count as YT-2.
  const re = new RegExp(`(?<![A-Za-z0-9-])${projectKey}-\\d+\\b`, 'g');
  return [...new Set(text.match(re) ?? [])];
}

function snippet(content: string, term: string) {
  const i = content.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return content.slice(0, 140);
  const start = Math.max(0, i - 60);
  return (start ? '…' : '') + content.slice(start, i + term.length + 80).replace(/\s+/g, ' ') + '…';
}
