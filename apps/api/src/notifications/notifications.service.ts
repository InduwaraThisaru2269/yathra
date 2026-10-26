import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, ProjectRole } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { MailService } from '../auth/mail.service';
import { userSummary } from '../common/selects';
import { PrismaService } from '../prisma/prisma.service';

export const DEFAULT_EMAIL_TYPES: NotificationType[] = [
  NotificationType.ASSIGNED,
  NotificationType.MENTIONED,
  NotificationType.RETURNED_TO_BA,
  NotificationType.QA_FAILED,
  NotificationType.ADDED_TO_PROJECT,
];

export interface NotifyInput {
  type: NotificationType;
  recipients: (string | null | undefined)[];
  actorId: string | null;
  projectId?: string;
  title: string;
  body?: string | null;
  /** Path inside the web app, e.g. /p/TN/backlog?issue=TN-12 */
  link: string;
}

/** `@[Name](user:<uuid>)` is how the comment box stores a mention. */
const MENTION = /@\[([^\]\n]{1,80})\]\(user:([0-9a-f-]{36})\)/g;

export function mentionedUserIds(text: string): string[] {
  return [...new Set([...text.matchAll(MENTION)].map((m) => m[2]!))];
}

/** Mentions shown as plain "@Name" in emails and notification previews. */
export function plainMentions(text: string) {
  return text.replace(MENTION, '@$1');
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  /**
   * Stores in-app notifications, then emails the people who opted in. Nobody is notified about
   * their own action. Email goes out in the background so the request that caused it stays fast.
   */
  async notify(input: NotifyInput) {
    const recipients = [...new Set(input.recipients.filter((id): id is string => !!id && id !== input.actorId))];
    if (!recipients.length) return;

    try {
      await this.prisma.notification.createMany({
        data: recipients.map((userId) => ({
          userId,
          projectId: input.projectId,
          actorId: input.actorId,
          type: input.type,
          title: input.title.slice(0, 300),
          body: input.body ? plainMentions(input.body).slice(0, 1000) : null,
          link: input.link,
        })),
      });
    } catch (err) {
      // A notification failure must never undo the change that triggered it.
      this.logger.error(`Could not store ${input.type} notifications: ${(err as Error).message}`);
      return;
    }

    this.email(input, recipients).catch((err) => this.logger.error(`Notification email failed: ${(err as Error).message}`));
  }

  /** Member ids of a project holding one of the roles, e.g. all Leads for a review request. */
  async membersWithRole(projectId: string, roles: ProjectRole[]) {
    const members = await this.prisma.projectMember.findMany({ where: { projectId, role: { in: roles } }, select: { userId: true } });
    return members.map((m) => m.userId);
  }

  async allMembers(projectId: string) {
    const members = await this.prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } });
    return members.map((m) => m.userId);
  }

  /** Keeps only ids that belong to the project, so a mention cannot reach outsiders. */
  async onlyMembers(projectId: string, userIds: string[]) {
    if (!userIds.length) return [];
    const members = await this.prisma.projectMember.findMany({ where: { projectId, userId: { in: userIds } }, select: { userId: true } });
    return members.map((m) => m.userId);
  }

  // ---- Reading ----

  async list(user: AuthUser, opts: { unreadOnly: boolean; take: number; before?: string }) {
    const items = await this.prisma.notification.findMany({
      where: {
        userId: user.id,
        ...(opts.unreadOnly ? { readAt: null } : {}),
        ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
      },
      include: { actor: userSummary, project: { select: { key: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: opts.take,
    });
    return { items, unreadCount: await this.unreadCount(user) };
  }

  unreadCount(user: AuthUser) {
    return this.prisma.notification.count({ where: { userId: user.id, readAt: null } });
  }

  async markRead(id: string, user: AuthUser) {
    const res = await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    if (res.count === 0 && !(await this.prisma.notification.findFirst({ where: { id, userId: user.id } }))) {
      throw new NotFoundException('Notification not found');
    }
    return { unreadCount: await this.unreadCount(user) };
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { unreadCount: 0 };
  }

  async settings(user: AuthUser) {
    const s = await this.prisma.notificationSettings.findUnique({ where: { userId: user.id } });
    return { emailFor: s?.emailFor ?? DEFAULT_EMAIL_TYPES, allTypes: Object.values(NotificationType) };
  }

  async updateSettings(user: AuthUser, emailFor: NotificationType[]) {
    const unique = [...new Set(emailFor)];
    const s = await this.prisma.notificationSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, emailFor: unique },
      update: { emailFor: unique },
    });
    return { emailFor: s.emailFor, allTypes: Object.values(NotificationType) };
  }

  private async email(input: NotifyInput, recipients: string[]) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: recipients }, emailVerified: true },
      select: { id: true, email: true, notificationSettings: { select: { emailFor: true } } },
    });
    const wanted = users.filter((u) => (u.notificationSettings?.emailFor ?? DEFAULT_EMAIL_TYPES).includes(input.type));
    for (const u of wanted) {
      await this.mail.send(
        u.email,
        `[Yathra] ${input.title}`,
        [
          input.title,
          input.body ? `\n${plainMentions(input.body)}` : '',
          `\nOpen in Yathra: ${this.appUrl}${input.link}`,
          `\nChoose which emails you get: ${this.appUrl}/?notifications=settings`,
        ].join('\n'),
      );
    }
    if (wanted.length) {
      await this.prisma.notification.updateMany({
        where: { userId: { in: wanted.map((u) => u.id) }, type: input.type, link: input.link, emailedAt: null },
        data: { emailedAt: new Date() },
      });
    }
  }
}
