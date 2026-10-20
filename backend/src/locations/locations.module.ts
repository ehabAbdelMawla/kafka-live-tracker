import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule], // LocationsService needs SessionsService
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}
