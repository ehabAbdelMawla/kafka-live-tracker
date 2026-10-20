import { Global, Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';

// Global so every feature module can inject KafkaService directly.
@Global()
@Module({
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule {}
