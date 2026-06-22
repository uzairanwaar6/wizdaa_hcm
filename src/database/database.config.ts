import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';

export const buildTypeOrmOptions = (config: ConfigService): TypeOrmModuleOptions => {
  const db = config.get<AppConfig['database']>('database');
  const path = db?.path ?? './data/timeoff.sqlite';

  if (path !== ':memory:') {
    const dir = dirname(path);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  return {
    type: 'better-sqlite3',
    database: path,
    autoLoadEntities: true,
    synchronize: db?.synchronize ?? false,
    logging: db?.logging ?? false,
  };
};
