/**
 * testDatabase.ts
 *
 * Test utilities for database setup and teardown.
 * This module provides utilities for creating and managing a test database
 * that is separate from production database.
 */

import { DataSource } from 'typeorm';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'reflect-metadata';

// Import entities
import { User } from '../../src/entities/User.entity.js';
import { Todo } from '../../src/entities/Todo.entity.js';
import { Tag } from '../../src/entities/Tag.entity.js';
import { Project } from '../../src/entities/Project.entity.js';
import { TodoDependency } from '../../src/entities/TodoDependency.entity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '../../data/todos-test.sqlite');

/**
 * TestDatabaseService Class
 *
 * Manages a test database instance with TypeORM.
 * Each test suite can create a fresh instance for isolated testing.
 */
export class TestDatabaseService {
  private dataSource: DataSource;

  constructor(dbPath: string = TEST_DB_PATH) {
    // Ensure the database folder exists
    const dbDir = path.dirname(dbPath);
    fs.mkdir(dbDir, { recursive: true }).catch(() => {});

    // Initialize TypeORM DataSource for testing
    this.dataSource = new DataSource({
      type: 'sqlite',
      database: dbPath,
      entities: [User, Todo, Tag, Project, TodoDependency],
      synchronize: true, // Auto-create schema for tests
      logging: false,
    });
  }

  /**
   * Initialize the database connection
   */
  async initialize(): Promise<void> {
    await this.dataSource.initialize();
  }

  /**
   * Get the DataSource instance
   */
  getDataSource(): DataSource {
    return this.dataSource;
  }

  /**
   * Clear all data from all tables
   * Useful for resetting state between tests
   */
  async clearAll(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      
      // Clear junction tables first (due to foreign key constraints)
      await queryRunner.query('DELETE FROM todo_dependencies');
      await queryRunner.query('DELETE FROM todo_tags');
      
      // Clear main tables
      await queryRunner.query('DELETE FROM todos');
      await queryRunner.query('DELETE FROM projects');
      await queryRunner.query('DELETE FROM tags');
      await queryRunner.query('DELETE FROM users');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  /**
   * Delete the test database file
   */
  static async cleanup(): Promise<void> {
    try {
      await fs.unlink(TEST_DB_PATH);
      // Also clean up WAL files
      await fs.unlink(`${TEST_DB_PATH}-wal`).catch(() => {});
      await fs.unlink(`${TEST_DB_PATH}-shm`).catch(() => {});
    } catch (error) {
      // File might not exist, ignore error
    }
  }
}

/**
 * Create a fresh test database instance
 * This should be called in beforeEach or beforeAll hooks
 */
export async function createTestDatabase(): Promise<TestDatabaseService> {
  const testDb = new TestDatabaseService();
  await testDb.initialize();
  return testDb;
}

/**
 * Seed a user in the test database
 */
export async function seedUser(dataSource: DataSource, username: string): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const user = userRepo.create({
    username: username.toLowerCase(),
    createdAt: new Date().toISOString()
  });
  await userRepo.save(user);
}

/**
 * Seed a todo in the test database
 */
export async function seedTodo(dataSource: DataSource, data: {
  id: string;
  username: string;
  title: string;
  priority: string;
  description: string;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string | null;
}): Promise<void> {
  const todoRepo = dataSource.getRepository(Todo);
  const todo = todoRepo.create({
    id: data.id,
    username: data.username,
    title: data.title,
    priority: data.priority,
    description: data.description,
    completedAt: data.completedAt || null,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    projectId: data.projectId || null
  });
  await todoRepo.save(todo);
}

/**
 * Seed a tag in the test database
 */
export async function seedTag(dataSource: DataSource, data: {
  id: string;
  name: string;
  color?: string | null;
  createdAt?: string;
  updatedAt?: string;
}): Promise<void> {
  const tagRepo = dataSource.getRepository(Tag);
  const tag = tagRepo.create({
    id: data.id,
    name: data.name,
    color: data.color || null,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString()
  });
  await tagRepo.save(tag);
}

/**
 * Seed a project in the test database
 */
export async function seedProject(dataSource: DataSource, data: {
  id: string;
  username: string;
  name: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
}): Promise<void> {
  const projectRepo = dataSource.getRepository(Project);
  const project = projectRepo.create({
    id: data.id,
    username: data.username,
    name: data.name,
    description: data.description,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString()
  });
  await projectRepo.save(project);
}

/**
 * Seed a tag-todo relationship
 */
export async function seedTagTodoRelation(dataSource: DataSource, todoId: string, tagId: string): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    await queryRunner.connect();
    await queryRunner.query(`
      INSERT INTO todo_tags (todo_id, tag_id, createdAt)
      VALUES (?, ?, ?)
    `, [todoId, tagId, new Date().toISOString()]);
  } finally {
    await queryRunner.release();
  }
}

/**
 * Seed a todo dependency
 */
export async function seedTodoDependency(dataSource: DataSource, blockedTodoId: string, blockerTodoId: string): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    await queryRunner.connect();
    await queryRunner.query(`
      INSERT INTO todo_dependencies (blocked_todo_id, blocker_todo_id, createdAt)
      VALUES (?, ?, ?)
    `, [blockedTodoId, blockerTodoId, new Date().toISOString()]);
  } finally {
    await queryRunner.release();
  }
}

/**
 * Generate a unique UUID for testing
 * Uses a counter to ensure uniqueness across tests
 */
let uuidCounter = 0;
export function generateTestUuid(): string {
  return `550e8400-e29b-41d4-a716-446655440${String(uuidCounter++).padStart(11, '0')}`;
}
