import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { SendLocationDto } from './dto/send-location.dto';

@Controller()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  // Tracker posts one GPS point. Token in the header proves ownership.
  // 202 Accepted: the API answered, Kafka holds the event (consumers catch up later).
  @Post('sessions/:sessionId/locations')
  @HttpCode(202)
  async ingest(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Headers('x-tracker-token') token: string | undefined,
    @Body() dto: SendLocationDto,
  ) {
    await this.locations.ingest(sessionId, token, dto);
    return { accepted: true };
  }
}
