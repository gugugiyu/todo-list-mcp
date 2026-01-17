/**
 * testDatabase.ts
 *
 * Test utilities for database setup and teardown.
 * This module provides utilities for creating and managing a test database
 * that is separate from the production database.
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '../../data/todos-test.sqlite');
const TEST_DB_WAL_PATH = `${TEST_DB_PATH}-wal`;
const TEST_DB_SHM_PATH = `${TEST_DB_PATH}-shm`;

/**
 * TestDatabaseService Class
 *
 * Manages a test database instance with the same schema as production.
 * Each test suite can create a fresh instance for isolated testing.
 */
export class TestDatabaseService {
  private db: Database.Database;

  constructor(dbPath: string = TEST_DB_PATH) {
    // Ensure the database folder exists
    const dbDir = path.dirname(dbPath);
    fs.mkdir(dbDir, { recursive: true }).catch(() => {});

    // Initialize the database with the configured path
    this.db = new Database(dbPath);

    // Set pragmas for performance and safety
    // Note: WAL mode is disabled for tests to avoid visibility issues with SELECT after INSERT
    this.db.pragma('journal_mode = DELETE');
    this.db.pragma('foreign_keys = ON');

    // Initialize the database schema
    this.initSchema();
  }

  /**
   * Initialize the database schema
   * This creates all required tables for testing.
   */
  private initSchema(): void {
    // Create users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        createdAt TEXT NOT NULL
      )
    `);

    // Create todos table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        title TEXT NOT NULL,
        priority TEXT NOT NULL,
        description TEXT NOT NULL,
        completedAt TEXT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        project_id TEXT NULL,
        FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
      )
    `);

    // Create projects table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
      )
    `);

    // Create tags table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    // Create junction table for N-N relationship between todos and tags
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS todo_tags (
        todo_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (todo_id, tag_id),
        FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    // Create junction table for task dependencies
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS todo_dependencies (
        blocked_todo_id TEXT NOT NULL,
        blocker_todo_id TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (blocked_todo_id, blocker_todo_id),
        FOREIGN KEY (blocked_todo_id) REFERENCES todos(id) ON DELETE CASCADE,
        FOREIGN KEY (blocker_todo_id) REFERENCES todos(id) ON DELETE CASCADE
      )
    `);
  }

  /**
   * Get the database instance
   */
  getDb(): Database.Database {
    return this.db;
  }

  /**
   * Clear all data from all tables
   * Useful for resetting state between tests
   */
  clearAll(): void {
    this.db.exec('DELETE FROM todo_dependencies');
    this.db.exec('DELETE FROM todo_tags');
    this.db.exec('DELETE FROM todos');
    this.db.exec('DELETE FROM projects');
    this.db.exec('DELETE FROM tags');
    this.db.exec('DELETE FROM users');
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
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
export function createTestDatabase(): TestDatabaseService {
  return new TestDatabaseService();
}

/**
 * Seed a user in the test database
 */
export function seedUser(db: Database.Database, username: string): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO users (username, createdAt) VALUES (?, ?)');
  stmt.run(username.toLowerCase(), new Date().toISOString());
}

/**
 * Seed a todo in the test database
 */
export function seedTodo(db: Database.Database, data: {
  id: string;
  username: string;
  title: string;
  priority: string;
  description: string;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string | null;
}): void {
  const stmt = db.prepare(`
    INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    data.id,
    data.username,
    data.title,
    data.priority,
    data.description,
    data.completedAt || null,
    data.createdAt || new Date().toISOString(),
    data.updatedAt || new Date().toISOString(),
    data.projectId || null
  );
}

/**
 * Seed a tag in the test database
 */
export function seedTag(db: Database.Database, data: {
  id: string;
  name: string;
  color?: string | null;
  createdAt?: string;
  updatedAt?: string;
}): void {
  const stmt = db.prepare(`
    INSERT INTO tags (id, name, color, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    data.id,
    data.name,
    data.color || null,
    data.createdAt || new Date().toISOString(),
    data.updatedAt || new Date().toISOString()
  );
}

/**
 * Seed a project in the test database
 */
export function seedProject(db: Database.Database, data: {
  id: string;
  username: string;
  name: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
}): void {
  const stmt = db.prepare(`
    INSERT INTO projects (id, username, name, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    data.id,
    data.username,
    data.name,
    data.description,
    data.createdAt || new Date().toISOString(),
    data.updatedAt || new Date().toISOString()
  );
}

/**
 * Seed a tag-todo relationship
 */
export function seedTagTodoRelation(db: Database.Database, todoId: string, tagId: string): void {
  const stmt = db.prepare(`
    INSERT INTO todo_tags (todo_id, tag_id, createdAt)
    VALUES (?, ?, ?)
  `);
  stmt.run(todoId, tagId, new Date().toISOString());
}

/**
 * Seed a todo dependency
 */
export function seedTodoDependency(db: Database.Database, blockedTodoId: string, blockerTodoId: string): void {
  const stmt = db.prepare(`
    INSERT INTO todo_dependencies (blocked_todo_id, blocker_todo_id, createdAt)
    VALUES (?, ?, ?)
  `);
  stmt.run(blockedTodoId, blockerTodoId, new Date().toISOString());
}

/**
 * Generate a unique UUID for testing
 * Uses a counter to ensure uniqueness across tests
 */
let uuidCounter = 0;
export function generateTestUuid(): string {
  return `550e8400-e29b-41d4-a716-446655440${String(uuidCounter++).padStart(11, '0')}`;
}
