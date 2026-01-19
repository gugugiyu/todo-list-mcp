/**
 * UserService.test.ts
 *
 * Unit tests for UserService.
 * Tests for user management operations including creation, retrieval, listing, and deletion.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserService } from '../../src/services/UserService.js';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { TestDatabaseService, seedUser, generateTestUuid } from '../utils/testDatabase.js';

describe('UserService', () => {
  let testDb: TestDatabaseService;
  let userService: UserService;

  beforeEach(async () => {
    // Create a fresh test database and service for each test
    testDb = new TestDatabaseService();
    await testDb.initialize();
    // Create a DatabaseService instance with test DataSource
    const testDbService = new DatabaseService(testDb.getDataSource());
    userService = new UserService(testDbService);
  });

  afterEach(async () => {
    // Clean up
    await testDb.close();
  });

  describe('getOrCreateUser', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should create a new user if they do not exist', async () => {
      const user = await userService.getOrCreateUser('john-doe');

      expect(user.username).toBe('john-doe');
      expect(user.createdAt).toBeDefined();
    });

    it('should return existing user if they already exist', async () => {
      const firstUser = await userService.getOrCreateUser('jane-smith');
      const secondUser = await userService.getOrCreateUser('jane-smith');

      expect(firstUser.username).toBe(secondUser.username);
      expect(firstUser.createdAt).toBe(secondUser.createdAt);
    });

    it('should normalize username to lowercase', async () => {
      const user1 = await userService.getOrCreateUser('John-Doe');
      const user2 = await userService.getOrCreateUser('JOHN-DOE');

      expect(user1.username).toBe('john-doe');
      expect(user2.username).toBe('john-doe');
    });

    it('should throw error for invalid username', async () => {
      await expect(() => {
        return userService.getOrCreateUser('ab'); // Too short
      }).rejects.toThrow();

      await expect(() => {
        return userService.getOrCreateUser('a'.repeat(13)); // Too long
      }).rejects.toThrow();

      await expect(() => {
        return userService.getOrCreateUser('john@doe'); // Invalid characters
      }).rejects.toThrow();
    });

    it('should persist user to database', async () => {
      await userService.getOrCreateUser('test-user');

      const user = await userService.getUser('test-user');

      expect(user).toBeDefined();
      expect(user?.username).toBe('test-user');
    });
  });

  describe('getUser', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return undefined for non-existent user', async () => {
      const user = await userService.getUser('nonexistent-user');

      expect(user).toBeUndefined();
    });

    it('should return user if they exist', async () => {
      await userService.getOrCreateUser('alice');

      const user = await userService.getUser('alice');

      expect(user).toBeDefined();
      expect(user?.username).toBe('alice');
      expect(user?.createdAt).toBeDefined();
    });

    it('should be case-insensitive', async () => {
      await userService.getOrCreateUser('bob');

      const user1 = await userService.getUser('bob');
      const user2 = await userService.getUser('BOB');
      const user3 = await userService.getUser('Bob');

      expect(user1?.username).toBe('bob');
      expect(user2?.username).toBe('bob');
      expect(user3?.username).toBe('bob');
    });
  });

  describe('getAllUsers', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return empty array when no users exist', async () => {
      const users = await userService.getAllUsers();

      expect(users).toEqual([]);
    });

    it('should return all users in creation order', async () => {
      await userService.getOrCreateUser('user1');
      await userService.getOrCreateUser('user2');
      await userService.getOrCreateUser('user3');

      const users = await userService.getAllUsers();

      expect(users).toHaveLength(3);
      expect(users[0].username).toBe('user1');
      expect(users[1].username).toBe('user2');
      expect(users[2].username).toBe('user3');
    });

    it('should not include duplicate users', async () => {
      await userService.getOrCreateUser('user1');
      await userService.getOrCreateUser('user1'); // Same user
      await userService.getOrCreateUser('user2');

      const users = await userService.getAllUsers();

      expect(users).toHaveLength(2);
    });
  });

  describe('userExists', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return false for non-existent user', async () => {
      const exists = await userService.userExists('nonexistent-user');

      expect(exists).toBe(false);
    });

    it('should return true for existing user', async () => {
      await userService.getOrCreateUser('exist-user');

      const exists = await userService.userExists('exist-user');

      expect(exists).toBe(true);
    });

    it('should be case-insensitive', async () => {
      await userService.getOrCreateUser('testuser');

      expect(await userService.userExists('testuser')).toBe(true);
      expect(await userService.userExists('TESTUSER')).toBe(true);
      expect(await userService.userExists('TestUser')).toBe(true);
    });
  });

  describe('deleteUser', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return false for non-existent user', async () => {
      const result = await userService.deleteUser('nonexistent-user');

      expect(result).toBe(false);
    });

    it('should delete user and return true', async () => {
      await userService.getOrCreateUser('delete-me');

      const result = await userService.deleteUser('delete-me');

      expect(result).toBe(true);
      expect(await userService.getUser('delete-me')).toBeUndefined();
    });

    it('should delete all todos belonging to user', async () => {
      const username = 'user-todos';
      const dataSource = testDb.getDataSource();

      // Seed user and todos
      await userService.getOrCreateUser(username);
      await userService.getOrCreateUser('other-user');

      const todo1Id = generateTestUuid();
      const todo2Id = generateTestUuid();
      const todo3Id = generateTestUuid();

      await dataSource.query(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [todo1Id, username, 'Todo 1', 'MEDIUM', 'Description 1', null, new Date().toISOString(), new Date().toISOString()]);
      await dataSource.query(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [todo2Id, username, 'Todo 2', 'HIGH', 'Description 2', null, new Date().toISOString(), new Date().toISOString()]);
      await dataSource.query(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [todo3Id, 'other-user', 'Todo 3', 'LOW', 'Description 3', null, new Date().toISOString(), new Date().toISOString()]);

      // Delete user
      await userService.deleteUser(username);

      // Check that user's todos are deleted but other user's todos remain
      const remainingTodos = await dataSource.query('SELECT * FROM todos');
      expect(remainingTodos).toHaveLength(1);
      expect(remainingTodos[0].username).toBe('other-user');
    });

    it('should be case-insensitive', async () => {
      await userService.getOrCreateUser('delete-user');

      const result = await userService.deleteUser('DELETE-USER');

      expect(result).toBe(true);
      expect(await userService.getUser('delete-user')).toBeUndefined();
    });
  });
});
