/**
 * data-source.ts
 *
 * TypeORM DataSource configuration.
 * This file configures the database connection and entities.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config, ensureDbFolder } from './config.js';
import { User, Todo, Tag, Project, TodoDependency } from './entities/index.js';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: config.db.path,
  synchronize: true, // Automatically sync schema with entity definitions
  logging: false,
  entities: [User, Todo, Tag, Project, TodoDependency],
  migrations: [],
  subscribers: [],
  extra: {
    // Enable WAL mode for better performance
    flags: ['OPEN_URI', 'OPEN_READWRITE', 'OPEN_CREATE'],
  },
});

/**
 * Initialize the DataSource
 * This should be called when the application starts.
 */
export async function initializeDataSource(): Promise<void> {
  // Ensure the database folder exists
  ensureDbFolder();

  console.error('Database location exists!');

  // Initialize the DataSource
  await AppDataSource.initialize();

  // Enable WAL mode and foreign keys
  await AppDataSource.query('PRAGMA journal_mode = WAL');
  await AppDataSource.query('PRAGMA foreign_keys = ON');

  console.error('Data Source has been initialized!');
}

/**
 * Close the DataSource
 * This should be called when the application shuts down.
 */
export async function closeDataSource(): Promise<void> {
  await AppDataSource.destroy();
  console.error('Data Source has been closed!');
}
