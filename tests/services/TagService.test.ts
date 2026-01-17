/**
 * TagService.test.ts
 *
 * Unit tests for TagService.
 * Tests for tag management operations including CRUD and tag-todo relationships.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TagService } from '../../src/services/TagService.js';
import { IdMapService, EntityType } from '../../src/services/IdMapService.js';
import { TestDatabaseService, seedUser, seedTag, seedTodo, seedTagTodoRelation, generateTestUuid } from '../utils/testDatabase.js';
import { UserService } from '../../src/services/UserService.js';

describe('TagService', () => {
  let testDb: TestDatabaseService;
  let idMapService: IdMapService;
  let tagService: TagService;

  beforeEach(() => {
    // Create fresh instances for each test
    testDb = new TestDatabaseService();
    idMapService = new IdMapService();
    tagService = new TagService(testDb.getDb(), idMapService);
  });

  afterEach(() => {
    // Clean up
    testDb.close();
  });

  describe('createTag', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should create a new tag', () => {
      const tag = tagService.createTag({
        name: 'Important',
        color: '#FF5733',
      });

      expect(tag.id).toBe('tag-1');
      expect(tag.name).toBe('Important');
      expect(tag.color).toBe('#FF5733');
      expect(tag.createdAt).toBeDefined();
      expect(tag.updatedAt).toBeDefined();
    });

    it('should create tag without color', () => {
      const tag = tagService.createTag({
        name: 'Work',
      });

      expect(tag.id).toBe('tag-1');
      expect(tag.name).toBe('Work');
      expect(tag.color).toBeUndefined();
    });

    it('should throw error for duplicate tag name', () => {
      tagService.createTag({ name: 'Duplicate' });

      expect(() => {
        tagService.createTag({ name: 'Duplicate' });
      }).toThrow('Tag with name "Duplicate" already exists');
    });

    it('should be case-insensitive for duplicate detection', () => {
      tagService.createTag({ name: 'Test' });

      expect(() => {
        tagService.createTag({ name: 'test' });
      }).toThrow();
    });

    it('should validate color format', () => {
      expect(() => {
        tagService.createTag({ name: 'Test', color: 'invalid' });
      }).toThrow();

      expect(() => {
        tagService.createTag({ name: 'Test', color: '#ZZZZZZ' });
      }).toThrow();
    });

    it('should accept valid hex color', () => {
      const tag = tagService.createTag({
        name: 'Test',
        color: '#ABCDEF',
      });

      expect(tag.color).toBe('#ABCDEF');
    });
  });

  describe('getTag', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return undefined for non-existent tag', () => {
      const tag = tagService.getTag('tag-999');

      expect(tag).toBeUndefined();
    });

    it('should return tag by human-readable ID', () => {
      const createdTag = tagService.createTag({ name: 'Test Tag' });

      const tag = tagService.getTag(createdTag.id);

      expect(tag).toBeDefined();
      expect(tag?.id).toBe('tag-1');
      expect(tag?.name).toBe('Test Tag');
    });

    it('should return tag by UUID', () => {
      const createdTag = tagService.createTag({ name: 'UUID Test' });
      const db = testDb.getDb();
      const row = db.prepare('SELECT id FROM tags WHERE name = ?').get('UUID Test') as any;
      const uuid = row.id;

      const tag = tagService.getTag(uuid);

      expect(tag).toBeDefined();
      expect(tag?.name).toBe('UUID Test');
    });
  });

  describe('getTagByName', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return undefined for non-existent tag', () => {
      const tag = tagService.getTagByName('nonexistent');

      expect(tag).toBeUndefined();
    });

    it('should return tag by name', () => {
      tagService.createTag({ name: 'Find Me' });

      const tag = tagService.getTagByName('Find Me');

      expect(tag).toBeDefined();
      expect(tag?.name).toBe('Find Me');
    });

    it('should be case-insensitive', () => {
      tagService.createTag({ name: 'CaseTest' });

      const tag1 = tagService.getTagByName('CaseTest');
      const tag2 = tagService.getTagByName('CASETEST');
      const tag3 = tagService.getTagByName('casetest');

      expect(tag1?.name).toBe('CaseTest');
      expect(tag2?.name).toBe('CaseTest');
      expect(tag3?.name).toBe('CaseTest');
    });
  });

  describe('getAllTags', () => {
    beforeEach(() => {
      testDb.clearAll();
    });
 
    it('should return empty array when no tags exist', () => {
      const tags = tagService.getAllTags();
 
      expect(tags).toEqual([]);
    });
 
    it('should return all tags ordered by name', () => {
      tagService.createTag({ name: 'Zebra' });
      tagService.createTag({ name: 'Apple' });
      tagService.createTag({ name: 'Banana' });
 
      const tags = tagService.getAllTags();
 
      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe('Apple');
      expect(tags[1].name).toBe('Banana');
      expect(tags[2].name).toBe('Zebra');
    });

    it('should respect limit parameter', () => {
      tagService.createTag({ name: 'Tag 1' });
      tagService.createTag({ name: 'Tag 2' });
      tagService.createTag({ name: 'Tag 3' });
      tagService.createTag({ name: 'Tag 4' });
      tagService.createTag({ name: 'Tag 5' });
 
      const tags = tagService.getAllTags(2);
 
      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('Tag 1');
      expect(tags[1].name).toBe('Tag 2');
    });

    it('should respect offset parameter', () => {
      tagService.createTag({ name: 'Tag 1' });
      tagService.createTag({ name: 'Tag 2' });
      tagService.createTag({ name: 'Tag 3' });
      tagService.createTag({ name: 'Tag 4' });
      tagService.createTag({ name: 'Tag 5' });
 
      const tags = tagService.getAllTags(undefined, 2);
 
      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe('Tag 3');
      expect(tags[1].name).toBe('Tag 4');
      expect(tags[2].name).toBe('Tag 5');
    });

    it('should respect both limit and offset parameters', () => {
      tagService.createTag({ name: 'Tag 1' });
      tagService.createTag({ name: 'Tag 2' });
      tagService.createTag({ name: 'Tag 3' });
      tagService.createTag({ name: 'Tag 4' });
      tagService.createTag({ name: 'Tag 5' });
 
      const tags = tagService.getAllTags(2, 1);
 
      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('Tag 2');
      expect(tags[1].name).toBe('Tag 3');
    });
  });

  describe('getTags', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return empty array for empty input', () => {
      const tags = tagService.getTags([]);

      expect(tags).toEqual([]);
    });

    it('should return tags for valid IDs', () => {
      const tag1 = tagService.createTag({ name: 'Tag 1' });
      const tag2 = tagService.createTag({ name: 'Tag 2' });

      const tags = tagService.getTags([tag1.id, tag2.id]);

      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('Tag 1');
      expect(tags[1].name).toBe('Tag 2');
    });

    it('should skip non-existent IDs', () => {
      const tag1 = tagService.createTag({ name: 'Tag 1' });

      const tags = tagService.getTags([tag1.id, 'tag-999']);

      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('Tag 1');
    });
  });

  describe('updateTag', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return undefined for non-existent tag', () => {
      const result = tagService.updateTag({
        id: 'tag-999',
        name: 'Updated',
      });

      expect(result).toBeUndefined();
    });

    it('should update tag name', () => {
      const tag = tagService.createTag({ name: 'Original' });

      const updated = tagService.updateTag({
        id: tag.id,
        name: 'Updated',
      });

      expect(updated?.name).toBe('Updated');
      expect(tagService.getTag(tag.id)?.name).toBe('Updated');
    });

    it('should update tag color', () => {
      const tag = tagService.createTag({ name: 'Test', color: '#FF0000' });

      const updated = tagService.updateTag({
        id: tag.id,
        color: '#00FF00',
      });

      expect(updated?.color).toBe('#00FF00');
    });

    it('should throw error for duplicate name', () => {
      const tag1 = tagService.createTag({ name: 'Tag 1' });
      const tag2 = tagService.createTag({ name: 'Tag 2' });

      expect(() => {
        tagService.updateTag({
          id: tag2.id,
          name: 'Tag 1',
        });
      }).toThrow('Tag with name "Tag 1" already exists');
    });
  });

  describe('deleteTag', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return false for non-existent tag', () => {
      const result = tagService.deleteTag('tag-999');

      expect(result).toBe(false);
    });

    it('should delete tag and return true', () => {
      const tag = tagService.createTag({ name: 'Delete Me' });

      const result = tagService.deleteTag(tag.id);

      expect(result).toBe(true);
      expect(tagService.getTag(tag.id)).toBeUndefined();
    });

    it('should remove tag-todo relationships', () => {
      const db = testDb.getDb();
      const username = 'test-user';

      // Create user first
      const userService = new UserService(db);
      userService.getOrCreateUser(username);

      // Create tag and todo
      const tag = tagService.createTag({ name: 'Test Tag' });
      const todoId = generateTestUuid();
      seedTodo(db, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      // Add tag to todo
      tagService.addTagToTodo(todoHumanId, tag.id);

      // Delete tag
      tagService.deleteTag(tag.id);

      // Check relationship is removed
      const relationships = db.prepare('SELECT * FROM todo_tags').all() as any[];
      expect(relationships).toHaveLength(0);
    });
  });

  describe('searchTags', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return empty array for no matches', () => {
      tagService.createTag({ name: 'Test' });

      const results = tagService.searchTags('nonexistent');

      expect(results).toEqual([]);
    });

    it('should perform case-insensitive partial match', () => {
      tagService.createTag({ name: 'Important' });
      tagService.createTag({ name: 'Portfolio' });
      tagService.createTag({ name: 'Personal Stuff' });

      const results = tagService.searchTags('port');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Important');
      expect(results[1].name).toBe('Portfolio');
    });

    it('should return all tags for empty search', () => {
      tagService.createTag({ name: 'Tag 1' });
      tagService.createTag({ name: 'Tag 2' });

      const results = tagService.searchTags('');

      expect(results).toHaveLength(2);
    });
  });

  describe('addTagToTodo', () => {
    let userService: UserService;

    beforeEach(() => {
      testDb.clearAll();
      userService = new UserService(testDb.getDb());
    });

    it('should add tag to todo', () => {
      const db = testDb.getDb();
      const username = 'test-user';
      userService.getOrCreateUser(username);

      const tag = tagService.createTag({ name: 'Test Tag' });
      const todoId = generateTestUuid();
      seedTodo(db, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      const result = tagService.addTagToTodo(todoHumanId, tag.id);

      expect(result).toBe(true);

      const tags = tagService.getTagsForTodo(todoHumanId);
      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('Test Tag');
    });

    it('should return false if relationship already exists', () => {
      const db = testDb.getDb();
      const username = 'test-user';
      userService.getOrCreateUser(username);

      const tag = tagService.createTag({ name: 'Test Tag' });
      const todoId = generateTestUuid();
      seedTodo(db, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      tagService.addTagToTodo(todoHumanId, tag.id);
      const result = tagService.addTagToTodo(todoHumanId, tag.id);

      expect(result).toBe(false);
    });

    it('should throw error for non-existent todo', () => {
      const tag = tagService.createTag({ name: 'Test Tag' });

      expect(() => {
        tagService.addTagToTodo('task-999', tag.id);
      }).toThrow('Todo with ID task-999 not found');
    });

    it('should throw error for non-existent tag', () => {
      const db = testDb.getDb();
      const username = 'test-user';
      userService.getOrCreateUser(username);

      const todoId = generateTestUuid();
      seedTodo(db, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      expect(() => {
        tagService.addTagToTodo(todoId, 'tag-999');
      }).toThrow('Tag with ID tag-999 not found');
    });

    it('should enforce maximum of 4 tags per todo', () => {
      const db = testDb.getDb();
      const username = 'test-user';
      userService.getOrCreateUser(username);

      const todoId = generateTestUuid();
      seedTodo(db, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      // Add 4 tags
      const tag1 = tagService.createTag({ name: 'Tag 1' });
      const tag2 = tagService.createTag({ name: 'Tag 2' });
      const tag3 = tagService.createTag({ name: 'Tag 3' });
      const tag4 = tagService.createTag({ name: 'Tag 4' });

      tagService.addTagToTodo(todoHumanId, tag1.id);
      tagService.addTagToTodo(todoHumanId, tag2.id);
      tagService.addTagToTodo(todoHumanId, tag3.id);
      tagService.addTagToTodo(todoHumanId, tag4.id);

      // Try to add 5th tag
      const tag5 = tagService.createTag({ name: 'Tag 5' });

      expect(() => {
        tagService.addTagToTodo(todoHumanId, tag5.id);
      }).toThrow('Maximum of 4 tags allowed per todo');
    });
  });

  describe('removeTagFromTodo', () => {
    let userService: UserService;

    beforeEach(() => {
      testDb.clearAll();
      userService = new UserService(testDb.getDb());
    });

    it('should remove tag from todo', () => {
      const db = testDb.getDb();
      const username = 'test-user';
      userService.getOrCreateUser(username);

      const tag = tagService.createTag({ name: 'Test Tag' });
      const todoId = generateTestUuid();
      seedTodo(db, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      tagService.addTagToTodo(todoHumanId, tag.id);
      const result = tagService.removeTagFromTodo(todoHumanId, tag.id);

      expect(result).toBe(true);

      const tags = tagService.getTagsForTodo(todoId);
      expect(tags).toHaveLength(0);
    });

    it('should return false if relationship does not exist', () => {
      const tag = tagService.createTag({ name: 'Test Tag' });

      const result = tagService.removeTagFromTodo('task-1', tag.id);

      expect(result).toBe(false);
    });

    it('should return false for non-existent todo', () => {
      const tag = tagService.createTag({ name: 'Test Tag' });

      const result = tagService.removeTagFromTodo('task-999', tag.id);
      expect(result).toBe(false);
    });
  });

  describe('getTagsForTodo', () => {
    let userService: UserService;

    beforeEach(() => {
      testDb.clearAll();
      userService = new UserService(testDb.getDb());
    });

    it('should return empty array for todo with no tags', () => {
      const db = testDb.getDb();
      const username = 'test-user';
      userService.getOrCreateUser(username);

      const todoId = generateTestUuid();
      seedTodo(db, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      const tags = tagService.getTagsForTodo(todoId);

      expect(tags).toEqual([]);
    });

    it('should return all tags for todo ordered by name', () => {
      const db = testDb.getDb();
      const username = 'test-user';
      userService.getOrCreateUser(username);

      const todoId = generateTestUuid();
      seedTodo(db, {
        id: todoId,
        username,
        title: 'Test Todo',
        priority: 'MEDIUM',
        description: 'Description',
      });

      // Register the UUID with IdMapService so it can be found
      const todoHumanId = idMapService.getHumanReadableId(todoId, EntityType.TODO);

      const tag1 = tagService.createTag({ name: 'Zebra' });
      const tag2 = tagService.createTag({ name: 'Apple' });
      const tag3 = tagService.createTag({ name: 'Banana' });

      tagService.addTagToTodo(todoHumanId, tag1.id);
      tagService.addTagToTodo(todoHumanId, tag2.id);
      tagService.addTagToTodo(todoHumanId, tag3.id);

      const tags = tagService.getTagsForTodo(todoHumanId);

      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe('Apple');
      expect(tags[1].name).toBe('Banana');
      expect(tags[2].name).toBe('Zebra');
    });
  });

  describe('getTodosWithTag', () => {
    let userService: UserService;

    beforeEach(() => {
      testDb.clearAll();
      userService = new UserService(testDb.getDb());
    });

    it('should return empty array for tag with no todos', () => {
      const tag = tagService.createTag({ name: 'Test Tag' });

      const todos = tagService.getTodosWithTag(tag.id);

      expect(todos).toEqual([]);
    });

    it('should return all todos with tag', () => {
      const db = testDb.getDb();
      const username = 'test-user';
      userService.getOrCreateUser(username);

      const tag = tagService.createTag({ name: 'Test Tag' });
      const todoId1 = generateTestUuid();
      const todoId2 = generateTestUuid();

      seedTodo(db, {
        id: todoId1,
        username,
        title: 'Todo 1',
        priority: 'MEDIUM',
        description: 'Description 1',
      });
      seedTodo(db, {
        id: todoId2,
        username,
        title: 'Todo 2',
        priority: 'HIGH',
        description: 'Description 2',
      });

      // Register the UUIDs with IdMapService so they can be found
      const todoHumanId1 = idMapService.getHumanReadableId(todoId1, EntityType.TODO);
      const todoHumanId2 = idMapService.getHumanReadableId(todoId2, EntityType.TODO);

      tagService.addTagToTodo(todoHumanId1, tag.id);
      tagService.addTagToTodo(todoHumanId2, tag.id);

      const todos = tagService.getTodosWithTag(tag.id);

      expect(todos).toHaveLength(2);
      expect(todos).toContain(todoId1);
      expect(todos).toContain(todoId2);
    });

    it('should return empty array for non-existent tag', () => {
      const todos = tagService.getTodosWithTag('tag-999');

      expect(todos).toEqual([]);
    });
  });

  describe('getTagNames', () => {
    beforeEach(() => {
      testDb.clearAll();
    });

    it('should return empty array for empty input', () => {
      const names = tagService.getTagNames([]);

      expect(names).toEqual([]);
    });

    it('should return tag names for given IDs', () => {
      const tag1 = tagService.createTag({ name: 'Tag 1' });
      const tag2 = tagService.createTag({ name: 'Tag 2' });
      const tag3 = tagService.createTag({ name: 'Tag 3' });

      const names = tagService.getTagNames([tag1.id, tag2.id, tag3.id]);

      expect(names).toEqual(['Tag 1', 'Tag 2', 'Tag 3']);
    });

    it('should skip non-existent IDs', () => {
      const tag1 = tagService.createTag({ name: 'Tag 1' });

      const names = tagService.getTagNames([tag1.id, 'tag-999']);

      expect(names).toEqual(['Tag 1']);
    });
  });
});
