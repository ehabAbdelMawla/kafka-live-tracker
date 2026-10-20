import { IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class SendLocationDto {
  // seq increments per session; viewers use it to drop out-of-order points.
  @IsInt()
  seq!: number;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @IsOptional()
  @IsNumber()
  speed?: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  // ms epoch timestamp taken on the phone at fix time.
  @IsInt()
  deviceTimestamp!: number;
}
