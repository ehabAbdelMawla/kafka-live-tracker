import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { ShareController } from './share.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController, ShareController],
  providers: [SessionsService],
  exports: [SessionsService], // needed by LocationsModule
})
export class SessionsModule {}
