/**
 * IdMapService.test.ts
 *
 * Unit tests for IdMapService.
 * Tests the bidirectional mapping between UUIDs and human-readable IDs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IdMapService, EntityType } from '../../src/services/IdMapService.js';

describe('IdMapService', () => {
  let idMapService: IdMapService;

  beforeEach(() => {
    // Create a fresh instance for each test
    idMapService = new IdMapService();
  });

  describe('unregisterMapping', () => {
    it('should remove a mapping', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      idMapService.getHumanReadableId(uuid, EntityType.TODO);

      idMapService.unregisterMapping('task-1', uuid, EntityType.TODO);

      const retrievedUuid = idMapService.getUuid('task-1', EntityType.TODO);
      const retrievedId = idMapService.getHumanReadableId(uuid, EntityType.TODO);

      expect(retrievedUuid).toBeUndefined();
      expect(retrievedId).not.toBe('task-1'); // Should create a new ID
    });
  });

  describe('getHumanReadableId', () => {
    it('should create a new human-readable ID for a new UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const id = idMapService.getHumanReadableId(uuid, EntityType.TODO);

      expect(id).toBe('task-1');
    });

    it('should return existing ID for a UUID that was already mapped', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const firstId = idMapService.getHumanReadableId(uuid, EntityType.TODO);
      const secondId = idMapService.getHumanReadableId(uuid, EntityType.TODO);

      expect(firstId).toBe('task-1');
      expect(secondId).toBe('task-1');
    });

    it('should create sequential IDs for multiple entities', () => {
      const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
      const uuid2 = '660e8400-e29b-41d4-a716-446655440001';
      const uuid3 = '770e8400-e29b-41d4-a716-446655440002';

      const id1 = idMapService.getHumanReadableId(uuid1, EntityType.TODO);
      const id2 = idMapService.getHumanReadableId(uuid2, EntityType.TODO);
      const id3 = idMapService.getHumanReadableId(uuid3, EntityType.TODO);

      expect(id1).toBe('task-1');
      expect(id2).toBe('task-2');
      expect(id3).toBe('task-3');
    });

    it('should handle different entity types separately', () => {
      const todoUuid = '550e8400-e29b-41d4-a716-446655440000';
      const tagUuid = '660e8400-e29b-41d4-a716-446655440001';
      const projectUuid = '770e8400-e29b-41d4-a716-446655440002';

      const todoId = idMapService.getHumanReadableId(todoUuid, EntityType.TODO);
      const tagId = idMapService.getHumanReadableId(tagUuid, EntityType.TAG);
      const projectId = idMapService.getHumanReadableId(projectUuid, EntityType.PROJECT);

      expect(todoId).toBe('task-1');
      expect(tagId).toBe('tag-1');
      expect(projectId).toBe('project-1');
    });
  });

  describe('getUuid', () => {
    it('should return undefined for non-existent human-readable ID', () => {
      const uuid = idMapService.getUuid('task-999', EntityType.TODO);

      expect(uuid).toBeUndefined();
    });

    it('should return the correct UUID for a mapped human-readable ID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      idMapService.getHumanReadableId(uuid, EntityType.TODO);

      const retrievedUuid = idMapService.getUuid('task-1', EntityType.TODO);

      expect(retrievedUuid).toBe(uuid);
    });

    it('should handle different entity types separately', () => {
      const todoUuid = '550e8400-e29b-41d4-a716-446655440000';
      const tagUuid = '660e8400-e29b-41d4-a716-446655440001';

      idMapService.getHumanReadableId(todoUuid, EntityType.TODO);
      idMapService.getHumanReadableId(tagUuid, EntityType.TAG);

      const retrievedTodoUuid = idMapService.getUuid('task-1', EntityType.TODO);
      const retrievedTagUuid = idMapService.getUuid('tag-1', EntityType.TAG);

      expect(retrievedTodoUuid).toBe(todoUuid);
      expect(retrievedTagUuid).toBe(tagUuid);
    });
  });

  describe('registerMapping', () => {
    it('should register a new mapping', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      idMapService.registerMapping('task-42', uuid, EntityType.TODO);

      const retrievedUuid = idMapService.getUuid('task-42', EntityType.TODO);
      const retrievedId = idMapService.getHumanReadableId(uuid, EntityType.TODO);

      expect(retrievedUuid).toBe(uuid);
      expect(retrievedId).toBe('task-42');
    });

    it('should overwrite existing mapping when registering with same human-readable ID', () => {
      const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
      const uuid2 = '660e8400-e29b-41d4-a716-446655440001';

      idMapService.registerMapping('task-1', uuid1, EntityType.TODO);
      idMapService.registerMapping('task-1', uuid2, EntityType.TODO);

      const retrievedUuid = idMapService.getUuid('task-1', EntityType.TODO);

      expect(retrievedUuid).toBe(uuid2);
    });
  });

  describe('unregisterMapping', () => {
    it('should handle unregistering non-existent mapping gracefully', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';

      expect(() => {
        idMapService.unregisterMapping('task-999', uuid, EntityType.TODO);
      }).not.toThrow();
    });
  });

  describe('getNextId', () => {
    it('should return the next expected ID for an entity type', () => {
      const nextId = idMapService.getNextId(EntityType.TODO);

      expect(nextId).toBe('task-1');
    });

    it('should return the next ID after creating mappings', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      idMapService.getHumanReadableId(uuid, EntityType.TODO);

      const nextId = idMapService.getNextId(EntityType.TODO);

      expect(nextId).toBe('task-2');
    });

    it('should handle different entity types separately', () => {
      const todoUuid = '550e8400-e29b-41d4-a716-446655440000';
      const tagUuid = '660e8400-e29b-41d4-a716-446655440001';

      idMapService.getHumanReadableId(todoUuid, EntityType.TODO);
      idMapService.getHumanReadableId(tagUuid, EntityType.TAG);

      const nextTodoId = idMapService.getNextId(EntityType.TODO);
      const nextTagId = idMapService.getNextId(EntityType.TAG);

      expect(nextTodoId).toBe('task-2');
      expect(nextTagId).toBe('tag-2');
    });
  });

  describe('getAllMappings', () => {
    it('should return empty array for new service', () => {
      const todoMappings = idMapService.getAllMappings(EntityType.TODO);

      expect(todoMappings).toEqual([]);
    });

    it('should return all mappings for an entity type', () => {
      const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
      const uuid2 = '660e8400-e29b-41d4-a716-446655440001';

      idMapService.getHumanReadableId(uuid1, EntityType.TODO);
      idMapService.getHumanReadableId(uuid2, EntityType.TODO);

      const mappings = idMapService.getAllMappings(EntityType.TODO);

      expect(mappings).toHaveLength(2);
      expect(mappings[0]).toEqual(['task-1', uuid1]);
      expect(mappings[1]).toEqual(['task-2', uuid2]);
    });

    it('should only return mappings for the specified entity type', () => {
      const todoUuid = '550e8400-e29b-41d4-a716-446655440000';
      const tagUuid = '660e8400-e29b-41d4-a716-446655440001';

      idMapService.getHumanReadableId(todoUuid, EntityType.TODO);
      idMapService.getHumanReadableId(tagUuid, EntityType.TAG);

      const todoMappings = idMapService.getAllMappings(EntityType.TODO);
      const tagMappings = idMapService.getAllMappings(EntityType.TAG);

      expect(todoMappings).toHaveLength(1);
      expect(tagMappings).toHaveLength(1);
      expect(todoMappings[0][0]).toBe('task-1');
      expect(tagMappings[0][0]).toBe('tag-1');
    });
  });
});
