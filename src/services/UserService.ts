/**
 * UserService.ts
 * 
 * This service implements the core business logic for managing users.
 * It handles user registration, retrieval, and listing.
 * 
 * USER MANAGEMENT:
 * - Users are automatically registered when they first use the system
 * - Usernames are case-insensitive (stored in lowercase)
 * - Username uniqueness is enforced at the database level
 */
import { User, createUser, UsernameRequestSchema } from '../models/User.js';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { databaseService } from './DatabaseService.js';

/**
 * UserService Class
 *
 * This service follows the repository pattern to provide a clean
 * interface for working with users. It encapsulates all database
 * operations and business logic in one place.
 */
class UserService {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    // Allow dependency injection for testing, default to singleton databaseService
    this.db = db || databaseService.getDb();
  }

  /**
   * Get the database instance
   * Useful for testing to verify database state
   */
  getDb(): Database.Database {
    return this.db;
  }

  /**
   * Get or create a user by username
   * 
   * This method:
   * 1. Validates the username
   * 2. Checks if the user already exists
   * 3. Creates the user if they don't exist (automatic registration)
   * 4. Returns the User object
   * 
   * @param username The username to get or create
   * @returns The User object (existing or newly created)
   */
  getOrCreateUser(username: string): User {
    // Validate and normalize the username
    const validatedUsername = UsernameRequestSchema.parse(username);
    
    const db = this.db;
    
    // Check if user already exists
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const row = stmt.get(validatedUsername) as any;
    
    if (row) {
      // User exists, return it
      return {
        username: row.username,
        createdAt: row.createdAt,
      };
    }
    
    // User doesn't exist, create it (automatic registration)
    const user = createUser(validatedUsername);
    
    const insertStmt = db.prepare(`
      INSERT INTO users (username, createdAt)
      VALUES (?, ?)
    `);
    
    insertStmt.run(user.username, user.createdAt);
    
    return user;
  }

  /**
   * Get a user by username
   * 
   * @param username The username to retrieve
   * @returns The User if found, undefined otherwise
   */
  getUser(username: string): User | undefined {
    // Validate and normalize the username (safeParse to handle invalid usernames gracefully)
    const result = UsernameRequestSchema.safeParse(username);
    if (!result.success) {
      return undefined; // Return undefined for invalid usernames
    }
    const validatedUsername = result.data;
    
    const db = this.db;
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const row = stmt.get(validatedUsername) as any;
    
    if (!row) return undefined;
    
    return {
      username: row.username,
      createdAt: row.createdAt,
    };
  }

  /**
   * Get all users
   * 
   * @returns Array of all Users
   */
  getAllUsers(): User[] {
    const db = this.db;
    const stmt = db.prepare('SELECT * FROM users ORDER BY createdAt ASC');
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      username: row.username,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Check if a user exists
   * 
   * @param username The username to check
   * @returns true if the user exists, false otherwise
   */
  userExists(username: string): boolean {
    // Validate and normalize the username (safeParse to handle invalid usernames gracefully)
    const parseResult = UsernameRequestSchema.safeParse(username);
    if (!parseResult.success) {
      return false; // Return false for invalid usernames
    }
    const validatedUsername = parseResult.data;
    
    const db = this.db;
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?');
    const countResult = stmt.get(validatedUsername) as any;
    
    return countResult.count > 0;
  }

  /**
   * Delete a user and all their data
   * 
   * This method removes a user and all associated todos from the database.
   * Note: Tags are shared globally and are not deleted when a user is deleted.
   * 
   * @param username The username to delete
   * @returns true if deleted, false if not found
   */
  deleteUser(username: string): boolean {
    // Validate and normalize the username (safeParse to handle invalid usernames gracefully)
    const parseResult = UsernameRequestSchema.safeParse(username);
    if (!parseResult.success) {
      return false; // Return false for invalid usernames
    }
    const validatedUsername = parseResult.data;
    
    const db = this.db;
    
    // First, delete all todos belonging to this user
    const deleteTodosStmt = db.prepare('DELETE FROM todos WHERE username = ?');
    deleteTodosStmt.run(validatedUsername);
    
    // Then, delete the user
    const deleteUserStmt = db.prepare('DELETE FROM users WHERE username = ?');
    const deleteResult = deleteUserStmt.run(validatedUsername);
    
    return deleteResult.changes > 0;
  }
}

// Export class for testing (allows creating fresh instances with custom database)
export { UserService };

// Create a singleton instance for use throughout the application
export const userService = new UserService();
