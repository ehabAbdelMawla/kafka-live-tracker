import { Global, Module } from '@nestjs/common';
// Side-effect import: loads backend/.env into process.env at module load.
import './configuration';

// Empty by design: the "configuration" happens at import time via dotenv.
// A typed ConfigService (e.g. @nestjs/config) can replace this later.
@Global()
@Module({})
export class ConfigModule {}
