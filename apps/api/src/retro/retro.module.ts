import { Module } from '@nestjs/common';
import { IssuesModule } from '../issues/issues.module';
import { RetroController } from './retro.controller';
import { RetroService } from './retro.service';

@Module({
  imports: [IssuesModule],
  controllers: [RetroController],
  providers: [RetroService],
})
export class RetroModule {}
