import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Verified users only: an unverified sign-up must not be addable to a project. */
  search(q: string) {
    const term = q.trim();
    return this.prisma.user.findMany({
      where: {
        emailVerified: true,
        ...(term
          ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] }
          : {}),
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }
}
