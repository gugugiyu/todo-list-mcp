/**
 * migrate.ts
 *
 * This script provides database migration functionality for the Todo List MCP Server.
 * It supports forward migration (v1 → v2) and rollback (v2 → v1).
 *
 * MIGRATION v1 → v2:
 * - Creates projects table
 * - Adds project_id column to todos table
 * - Creates schema_migrations table for tracking
 *
 * ROLLBACK v2 → v1:
 * - Drops projects table
 * - Removes project_id column from todos table
 * - Removes migration record
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default database path (same as config.ts)
const DEFAULT_DB_FOLDER = path.join(process.env.HOME || process.env.USERPROFILE || '', '.todo-list-mcp');
const DEFAULT_DB_FILE = 'todos.sqlite';

const dbPath = process.env.TODO_DB_PATH || path.join(DEFAULT_DB_FOLDER, DEFAULT_DB_FILE);
const backupPath = path.join(DEFAULT_DB_FOLDER, `${DEFAULT_DB_FILE}.backup`);

/**
 * Migration status interface
 */
interface MigrationStatus {
  currentVersion: string;
  canMigrate: boolean;
  canRollback: boolean;
  message: string;
}

/**
 * MigrationManager Class
 *
 * Handles all migration operations including forward migration,
 * rollback, and status checking.
 */
class MigrationManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  /**
   * Get current migration status
   */
  getStatus(): MigrationStatus {
    try {
      // Check if schema_migrations table exists
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get() as any;
      
      if (!tables) {
        return {
          currentVersion: 'v1',
          canMigrate: true,
          canRollback: false,
          message: 'Database is at v1. Ready to migrate to v2.'
        };
      }

      // Get latest migration version
      const migration = this.db.prepare('SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1').get() as any;
      
      if (!migration) {
        return {
          currentVersion: 'v1',
          canMigrate: true,
          canRollback: false,
          message: 'Database is at v1. Ready to migrate to v2.'
        };
      }

      if (migration.version === 'v2') {
        // Check if there are projects (warn about data loss on rollback)
        const projectCount = this.db.prepare('SELECT COUNT(*) as count FROM projects').get() as any;
        const todoWithProjectCount = this.db.prepare('SELECT COUNT(*) as count FROM todos WHERE project_id IS NOT NULL').get() as any;
        
        let warning = '';
        if (projectCount.count > 0 || todoWithProjectCount.count > 0) {
          warning = ` Warning: Rolling back will lose ${projectCount.count} project(s) and ${todoWithProjectCount.count} project assignment(s).`;
        }
        
        return {
          currentVersion: 'v2',
          canMigrate: false,
          canRollback: true,
          message: `Database is at v2.${warning}`
        };
      }

      return {
        currentVersion: migration.version,
        canMigrate: false,
        canRollback: false,
        message: `Unknown database version: ${migration.version}`
      };
    } catch (error: any) {
      return {
        currentVersion: 'unknown',
        canMigrate: false,
        canRollback: false,
        message: `Error checking migration status: ${error.message}`
      };
    }
  }

  /**
   * Create backup of the database
   */
  private createBackup(): void {
    console.log(`Creating backup at ${backupPath}...`);
    fs.copyFileSync(dbPath, backupPath);
    console.log('Backup created successfully.');
  }

  /**
   * Restore backup
   */
  private restoreBackup(): void {
    if (!fs.existsSync(backupPath)) {
      throw new Error('No backup file found. Cannot restore.');
    }
    console.log(`Restoring from ${backupPath}...`);
    fs.copyFileSync(backupPath, dbPath);
    console.log('Backup restored successfully.');
  }

  /**
   * Migrate database from v1 to v2
   */
  migrate(): void {
    const status = this.getStatus();
    
    if (!status.canMigrate) {
      console.error(`Cannot migrate: ${status.message}`);
      process.exit(1);
    }

    console.log('Starting migration v1 → v2...');
    
    try {
      // Create backup before migration
      this.createBackup();

      // Start transaction
      const migrate = this.db.transaction(() => {
        // Create projects table
        console.log('Creating projects table...');
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

        // Add project_id column to todos table
        console.log('Adding project_id column to todos table...');
        this.db.exec('ALTER TABLE todos ADD COLUMN project_id TEXT NULL');

        // Create schema_migrations table
        console.log('Creating schema_migrations table...');
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY,
            version TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL
          )
        `);

        // Record migration
        console.log('Recording migration...');
        this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run('v2', new Date().toISOString());
      });

      migrate();
      console.log('Migration completed successfully!');
      console.log('Database is now at v2.');
    } catch (error: any) {
      console.error('Migration failed:', error.message);
      console.log('Restoring backup...');
      this.restoreBackup();
      console.log('Backup restored. Database is back to v1.');
      process.exit(1);
    }
  }

  /**
   * Rollback database from v2 to v1
   */
  rollback(): void {
    const status = this.getStatus();
    
    if (!status.canRollback) {
      console.error(`Cannot rollback: ${status.message}`);
      process.exit(1);
    }

    console.log('Starting rollback v2 → v1...');

    // Check for data loss warning
    if (status.message.includes('Warning')) {
      console.log(status.message);
      console.log('');
      console.log('WARNING: Rolling back will lose project data and project assignments.');
      console.log('Type "yes" to continue, or anything else to cancel:');
      
      // Read from stdin
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('', (answer: string) => {
        rl.close();
        
        if (answer.toLowerCase() !== 'yes') {
          console.log('Rollback cancelled.');
          process.exit(0);
        }
        
        this.performRollback();
      });
    } else {
      this.performRollback();
    }
  }

  /**
   * Perform the actual rollback
   */
  private performRollback(): void {
    try {
      // Create backup before rollback
      this.createBackup();

      // Start transaction
      const rollback = this.db.transaction(() => {
        // Drop projects table
        console.log('Dropping projects table...');
        this.db.exec('DROP TABLE IF EXISTS projects');

        // Remove project_id column from todos table
        // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
        console.log('Removing project_id column from todos table...');
        this.db.exec(`
          CREATE TABLE todos_new (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            title TEXT NOT NULL,
            priority TEXT NOT NULL,
            description TEXT NOT NULL,
            completedAt TEXT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
          );
          
          INSERT INTO todos_new (id, username, title, priority, description, completedAt, createdAt, updatedAt)
          SELECT id, username, title, priority, description, completedAt, createdAt, updatedAt FROM todos;
          
          DROP TABLE todos;
          ALTER TABLE todos_new RENAME TO todos;
        `);

        // Remove migration record
        console.log('Removing migration record...');
        this.db.prepare('DELETE FROM schema_migrations WHERE version = ?').run('v2');
      });

      rollback();
      console.log('Rollback completed successfully!');
      console.log('Database is now at v1.');
    } catch (error: any) {
      console.error('Rollback failed:', error.message);
      console.log('Restoring backup...');
      this.restoreBackup();
      console.log('Backup restored. Database is back to v2.');
      process.exit(1);
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Main function
 */
function main() {
  const command = process.argv[2];

  if (!command) {
    console.log('Usage: node migrate.js <command>');
    console.log('');
    console.log('Commands:');
    console.log('  status   - Show current migration status');
    console.log('  migrate  - Migrate database from v1 to v2');
    console.log('  rollback - Rollback database from v2 to v1');
    process.exit(0);
  }

  const manager = new MigrationManager(dbPath);

  switch (command) {
    case 'status':
      const status = manager.getStatus();
      console.log('');
      console.log('Migration Status:');
      console.log(`  Current Version: ${status.currentVersion}`);
      console.log(`  Can Migrate: ${status.canMigrate ? 'Yes' : 'No'}`);
      console.log(`  Can Rollback: ${status.canRollback ? 'Yes' : 'No'}`);
      console.log(`  Message: ${status.message}`);
      console.log('');
      break;

    case 'migrate':
      manager.migrate();
      break;

    case 'rollback':
      manager.rollback();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Use "status", "migrate", or "rollback"');
      process.exit(1);
  }

  manager.close();
}

// Run the main function
main();
