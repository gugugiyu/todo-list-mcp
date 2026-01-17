/**
 * TagService.ts
 * 
 * This service implements the core business logic for managing tags.
 * It acts as an intermediary between the data model and the database,
 * handling all CRUD operations for tags and managing tag-todo relationships.
 */
import { Tag, createTag, CreateTagSchema, UpdateTagSchema } from '../models/Tag.js';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { databaseService } from './DatabaseService.js';
import { IdMapService, EntityType, idMapService } from './IdMapService.js';

/**
 * TagService Class
 *
 * This service follows the repository pattern to provide a clean
 * interface for working with tags. It encapsulates all database
 * operations and business logic in one place.
 */
class TagService {
  private db: Database.Database;
  private idMap: IdMapService;

  constructor(db?: Database.Database, idMap?: IdMapService) {
    // Allow dependency injection for testing
    this.db = db || databaseService.getDb();
    this.idMap = idMap || idMapService;
  }

  /**
   * Get the database instance
   * Useful for testing to verify database state
   */
  getDb(): Database.Database {
    return this.db;
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
  createTag(data: z.infer<typeof CreateTagSchema>): Tag {
    // Validate input data
    const validatedData = CreateTagSchema.parse(data);
    
    // Check if a tag with the same name already exists (case-insensitive)
    const existingTag = this.getTagByName(validatedData.name);
    if (existingTag) {
      throw new Error(`Tag with name "${validatedData.name}" already exists`);
    }
    
    // Use the factory function to create a Tag with proper defaults
    const tag = createTag(validatedData);
    
    // Get the database instance
    const db = this.db;
    
    // Prepare the SQL statement for inserting a new tag
    const stmt = db.prepare(`
      INSERT INTO tags (id, name, color, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    // Execute the statement with the tag's data
    stmt.run(
      tag.id,
      tag.name,
      tag.color || null,
      tag.createdAt,
      tag.updatedAt
    );
    
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
  getTag(id: string): Tag | undefined {
    const db = this.db;
    
    // Use parameterized query to prevent SQL injection
    const stmt = db.prepare('SELECT * FROM tags WHERE id = ?');
    
    // Check if this is a human-readable ID, if so convert to UUID
    let uuid = id;
    if (id.startsWith('tag-')) {
      const resolvedUuid = this.idMap.getUuid(id, EntityType.TAG);
      if (!resolvedUuid) return undefined;
      uuid = resolvedUuid;
    }
    
    const row = stmt.get(uuid) as any;

    // Return undefined if no tag was found
    if (!row) return undefined;
    
    // Convert the database row to a Tag object
    return this.rowToTag(row);
  }

  /**
   * Get a tag by name
   * 
   * @param name The name of the tag to retrieve
   * @returns The Tag if found, undefined otherwise
   */
  getTagByName(name: string): Tag | undefined {
    const db = this.db;
    const stmt = db.prepare('SELECT * FROM tags WHERE name = ? COLLATE NOCASE');
    const row = stmt.get(name) as any;

    if (!row) return undefined;
    return this.rowToTag(row);
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
  getAllTags(limit?: number, offset?: number): Tag[] {
    const db = this.db;
    let query = 'SELECT * FROM tags ORDER BY name';
    const params: any[] = [];
    
    // Add pagination if specified
    // SQLite requires LIMIT when using OFFSET, so we use a large number if limit is not specified
    if (limit !== undefined) {
      query += ' LIMIT ?';
      params.push(limit);
    } else if (offset !== undefined) {
      // If offset is provided without limit, use a very large limit
      query += ' LIMIT ?';
      params.push(2147483647); // Maximum SQLite integer
    }
    if (offset !== undefined) {
      query += ' OFFSET ?';
      params.push(offset);
    }
    
    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    // Convert each database row to a Tag object
    return rows.map(row => this.rowToTag(row));
  }

  /**
   * Get multiple tags by IDs (batch operation)
   *
   * This method retrieves multiple tags in a single database query for efficiency.
   *
   * @param ids Array of tag IDs (UUID or human-readable tag-*)
   * @returns Array of Tags that were found (may be fewer than input if some don't exist)
   */
  getTags(ids: string[]): Tag[] {
    if (ids.length === 0) {
      return [];
    }

    const db = this.db;
    
    // Resolve all human-readable IDs to UUIDs
    const resolvedIds = ids.map(id => {
      if (id.startsWith('tag-')) {
        const resolvedUuid = this.idMap.getUuid(id, EntityType.TAG);
        return resolvedUuid;
      }
      return id;
    }).filter((uuid): uuid is string => uuid !== undefined);
    
    if (resolvedIds.length === 0) {
      return [];
    }
    
    // Build a parameterized query with placeholders for each ID
    const placeholders = resolvedIds.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT * FROM tags WHERE id IN (${placeholders}) ORDER BY name`);
    const rows = stmt.all(...resolvedIds) as any[];
    
    // Convert each database row to a Tag object
    return rows.map(row => this.rowToTag(row));
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
  updateTag(data: z.infer<typeof UpdateTagSchema>): Tag | undefined {
    // Resolve human-readable ID to UUID if needed
    let uuid = data.id;
    if (data.id.startsWith('tag-')) {
      const resolvedUuid = this.idMap.getUuid(data.id, EntityType.TAG);
      if (!resolvedUuid) return undefined;
      uuid = resolvedUuid;
    }
    
    // First check if the tag exists
    const tag = this.getTag(data.id);
    if (!tag) return undefined;

    // Create a timestamp for the update
    const updatedAt = new Date().toISOString();
    
    const db = this.db;
    
    try {
      const stmt = db.prepare(`
        UPDATE tags
        SET name = ?, color = ?, updatedAt = ?
        WHERE id = ?
      `);
      
      // Update with new values or keep existing ones if not provided
      stmt.run(
        data.name || tag.name,
        data.color || tag.color || null,
        updatedAt,
        uuid
      );
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint failed')) {
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
  deleteTag(id: string): boolean {
    const db = this.db;
    
    // Resolve human-readable ID to UUID if needed
    let uuid = id;
    if (id.startsWith('tag-')) {
      const resolvedUuid = this.idMap.getUuid(id, EntityType.TAG);
      if (!resolvedUuid) return false;
      uuid = resolvedUuid;
    }
    
    const stmt = db.prepare('DELETE FROM tags WHERE id = ?');
    const result = stmt.run(uuid);
    
    // Unregister the mapping if deletion was successful
    if (result.changes > 0 && id.startsWith('tag-')) {
      this.idMap.unregisterMapping(id, uuid, EntityType.TAG);
    }

    // Check if any rows were affected
    return result.changes > 0;
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
  searchTags(name: string): Tag[] {
    // Add wildcards to the search term for partial matching
    const searchTerm = `%${name}%`;
    
    const db = this.db;
    
    // COLLATE NOCASE makes the search case-insensitive
    const stmt = db.prepare('SELECT * FROM tags WHERE name COLLATE NOCASE LIKE ? ORDER BY name');
    const rows = stmt.all(searchTerm) as any[];
    
    return rows.map(row => this.rowToTag(row));
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
  addTagToTodo(todoId: string, tagId: string): boolean {
    const db = this.db;
    
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
    const currentTags = this.getTagsForTodo(todoId);
    if (currentTags.length >= 4) {
      throw new Error("Maximum of 4 tags allowed per todo");
    }
    
    try {
      const stmt = db.prepare(`
        INSERT INTO todo_tags (todo_id, tag_id, createdAt)
        VALUES (?, ?, ?)
      `);
      
      const now = new Date().toISOString();
      const result = stmt.run(todoUuid, tagUuid, now);
      return result.changes > 0;
    } catch (error: any) {
      // If it's a constraint error, the relationship already exists
      if (error.message.includes('UNIQUE constraint failed')) {
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
  removeTagFromTodo(todoId: string, tagId: string): boolean {
    const db = this.db;
    
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
    
    const stmt = db.prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?');
    const result = stmt.run(todoUuid, tagUuid);
    return result.changes > 0;
  }

  /**
   * Get all tags associated with a todo
   *
   * @param todoId The task-* ID of the todo
   * @returns Array of Tags associated with the todo
   */
  getTagsForTodo(todoId: string): Tag[] {
    const db = this.db;
    
    // Resolve human-readable ID to UUID if needed
    const todoUuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!todoUuid) {
      return [];
    }
    
    const stmt = db.prepare(`
      SELECT t.* FROM tags t
      INNER JOIN todo_tags tt ON t.id = tt.tag_id
      WHERE tt.todo_id = ?
      ORDER BY t.name
    `);
    const rows = stmt.all(todoUuid) as any[];
    
    return rows.map(row => this.rowToTag(row));
  }

  /**
   * Get all todos with a specific tag
   *
   * @param tagId The tag-* ID (human-readable) or UUID of the tag
   * @returns Array of todo IDs (task-*) that have this tag
   */
  getTodosWithTag(tagId: string): string[] {
    const db = this.db;
    
    // Resolve human-readable ID to UUID if needed
    let uuid = tagId;
    if (tagId.startsWith('tag-')) {
      const resolvedUuid = this.idMap.getUuid(tagId, EntityType.TAG);
      if (!resolvedUuid) {
        return []; // Tag not found, return empty array
      }
      uuid = resolvedUuid;
    }
    
    const stmt = db.prepare(`
      SELECT todo_id FROM todo_tags
      WHERE tag_id = ?
      ORDER BY todo_id
    `);
    const rows = stmt.all(uuid) as any[];
    
    return rows.map(row => row.todo_id);
  }

  /**
   * Remove all tags from a todo
   *
   * This is useful when deleting a todo to clean up relationships.
   *
   * @param todoId The task-* ID of the todo
   * @returns number of relationships deleted
   */
  removeAllTagsFromTodo(todoId: string): number {
    const db = this.db;
    const stmt = db.prepare('DELETE FROM todo_tags WHERE todo_id = ?');
    const result = stmt.run(todoId);
    return result.changes;
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
  getTagNames(ids: string[]): string[] {
    if (ids.length === 0) {
      return [];
    }

    const tags = this.getTags(ids);
    return tags.map(tag => tag.name);
  }

  /**
   * Helper to convert a database row to a Tag object
   * 
   * Uses IdMapService to get human-readable ID mapping.
   * 
   * @param row The database row data
   * @returns A properly formatted Tag object
   */
  private rowToTag(row: any): Tag {
    const humanReadableId = this.idMap.getHumanReadableId(row.id, EntityType.TAG);
    return {
      id: humanReadableId,
      name: row.name,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}

// Export class for testing (allows creating fresh instances with custom dependencies)
export { TagService };

// Create a singleton instance for use throughout the application
export const tagService = new TagService();
