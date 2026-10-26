import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AccessModule } from './access/access.module';
import { AuthModule } from './auth/auth.module';
import { AppAuthGuard } from './auth/app-auth.guard';
import { BoardsModule } from './boards/boards.module';
import { IssuesModule } from './issues/issues.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { ReportsModule } from './reports/reports.module';
import { SprintsModule } from './sprints/sprints.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RetroModule } from './retro/retro.module';
import { WikiModule } from './wiki/wiki.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccessModule,
    NotificationsModule,
    ProjectsModule,
    IssuesModule,
    SprintsModule,
    BoardsModule,
    ReportsModule,
    WikiModule,
    RetroModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AppAuthGuard }],
})
export class AppModule {}
