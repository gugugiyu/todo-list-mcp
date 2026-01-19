/**
 * TagService.ts
 *
 * This service implements the core business logic for managing tags using TypeORM.
 * It acts as an intermediary between the data model and the database,
 * handling all CRUD operations for tags and managing tag-todo relationships.
 */
import { Tag, createTag, CreateTagSchema, UpdateTagSchema } from '../models/Tag.js';
import { z } from 'zod';
import { DatabaseService, databaseService } from './DatabaseService.js';
import { IdMapService, EntityType, idMapService } from './IdMapService.js';
import { Like, In } from 'typeorm';

/**
 * TagService Class
 *
 * This service follows the repository pattern to provide a clean
 * interface for working with tags. It encapsulates all database
 * operations and business logic in one place.
 */
class TagService {
  private idMap: IdMapService;
  private dbService: DatabaseService;

  constructor(idMap?: IdMapService, dbService?: DatabaseService) {
    // Allow dependency injection for testing
    this.idMap = idMap || idMapService;
    this.dbService = dbService || databaseService;
  }

  /**
   * Get the IdMapService instance
   * Useful for testing to verify ID mappings
   */
  getIdMap(): IdMapService {
    return this.idMap;
  }

  /**
   * Create a new tag
   *
   * This method:
   * 1. Uses the factory function to create a new Tag object
   * 2. Persists it to the database
   * 3. Registers the ID mapping
   * 4. Returns the created Tag
   *
   * @param data Validated input data (name and optional color)
   * @returns The newly created Tag
   * @throws Error if tag name already exists
   */
  async createTag(data: z.infer<typeof CreateTagSchema>): Promise<Tag> {
    // Validate input data
    const validatedData = CreateTagSchema.parse(data);

    // Check if a tag with the same name already exists (case-insensitive)
    const existingTag = await this.getTagByName(validatedData.name);
    if (existingTag) {
      throw new Error(`Tag with name "${validatedData.name}" already exists`);
    }

    // Use the factory function to create a Tag with proper defaults
    const tag = createTag(validatedData);

    const tagRepo = this.dbService.getTagRepository();

    const newTag = tagRepo.create({
      id: tag.id,
      name: tag.name,
      color: tag.color || null,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    });

    await tagRepo.save(newTag);

    // Register the human-readable ID mapping
    const humanReadableId = this.idMap.getHumanReadableId(tag.id, EntityType.TAG);

    // Update the tag's id to use the human-readable version
    tag.id = humanReadableId;

    // Return the created tag
    return tag;
  }

  /**
   * Get a tag by ID
   *
   * This method:
   * 1. Queries the database for a tag with the given ID (can be UUID or human-readable tag-*)
   * 2. Converts the database row to a Tag object if found
   *
   * @param id The tag ID (UUID or human-readable tag-*)
   * @returns The Tag if found, undefined otherwise
   */
  async getTag(id: string): Promise<Tag | undefined> {
    const tagRepo = this.dbService.getTagRepository();

    // Check if this is a human-readable ID, if so convert to UUID
    let uuid = id;
    if (id.startsWith('tag-')) {
      const resolvedUuid = this.idMap.getUuid(id, EntityType.TAG);
      if (!resolvedUuid) return undefined;
      uuid = resolvedUuid;
    }

    const tag = await tagRepo.findOne({ where: { id: uuid } });

    if (!tag) return undefined;

    // Convert the database row to a Tag object
    return this.entityToTag(tag);
  }

  /**
   * Get a tag by name
   *
   * @param name The name of the tag to retrieve
   * @returns The Tag if found, undefined otherwise
   */
  async getTagByName(name: string): Promise<Tag | undefined> {
    const tagRepo = this.dbService.getTagRepository();
    const tag = await tagRepo.findOne({
      where: { name: name },
    });

    if (!tag) return undefined;
    return this.entityToTag(tag);
  }

  /**
   * Get all tags
   *
   * This method returns all tags in the database with optional pagination.
   *
   * @param limit Maximum number of tags to return (default: all)
   * @param offset Number of tags to skip (default: 0)
   * @returns Array of Tags
   */
  async getAllTags(limit?: number, offset?: number): Promise<Tag[]> {
    const tagRepo = this.dbService.getTagRepository();

    const findOptions: any = {
      order: { name: 'ASC' },
    };

    // Add pagination if specified
    if (limit !== undefined) {
      findOptions.take = limit;
    }
    if (offset !== undefined) {
      findOptions.skip = offset;
    }

    const tags = await tagRepo.find(findOptions);

    // Convert each database row to a Tag object
    return tags.map((tag) => this.entityToTag(tag));
  }

  /**
   * Get multiple tags by IDs (batch operation)
   *
   * This method retrieves multiple tags in a single database query for efficiency.
   *
   * @param ids Array of tag IDs (UUID or human-readable tag-*)
   * @returns Array of Tags that were found (may be fewer than input if some don't exist)
   */
  async getTags(ids: string[]): Promise<Tag[]> {
    if (ids.length === 0) {
      return [];
    }

    const tagRepo = this.dbService.getTagRepository();

    // Resolve all human-readable IDs to UUIDs
    const resolvedIds = ids
      .map((id) => {
        if (id.startsWith('tag-')) {
          const resolvedUuid = this.idMap.getUuid(id, EntityType.TAG);
          return resolvedUuid;
        }
        return id;
      })
      .filter((uuid): uuid is string => uuid !== undefined);

    if (resolvedIds.length === 0) {
      return [];
    }

    const tags = await tagRepo.find({
      where: { id: In([...resolvedIds]) },
    });

    // Convert each database row to a Tag object and preserve input order
    // Create a map from UUID to Tag (database uses UUIDs)
    const tagMap = new Map<string, Tag>();
    tags.forEach((tag: any) => {
      const entityTag = this.entityToTag(tag);
      tagMap.set(tag.id, entityTag);
    });

    // Map input IDs to UUIDs for lookup
    const orderedTags: Tag[] = [];
    for (const id of ids) {
      let uuid = id;
      if (id.startsWith('tag-')) {
        const resolvedUuid = this.idMap.getUuid(id, EntityType.TAG);
        if (resolvedUuid) {
          uuid = resolvedUuid;
        }
      }
      const tag = tagMap.get(uuid);
      if (tag) orderedTags.push(tag);
    }
    return orderedTags;
  }

  /**
   * Update a tag
   *
   * This method:
   * 1. Checks if the tag exists
   * 2. Updates the specified fields
   * 3. Returns the updated tag
   *
   * @param data The update data (id required, name/color optional)
   * @returns The updated Tag if found, undefined otherwise
   */
  async updateTag(data: z.infer<typeof UpdateTagSchema>): Promise<Tag | undefined> {
    // Resolve human-readable ID to UUID if needed
    let uuid = data.id;
    if (data.id.startsWith('tag-')) {
      const resolvedUuid = this.idMap.getUuid(data.id, EntityType.TAG);
      if (!resolvedUuid) return undefined;
      uuid = resolvedUuid;
    }

    // First check if the tag exists
    const tag = await this.getTag(data.id);
    if (!tag) return undefined;

    // Create a timestamp for the update
    const updatedAt = new Date().toISOString();

    const tagRepo = this.dbService.getTagRepository();

    try {
      await tagRepo.update(
        { id: uuid },
        {
          name: data.name || tag.name,
          color: data.color || tag.color || null,
          updatedAt,
        }
      );
    } catch (error: any) {
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        throw new Error(`Tag with name "${data.name}" already exists`);
      }
      throw error;
    }

    // Return the updated tag
    return this.getTag(data.id);
  }

  /**
   * Delete a tag
   *
   * This method removes a tag from the database permanently.
   * Associated relationships in the todo_tags table are automatically deleted
   * due to the CASCADE constraint.
   *
   * @param id The tag ID (UUID or human-readable tag-*)
   * @returns true if deleted, false if not found or not deleted
   */
  async deleteTag(id: string): Promise<boolean> {
    const tagRepo = this.dbService.getTagRepository();

    // Resolve human-readable ID to UUID if needed
    let uuid = id;
    if (id.startsWith('tag-')) {
      const resolvedUuid = this.idMap.getUuid(id, EntityType.TAG);
      if (!resolvedUuid) return false;
      uuid = resolvedUuid;
    }

    const result = await tagRepo.delete({ id: uuid });

    // Unregister the mapping if deletion was successful
    if (result.affected && result.affected > 0 && id.startsWith('tag-')) {
      this.idMap.unregisterMapping(id, uuid, EntityType.TAG);
    }

    // Check if any rows were affected
    return (result.affected || 0) > 0;
  }

  /**
   * Search tags by name
   *
   * This method performs a case-insensitive partial match search
   * on tag names.
   *
   * @param name The search term to look for in tag names
   * @returns Array of matching Tags
   */
  async searchTags(name: string): Promise<Tag[]> {
    // Add wildcards to the search term for partial matching
    const searchTerm = `%${name}%`;

    const tagRepo = this.dbService.getTagRepository();

    const tags = await tagRepo.find({
      where: { name: Like(searchTerm) },
      order: { name: 'ASC' },
    });

    return tags.map((tag) => this.entityToTag(tag));
  }

  /**
   * Add a tag to a todo (create a relationship)
   *
   * This method creates a relationship between a todo and a tag.
   * If the relationship already exists, it does nothing (idempotent).
   * Enforces maximum of 4 tags per todo.
   *
   * @param todoId The task-* ID of the todo
   * @param tagId The tag-* ID (human-readable) or UUID of the tag
   * @returns true if the relationship was created, false if it already existed
   */
  async addTagToTodo(todoId: string, tagId: string): Promise<boolean> {
    const todoRepo = this.dbService.getTodoRepository();

    // Resolve human-readable IDs to UUIDs if needed
    let tagUuid = tagId;
    if (tagId.startsWith('tag-')) {
      const resolvedUuid = this.idMap.getUuid(tagId, EntityType.TAG);
      if (!resolvedUuid) {
        throw new Error(`Tag with ID ${tagId} not found`);
      }
      tagUuid = resolvedUuid;
    }

    const todoUuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!todoUuid) {
      throw new Error(`Todo with ID ${todoId} not found`);
    }

    // Check current tag count before adding (max 4 tags per todo)
    const currentTags = await this.getTagsForTodo(todoId);
    if (currentTags.length >= 4) {
      throw new Error('Maximum of 4 tags allowed per todo');
    }

    try {
      const todo = await todoRepo.findOne({
        where: { id: todoUuid },
        relations: ['tags'],
      });

      if (!todo) {
        return false;
      }

      // Check if tag already exists on todo
      const existingTag = todo.tags?.find((t: any) => t.id === tagUuid);
      if (existingTag) {
        return false;
      }

      todo.tags = todo.tags || [];
      todo.tags.push({ id: tagUuid } as any);

      await todoRepo.save(todo);
      return true;
    } catch (error: any) {
      // If it's a constraint error, the relationship already exists
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Remove a tag from a todo (delete a relationship)
   *
   * @param todoId The task-* ID of the todo
   * @param tagId The tag-* ID (human-readable) or UUID of the tag
   * @returns true if the relationship was deleted, false if not found
   */
  async removeTagFromTodo(todoId: string, tagId: string): Promise<boolean> {
    const todoRepo = this.dbService.getTodoRepository();

    // Resolve human-readable IDs to UUIDs if needed
    let tagUuid = tagId;
    if (tagId.startsWith('tag-')) {
      const resolvedUuid = this.idMap.getUuid(tagId, EntityType.TAG);
      if (!resolvedUuid) {
        return false; // Tag not found, return false
      }
      tagUuid = resolvedUuid;
    }

    const todoUuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!todoUuid) {
      return false; // Todo not found, return false
    }

    const todo = await todoRepo.findOne({
      where: { id: todoUuid },
      relations: ['tags'],
    });

    if (!todo) return false;

    if (!todo.tags) return false;

    todo.tags = todo.tags.filter((t: any) => t.id !== tagUuid);
    await todoRepo.save(todo);

    return true;
  }

  /**
   * Get all tags associated with a todo
   *
   * @param todoId The task-* ID of the todo
   * @returns Array of Tags associated with the todo
   */
  async getTagsForTodo(todoId: string): Promise<Tag[]> {
    const todoRepo = this.dbService.getTodoRepository();

    // Resolve human-readable ID to UUID if needed
    const todoUuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!todoUuid) {
      return [];
    }

    const todo = await todoRepo.findOne({
      where: { id: todoUuid },
      relations: ['tags'],
    });

    if (!todo) return [];

    // Sort tags by name to ensure consistent ordering
    const tags = (todo.tags || []).map((tag: any) => this.entityToTag(tag));
    return tags.sort((a: Tag, b: Tag) => a.name.localeCompare(b.name));
  }

  /**
   * Get all todos with a specific tag
   *
   * @param tagId The tag-* ID (human-readable) or UUID of the tag
   * @returns Array of todo IDs (task-*) that have this tag
   */
  async getTodosWithTag(tagId: string): Promise<string[]> {
    const tagRepo = this.dbService.getTagRepository();

    // Resolve human-readable ID to UUID if needed
    let uuid = tagId;
    if (tagId.startsWith('tag-')) {
      const resolvedUuid = this.idMap.getUuid(tagId, EntityType.TAG);
      if (!resolvedUuid) {
        return []; // Tag not found, return empty array
      }
      uuid = resolvedUuid;
    }

    const tag = await tagRepo.findOne({
      where: { id: uuid },
      relations: ['todos'],
    });

    if (!tag) return [];

    // Return UUIDs instead of human-readable IDs
    return (tag.todos || []).map((todo: any) => todo.id);
  }

  /**
   * Remove all tags from a todo
   *
   * This is useful when deleting a todo to clean up relationships.
   *
   * @param todoId The task-* ID of the todo
   * @returns number of relationships deleted
   */
  async removeAllTagsFromTodo(todoId: string): Promise<number> {
    const todoRepo = this.dbService.getTodoRepository();
    const todoUuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!todoUuid) return 0;

    const todo = await todoRepo.findOne({
      where: { id: todoUuid },
      relations: ['tags'],
    });

    if (!todo) return 0;

    const count = todo.tags?.length || 0;
    todo.tags = [];
    await todoRepo.save(todo);

    return count;
  }

  /**
   * Get tag names from tag IDs
   *
   * This method retrieves tag names given an array of tag IDs.
   * Useful for displaying tag names instead of IDs.
   *
   * @param ids Array of tag IDs (UUID or human-readable tag-*)
   * @returns Array of tag names (may be fewer than input if some don't exist)
   */
  async getTagNames(ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }

    const tags = await this.getTags(ids);
    // Preserve input order
    return tags.map((tag) => tag.name);
  }

  /**
   * Helper to convert a database entity to a Tag object
   *
   * Uses IdMapService to get human-readable ID mapping.
   *
   * @param entity The database entity data
   * @returns A properly formatted Tag object
   */
  private entityToTag(entity: any): Tag {
    const humanReadableId = this.idMap.getHumanReadableId(entity.id, EntityType.TAG);
    return {
      id: humanReadableId,
      name: entity.name,
      color: entity.color,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

// Export class for testing (allows creating fresh instances with custom dependencies)
export { TagService };

// Create a singleton instance for use throughout the application
export const tagService = new TagService();
