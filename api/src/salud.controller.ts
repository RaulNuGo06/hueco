import { Controller, Get } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import type { Database } from './db/database.js';

@ApiExcludeController()
@Public()
@Controller('salud')
export class SaludController {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  @Get()
  async salud() {
    await this.db.execute(sql`select 1`);
    return { estado: 'ok' };
  }
}
