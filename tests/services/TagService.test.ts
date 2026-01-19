/**
 * TagService.test.ts
 *
 * Unit tests for TagService.
 * Tests for tag management operations including CRUD and tag-todo relationships.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TagService } from '../../src/services/TagService.js';
import { IdMapService, EntityType } from '../../src/services/IdMapService.js';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { TestDatabaseService, seedTodo, generateTestUuid } from '../utils/testDatabase.js';
import { UserService } from '../../src/services/UserService.js';

describe('TagService', () => {
  let testDb: TestDatabaseService;
  let idMapService: IdMapService;
  let tagService: TagService;

  beforeEach(async () => {
    // Create fresh instances for each test
    testDb = new TestDatabaseService();
    await testDb.initialize();
    idMapService = new IdMapService();
    // Create a DatabaseService instance with test DataSource
    const testDbService = new DatabaseService(testDb.getDataSource());
    tagService = new TagService(idMapService, testDbService);
  });

  afterEach(async () => {
    // Clean up
    await testDb.close();
  });

  describe('createTag', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should create a new tag', async () => {
      const tag = await tagService.createTag({
        name: 'Important',
        color: '#FF5733',
      });

      expect(tag.id).toBe('tag-1');
      expect(tag.name).toBe('Important');
      expect(tag.color).toBe('#FF5733');
      expect(tag.createdAt).toBeDefined();
      expect(tag.updatedAt).toBeDefined();
    });

    it('should create tag without color', async () => {
      const tag = await tagService.createTag({
        name: 'Work',
      });

      expect(tag.id).toBe('tag-1');
      expect(tag.name).toBe('Work');
      expect(tag.color).toBeUndefined();
    });

    it('should throw error for duplicate tag name', async () => {
      await tagService.createTag({ name: 'Duplicate' });

      await expect(() => {
        return tagService.createTag({ name: 'Duplicate' });
      }).rejects.toThrow('Tag with name "Duplicate" already exists');
    });

    it('should be case-sensitive for duplicate detection', async () => {
      await tagService.createTag({ name: 'Test' });

      await expect(() => {
        return tagService.createTag({ name: 'Test' });
      }).rejects.toThrow();

      // Different case should be allowed (case-sensitive behavior)
      const tag = await tagService.createTag({ name: 'test' });
      expect(tag.name).toBe('test');
    });

    it('should validate color format', async () => {
      await expect(() => {
        return tagService.createTag({ name: 'Test', color: 'invalid' });
      }).rejects.toThrow();

      await expect(() => {
        return tagService.createTag({ name: 'Test', color: '#ZZZZZZ' });
      }).rejects.toThrow();
    });

    it('should accept valid hex color', async () => {
      const tag = await tagService.createTag({
        name: 'Test',
        color: '#ABCDEF',
      });

      expect(tag.color).toBe('#ABCDEF');
    });
  });

  describe('getTag', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return undefined for non-existent tag', async () => {
      const tag = await tagService.getTag('tag-999');

      expect(tag).toBeUndefined();
    });

    it('should return tag by human-readable ID', async () => {
      const createdTag = await tagService.createTag({ name: 'Test Tag' });

      const tag = await tagService.getTag(createdTag.id);

      expect(tag).toBeDefined();
      expect(tag?.id).toBe('tag-1');
      expect(tag?.name).toBe('Test Tag');
    });

    it('should return tag by UUID', async () => {
      await tagService.createTag({ name: 'UUID Test' });
      const dataSource = testDb.getDataSource();
      const row = await dataSource.query('SELECT id FROM tags WHERE name = ?', ['UUID Test']);
      const uuid = row[0].id;

      const tag = await tagService.getTag(uuid);

      expect(tag).toBeDefined();
      expect(tag?.name).toBe('UUID Test');
    });
  });

  describe('getTagByName', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return undefined for non-existent tag', async () => {
      const tag = await tagService.getTagByName('nonexistent');

      expect(tag).toBeUndefined();
    });

    it('should return tag by name', async () => {
      await tagService.createTag({ name: 'Find Me' });

      const tag = await tagService.getTagByName('Find Me');

      expect(tag).toBeDefined();
      expect(tag?.name).toBe('Find Me');
    });

    it('should be case-sensitive for getTagByName', async () => {
      await tagService.createTag({ name: 'CaseTest' });

      const tag1 = await tagService.getTagByName('CaseTest');
      const tag2 = await tagService.getTagByName('CASETEST');
      const tag3 = await tagService.getTagByName('casetest');

      // Only exact match should work (case-sensitive behavior)
      expect(tag1?.name).toBe('CaseTest');
      expect(tag2).toBeUndefined();
      expect(tag3).toBeUndefined();
    });
  });

  describe('getAllTags', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return empty array when no tags exist', async () => {
      const tags = await tagService.getAllTags();

      expect(tags).toEqual([]);
    });

    it('should return all tags ordered by name', async () => {
      await tagService.createTag({ name: 'Zebra' });
      await tagService.createTag({ name: 'Apple' });
      await tagService.createTag({ name: 'Banana' });

      const tags = await tagService.getAllTags();

      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe('Apple');
      expect(tags[1].name).toBe('Banana');
      expect(tags[2].name).toBe('Zebra');
    });

    it('should respect limit parameter', async () => {
      await tagService.createTag({ name: 'Tag 1' });
      await tagService.createTag({ name: 'Tag 2' });
      await tagService.createTag({ name: 'Tag 3' });
      await tagService.createTag({ name: 'Tag 4' });
      await tagService.createTag({ name: 'Tag 5' });

      const tags = await tagService.getAllTags(2);

      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('Tag 1');
      expect(tags[1].name).toBe('Tag 2');
    });

    it('should respect offset parameter', async () => {
      await tagService.createTag({ name: 'Tag 1' });
      await tagService.createTag({ name: 'Tag 2' });
      await tagService.createTag({ name: 'Tag 3' });
      await tagService.createTag({ name: 'Tag 4' });
      await tagService.createTag({ name: 'Tag 5' });

      const tags = await tagService.getAllTags(undefined, 2);

      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe('Tag 3');
      expect(tags[1].name).toBe('Tag 4');
      expect(tags[2].name).toBe('Tag 5');
    });

    it('should respect both limit and offset parameters', async () => {
      await tagService.createTag({ name: 'Tag 1' });
      await tagService.createTag({ name: 'Tag 2' });
      await tagService.createTag({ name: 'Tag 3' });
      await tagService.createTag({ name: 'Tag 4' });
      await tagService.createTag({ name: 'Tag 5' });

      const tags = await tagService.getAllTags(2, 1);

      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('Tag 2');
      expect(tags[1].name).toBe('Tag 3');
    });
  });

  describe('getTags', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return empty array for empty input', async () => {
      const tags = await tagService.getTags([]);

      expect(tags).toEqual([]);
    });

    it('should return tags for valid IDs', async () => {
      const tag1 = await tagService.createTag({ name: 'Tag 1' });
      const tag2 = await tagService.createTag({ name: 'Tag 2' });

      const tags = await tagService.getTags([tag1.id, tag2.id]);

      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('Tag 1');
      expect(tags[1].name).toBe('Tag 2');
    });

    it('should skip non-existent IDs', async () => {
      const tag1 = await tagService.createTag({ name: 'Tag 1' });

      const tags = await tagService.getTags([tag1.id, 'tag-999']);

      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('Tag 1');
    });
  });

  describe('updateTag', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return undefined for non-existent tag', async () => {
      const result = await tagService.updateTag({
        id: 'tag-999',
        name: 'Updated',
      });

      expect(result).toBeUndefined();
    });

    it('should update tag name', async () => {
      const tag = await tagService.createTag({ name: 'Original' });

      const updated = await tagService.updateTag({
        id: tag.id,
        name: 'Updated',
      });

      expect(updated?.name).toBe('Updated');
      expect((await tagService.getTag(tag.id))?.name).toBe('Updated');
    });

    it('should update tag color', async () => {
      const tag = await tagService.createTag({ name: 'Test', color: '#FF0000' });

      const updated = await tagService.updateTag({
        id: tag.id,
        color: '#00FF00',
      });

      expect(updated?.color).toBe('#00FF00');
    });

    it('should throw error for duplicate name', async () => {
      await tagService.createTag({ name: 'Tag 1' });
      const tag2 = await tagService.createTag({ name: 'Tag 2' });

      await expect(() => {
        return tagService.updateTag({
          id: tag2.id,
          name: 'Tag 1',
        });
      }).rejects.toThrow('Tag with name "Tag 1" already exists');
    });
  });

  describe('deleteTag', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return false for non-existent tag', async () => {
      const result = await tagService.deleteTag('tag-999');

      expect(result).toBe(false);
    });

    it('should delete tag and return true', async () => {
      const tag = await tagService.createTag({ name: 'Delete Me' });

      const result = await tagService.deleteTag(tag.id);

      expect(result).toBe(true);
      expect(await tagService.getTag(tag.id)).toBeUndefined();
    });

    it('should remove tag-todo relationships', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';

      // Create user first
      const testDbService = new DatabaseService(testDb.getDataSource());
      const userService = new UserService(testDbService);
      await userService.getOrCreateUser(username);

      // Create tag and todo
      const tag = await tagService.createTag({ name: 'Test Tag' });
      const todoId = generateTestUuid();
      await seedTodo(dataSource, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      // Add tag to todo
      await tagService.addTagToTodo(todoHumanId, tag.id);

      // Delete tag
      await tagService.deleteTag(tag.id);

      // Check relationship is removed
      const relationships = await dataSource.query('SELECT * FROM todo_tags');
      expect(relationships).toHaveLength(0);
    });
  });

  describe('searchTags', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return empty array for no matches', async () => {
      await tagService.createTag({ name: 'Test' });

      const results = await tagService.searchTags('nonexistent');

      expect(results).toEqual([]);
    });

    it('should perform case-insensitive partial match', async () => {
      await tagService.createTag({ name: 'Important' });
      await tagService.createTag({ name: 'Portfolio' });
      await tagService.createTag({ name: 'Personal Stuff' });

      const results = await tagService.searchTags('port');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Important');
      expect(results[1].name).toBe('Portfolio');
    });

    it('should return all tags for empty search', async () => {
      await tagService.createTag({ name: 'Tag 1' });
      await tagService.createTag({ name: 'Tag 2' });

      const results = await tagService.searchTags('');

      expect(results).toHaveLength(2);
    });
  });

  describe('addTagToTodo', () => {
    let userService: UserService;

    beforeEach(async () => {
      await testDb.clearAll();
      // Create a DatabaseService instance with test DataSource
      const testDbService = new DatabaseService(testDb.getDataSource());
      userService = new UserService(testDbService);
      // Recreate tagService with the test DatabaseService
      tagService = new TagService(idMapService, testDbService);
    });

    it('should add tag to todo', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';
      await userService.getOrCreateUser(username);

      const tag = await tagService.createTag({ name: 'Test Tag' });
      const todoId = generateTestUuid();
      await seedTodo(dataSource, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      const result = await tagService.addTagToTodo(todoHumanId, tag.id);

      expect(result).toBe(true);

      const tags = await tagService.getTagsForTodo(todoHumanId);
      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('Test Tag');
    });

    it('should return false if relationship already exists', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';
      await userService.getOrCreateUser(username);

      const tag = await tagService.createTag({ name: 'Test Tag' });
      const todoId = generateTestUuid();
      await seedTodo(dataSource, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      await tagService.addTagToTodo(todoHumanId, tag.id);
      const result = await tagService.addTagToTodo(todoHumanId, tag.id);

      expect(result).toBe(false);
    });

    it('should throw error for non-existent todo', async () => {
      const tag = await tagService.createTag({ name: 'Test Tag' });

      await expect(() => {
        return tagService.addTagToTodo('task-999', tag.id);
      }).rejects.toThrow('Todo with ID task-999 not found');
    });

    it('should throw error for non-existent tag', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';
      await userService.getOrCreateUser(username);

      const todoId = generateTestUuid();
      await seedTodo(dataSource, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      await expect(() => {
        return tagService.addTagToTodo(todoId, 'tag-999');
      }).rejects.toThrow('Tag with ID tag-999 not found');
    });

    it('should enforce maximum of 4 tags per todo', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';
      await userService.getOrCreateUser(username);

      const todoId = generateTestUuid();
      await seedTodo(dataSource, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      // Add 4 tags
      const tag1 = await tagService.createTag({ name: 'Tag 1' });
      const tag2 = await tagService.createTag({ name: 'Tag 2' });
      const tag3 = await tagService.createTag({ name: 'Tag 3' });
      const tag4 = await tagService.createTag({ name: 'Tag 4' });

      await tagService.addTagToTodo(todoHumanId, tag1.id);
      await tagService.addTagToTodo(todoHumanId, tag2.id);
      await tagService.addTagToTodo(todoHumanId, tag3.id);
      await tagService.addTagToTodo(todoHumanId, tag4.id);

      // Try to add 5th tag
      const tag5 = await tagService.createTag({ name: 'Tag 5' });

      await expect(() => {
        return tagService.addTagToTodo(todoHumanId, tag5.id);
      }).rejects.toThrow('Maximum of 4 tags allowed per todo');
    });
  });

  describe('removeTagFromTodo', () => {
    let userService: UserService;

    beforeEach(async () => {
      await testDb.clearAll();
      // Create a DatabaseService instance with test DataSource
      const testDbService = new DatabaseService(testDb.getDataSource());
      userService = new UserService(testDbService);
      // Recreate tagService with the test DatabaseService
      tagService = new TagService(idMapService, testDbService);
    });

    it('should remove tag from todo', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';
      await userService.getOrCreateUser(username);

      const tag = await tagService.createTag({ name: 'Test Tag' });
      const todoId = generateTestUuid();
      await seedTodo(dataSource, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      await tagService.addTagToTodo(todoHumanId, tag.id);
      const result = await tagService.removeTagFromTodo(todoHumanId, tag.id);

      expect(result).toBe(true);

      const tags = await tagService.getTagsForTodo(todoId);
      expect(tags).toHaveLength(0);
    });

    it('should return false if relationship does not exist', async () => {
      const tag = await tagService.createTag({ name: 'Test Tag' });

      const result = await tagService.removeTagFromTodo('task-1', tag.id);

      expect(result).toBe(false);
    });

    it('should return false for non-existent todo', async () => {
      const tag = await tagService.createTag({ name: 'Test Tag' });

      const result = await tagService.removeTagFromTodo('task-999', tag.id);

      expect(result).toBe(false);
    });
  });

  describe('getTagsForTodo', () => {
    let userService: UserService;

    beforeEach(async () => {
      await testDb.clearAll();
      // Create a DatabaseService instance with test DataSource
      const testDbService = new DatabaseService(testDb.getDataSource());
      userService = new UserService(testDbService);
      // Recreate tagService with the test DatabaseService
      tagService = new TagService(idMapService, testDbService);
    });

    it('should return empty array for todo with no tags', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';
      await userService.getOrCreateUser(username);

      const todoId = generateTestUuid();
      await seedTodo(dataSource, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      const tags = await tagService.getTagsForTodo(todoId);

      expect(tags).toEqual([]);
    });

    it('should return all tags for todo ordered by name', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';
      await userService.getOrCreateUser(username);

      const todoId = generateTestUuid();
      await seedTodo(dataSource, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      const tag1 = await tagService.createTag({ name: 'Zebra' });
      const tag2 = await tagService.createTag({ name: 'Apple' });
      const tag3 = await tagService.createTag({ name: 'Banana' });

      await tagService.addTagToTodo(todoHumanId, tag1.id);
      await tagService.addTagToTodo(todoHumanId, tag2.id);
      await tagService.addTagToTodo(todoHumanId, tag3.id);

      const tags = await tagService.getTagsForTodo(todoHumanId);

      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe('Apple');
      expect(tags[1].name).toBe('Banana');
      expect(tags[2].name).toBe('Zebra');
    });
  });

  describe('getTodosWithTag', () => {
    let userService: UserService;

    beforeEach(async () => {
      await testDb.clearAll();
      // Create a DatabaseService instance with test DataSource
      const testDbService = new DatabaseService(testDb.getDataSource());
      userService = new UserService(testDbService);
      // Recreate tagService with the test DatabaseService
      tagService = new TagService(idMapService, testDbService);
    });

    it('should return empty array for tag with no todos', async () => {
      const tag = await tagService.createTag({ name: 'Test Tag' });

      const todos = await tagService.getTodosWithTag(tag.id);

      expect(todos).toEqual([]);
    });

    it('should return all todos with tag', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';
      await userService.getOrCreateUser(username);

      const tag = await tagService.createTag({ name: 'Test Tag' });
      const todoId1 = generateTestUuid();
      const todoId2 = generateTestUuid();

      await seedTodo(dataSource, {
        id: todoId1,
        username,
        title: 'Todo 1',
        priority: 'MEDIUM',
        description: 'Description 1',
      });
      await seedTodo(dataSource, {
        id: todoId2,
        username,
        title: 'Todo 2',
        priority: 'HIGH',
        description: 'Description 2',
      });

      // Register the UUIDs with IdMapService so they can be found
      const todoHumanId1 = idMapService.getHumanReadableId(todoId1, EntityType.TODO);
      const todoHumanId2 = idMapService.getHumanReadableId(todoId2, EntityType.TODO);

      await tagService.addTagToTodo(todoHumanId1, tag.id);
      await tagService.addTagToTodo(todoHumanId2, tag.id);

      const todos = await tagService.getTodosWithTag(tag.id);

      expect(todos).toHaveLength(2);
      expect(todos).toContain(todoId1);
      expect(todos).toContain(todoId2);
    });

    it('should return empty array for non-existent tag', async () => {
      const todos = await tagService.getTodosWithTag('tag-999');

      expect(todos).toEqual([]);
    });
  });

  describe('getTagNames', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return empty array for empty input', async () => {
      const names = await tagService.getTagNames([]);

      expect(names).toEqual([]);
    });

    it('should return tag names for given IDs', async () => {
      const tag1 = await tagService.createTag({ name: 'Tag 1' });
      const tag2 = await tagService.createTag({ name: 'Tag 2' });
      const tag3 = await tagService.createTag({ name: 'Tag 3' });

      const names = await tagService.getTagNames([tag1.id, tag2.id, tag3.id]);

      expect(names).toEqual(['Tag 1', 'Tag 2', 'Tag 3']);
    });

    it('should skip non-existent IDs', async () => {
      const tag1 = await tagService.createTag({ name: 'Tag 1' });

      const names = await tagService.getTagNames([tag1.id, 'tag-999']);

      expect(names).toEqual(['Tag 1']);
    });
  });
});
