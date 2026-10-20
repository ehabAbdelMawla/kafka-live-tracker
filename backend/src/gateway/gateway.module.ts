import { Module } from '@nestjs/common';
import { LiveGateway } from './live.gateway';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule], // gateway needs the session store for join snapshots
  providers: [LiveGateway],
  exports: [LiveGateway],
})
export class GatewayModule {}
