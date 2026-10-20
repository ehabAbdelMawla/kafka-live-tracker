import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { KafkaModule } from './kafka/kafka.module';
import { SessionsModule } from './sessions/sessions.module';
import { LocationsModule } from './locations/locations.module';
import { GatewayModule } from './gateway/gateway.module';
import { ConsumersModule } from './consumers/consumers.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule, // loads .env etc
    KafkaModule, // global: producer + topic bootstrap
    HealthModule,
    SessionsModule,
    LocationsModule,
    GatewayModule, // Socket.IO /live namespace
    ConsumersModule, // broadcaster + archiver consumer groups
  ],
})
export class AppModule {}
