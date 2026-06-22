import 'reflect-metadata';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';

const config = configuration();

const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: config.database.path,
  entities: ['src/database/entities/*.entity.{ts,js}'],
  migrations: ['src/database/migrations/*.{ts,js}'],
  synchronize: false,
  logging: config.database.logging,
});

export default AppDataSource;
