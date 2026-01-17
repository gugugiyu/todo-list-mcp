/**
 * UserService.test.ts
 *
 * Unit tests for UserService.
 * Tests for user management operations including creation, retrieval, listing, and deletion.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserService } from '../../src/services/UserService.js';
import { TestDatabaseService, seedUser, generateTestUuid } from '../utils/testDatabase.js';

describe('UserService', () => {
  let testDb: TestDatabaseService;
  let userService: UserService;

  beforeEach(() => {
    // Create a fresh test database and service for each test
    testDb = new TestDatabaseService();
    userService = new UserService(testDb.getDb());
  });

  afterEach(() => {
    // Clean up
    testDb.close();
  });

  describe('getOrCreateUser', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should create a new user if they do not exist', () => {
      const user = userService.getOrCreateUser('john-doe');

      expect(user.username).toBe('john-doe');
      expect(user.createdAt).toBeDefined();
    });

    it('should return existing user if they already exist', () => {
      const firstUser = userService.getOrCreateUser('jane-smith');
      const secondUser = userService.getOrCreateUser('jane-smith');

      expect(firstUser.username).toBe(secondUser.username);
      expect(firstUser.createdAt).toBe(secondUser.createdAt);
    });

    it('should normalize username to lowercase', () => {
      const user1 = userService.getOrCreateUser('John-Doe');
      const user2 = userService.getOrCreateUser('JOHN-DOE');

      expect(user1.username).toBe('john-doe');
      expect(user2.username).toBe('john-doe');
    });

    it('should throw error for invalid username', () => {
      expect(() => {
        userService.getOrCreateUser('ab'); // Too short
      }).toThrow();

      expect(() => {
        userService.getOrCreateUser('a'.repeat(13)); // Too long
      }).toThrow();

      expect(() => {
        userService.getOrCreateUser('john@doe'); // Invalid characters
      }).toThrow();
    });

    it('should persist user to database', () => {
      userService.getOrCreateUser('test-user');

      const user = userService.getUser('test-user');

      expect(user).toBeDefined();
      expect(user?.username).toBe('test-user');
    });
  });

  describe('getUser', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return undefined for non-existent user', () => {
      const user = userService.getUser('nonexistent-user');

      expect(user).toBeUndefined();
    });

    it('should return user if they exist', () => {
      userService.getOrCreateUser('alice');

      const user = userService.getUser('alice');

      expect(user).toBeDefined();
      expect(user?.username).toBe('alice');
      expect(user?.createdAt).toBeDefined();
    });

    it('should be case-insensitive', () => {
      userService.getOrCreateUser('bob');

      const user1 = userService.getUser('bob');
      const user2 = userService.getUser('BOB');
      const user3 = userService.getUser('Bob');

      expect(user1?.username).toBe('bob');
      expect(user2?.username).toBe('bob');
      expect(user3?.username).toBe('bob');
    });
  });

  describe('getAllUsers', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return empty array when no users exist', () => {
      const users = userService.getAllUsers();

      expect(users).toEqual([]);
    });

    it('should return all users in creation order', () => {
      userService.getOrCreateUser('user1');
      userService.getOrCreateUser('user2');
      userService.getOrCreateUser('user3');

      const users = userService.getAllUsers();

      expect(users).toHaveLength(3);
      expect(users[0].username).toBe('user1');
      expect(users[1].username).toBe('user2');
      expect(users[2].username).toBe('user3');
    });

    it('should not include duplicate users', () => {
      userService.getOrCreateUser('user1');
      userService.getOrCreateUser('user1'); // Same user
      userService.getOrCreateUser('user2');

      const users = userService.getAllUsers();

      expect(users).toHaveLength(2);
    });
  });

  describe('userExists', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return false for non-existent user', () => {
      const exists = userService.userExists('nonexistent-user');

      expect(exists).toBe(false);
    });

    it('should return true for existing user', () => {
      userService.getOrCreateUser('exist-user');

      const exists = userService.userExists('exist-user');

      expect(exists).toBe(true);
    });

    it('should be case-insensitive', () => {
      userService.getOrCreateUser('testuser');

      expect(userService.userExists('testuser')).toBe(true);
      expect(userService.userExists('TESTUSER')).toBe(true);
      expect(userService.userExists('TestUser')).toBe(true);
    });
  });

  describe('deleteUser', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return false for non-existent user', () => {
      const result = userService.deleteUser('nonexistent-user');

      expect(result).toBe(false);
    });

    it('should delete user and return true', () => {
      userService.getOrCreateUser('delete-me');

      const result = userService.deleteUser('delete-me');

      expect(result).toBe(true);
      expect(userService.getUser('delete-me')).toBeUndefined();
    });

    it('should delete all todos belonging to user', () => {
      const username = 'user-todos';
      const db = testDb.getDb();

      // Seed user and todos
      userService.getOrCreateUser(username);
      userService.getOrCreateUser('other-user');

      const todo1Id = generateTestUuid();
      const todo2Id = generateTestUuid();
      const todo3Id = generateTestUuid();

      db.prepare(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(todo1Id, username, 'Todo 1', 'MEDIUM', 'Description 1', null, new Date().toISOString(), new Date().toISOString());
      db.prepare(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(todo2Id, username, 'Todo 2', 'HIGH', 'Description 2', null, new Date().toISOString(), new Date().toISOString());
      db.prepare(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(todo3Id, 'other-user', 'Todo 3', 'LOW', 'Description 3', null, new Date().toISOString(), new Date().toISOString());

      // Delete the user
      userService.deleteUser(username);

      // Check that user's todos are deleted but other user's todos remain
      const remainingTodos = db.prepare('SELECT * FROM todos').all() as any[];
      expect(remainingTodos).toHaveLength(1);
      expect(remainingTodos[0].username).toBe('other-user');
    });

    it('should be case-insensitive', () => {
      userService.getOrCreateUser('delete-user');

      const result = userService.deleteUser('DELETE-USER');

      expect(result).toBe(true);
      expect(userService.getUser('delete-user')).toBeUndefined();
    });
  });
});
