import { Module } from '@nestjs/common';
import { BroadcasterConsumer } from './broadcaster.consumer';
import { ArchiverConsumer } from './archiver.consumer';
import { GatewayModule } from '../gateway/gateway.module';

// Both consumers register themselves in onModuleInit via KafkaService.
// BroadcasterConsumer also needs the exported LiveGateway.
@Module({
  imports: [GatewayModule],
  providers: [BroadcasterConsumer, ArchiverConsumer],
})
export class ConsumersModule {}
