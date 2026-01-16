/**
 * TodoService.ts
 * 
 * This service implements the core business logic for managing todos.
 * It acts as an intermediary between the data model and the database,
 * handling all CRUD operations and search functionality.
 * 
 * WHY A SERVICE LAYER?
 * - Separates business logic from database operations
 * - Provides a clean API for the application to work with
 * - Makes it easier to change the database implementation later
 * - Encapsulates complex operations into simple method calls
 */
import { Todo, createTodo, CreateTodoSchema, UpdateTodoSchema } from '../models/Todo.js';
import { z } from 'zod';
import { databaseService } from './DatabaseService.js';
import { idMapService, EntityType } from './IdMapService.js';
import { tagService } from './TagService.js';

/**
 * TodoService Class
 * 
 * This service follows the repository pattern to provide a clean
 * interface for working with todos. It encapsulates all database
 * operations and business logic in one place.
 */
class TodoService {
  constructor() {
    // Initialization handled by IdMapService
  }

  /**
   * Create a new todo
   * 
   * This method:
   * 1. Uses the factory function to create a new Todo object
   * 2. Persists it to the database
   * 3. Returns the created Todo
   * 
   * @param data Validated input data (title, description, priority)
   * @returns The newly created Todo
   */
  createTodo(data: z.infer<typeof CreateTodoSchema>): Todo {
    // Use the factory function to create a Todo with proper defaults
    const todo = createTodo(data);
    
    // Get the database instance
    const db = databaseService.getDb();
    
    // Prepare the SQL statement for inserting a new todo
    const stmt = db.prepare(`
      INSERT INTO todos (id, priority, title, description, completedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Execute the statement with the todo's data
    stmt.run(
      todo.id,
      todo.priority,
      todo.title,
      todo.description,
      todo.completedAt,
      todo.createdAt,
      todo.updatedAt
    );
    
    // Return the created todo
    return todo;
  }

  /**
   * Get a todo by ID
   *
   * This method:
   * 1. Queries the database for a todo with the given ID
   * 2. Converts the database row to a Todo object if found
   * 3. Populates the blocked_by field with all blocker task-* IDs
   * 4. Populates the tags field with all associated tag-* IDs
   *
   * @param id The task id (task-*) of the todo to retrieve
   * @returns The Todo if found, undefined otherwise
   */
  getTodo(id: string): Todo | undefined {
    const db = databaseService.getDb();
    
    // Use parameterized query to prevent SQL injection
    const stmt = db.prepare('SELECT * FROM todos WHERE id = ?');

    const uuid = idMapService.getUuid(id, EntityType.TODO);
    if (!uuid) return undefined;

    const row = stmt.get(uuid) as any;

    // Return undefined if no todo was found
    if (!row) return undefined;
    
    // Convert the database row to a Todo object
    const todo = this.rowToTodo(row);
    // Populate blocked_by field
    todo.blocked_by = this.getBlockerIds(id);
    // Populate tags field
    todo.tags = this.getTagIds(id);
    // Populate tagNames field
    todo.tagNames = tagService.getTagNames(todo.tags);
    return todo;
  }

  /**
   * Get all todos
   * 
   * This method returns all todos in the database without filtering.
   * Populates the blocked_by field for each todo.
   * 
   * @returns Array of all Todos
   */
  getAllTodos(): Todo[] {
    const db = databaseService.getDb();
    const stmt = db.prepare('SELECT * FROM todos');
    const rows = stmt.all() as any[];
    
    // Convert each database row to a Todo object and populate blocked_by, tags, and tagNames
    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tags = this.getTagIds(todo.id);
      todo.tagNames = tagService.getTagNames(todo.tags);
      return todo;
    });
  }

  /**
   * Get all active (non-completed) todos
   *
   * This method returns only todos that haven't been marked as completed.
   * A todo is considered active when its completedAt field is NULL.
   * Populates the blocked_by and tags fields for each todo.
   *
   * @returns Array of active Todos
   */
  getActiveTodos(): Todo[] {
    const db = databaseService.getDb();
    const stmt = db.prepare('SELECT * FROM todos WHERE completedAt IS NULL');
    const rows = stmt.all() as any[];
    
    // Convert each database row to a Todo object and populate blocked_by, tags, and tagNames
    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tags = this.getTagIds(todo.id);
      todo.tagNames = tagService.getTagNames(todo.tags);
      return todo;
    });
  }

  /**
   * Update a todo
   * 
   * This method:
   * 1. Checks if the todo exists
   * 2. Updates the specified fields
   * 3. Returns the updated todo
   * 
   * @param data The update data (id required, title/description optional)
   * @returns The updated Todo if found, undefined otherwise
   */
  updateTodo(data: z.infer<typeof UpdateTodoSchema>): Todo | undefined {    
    // First check if the todo exists
    const todo = this.getTodo(data.id);
    if (!todo) return undefined;

    // Create a timestamp for the update
    const updatedAt = new Date().toISOString();
    
    const db = databaseService.getDb();
    const stmt = db.prepare(`
      UPDATE todos
      SET title = ?, description = ?, updatedAt = ?
      WHERE id = ?
    `);
    
    // Update with new values or keep existing ones if not provided
    const uuid = idMapService.getUuid(todo.id, EntityType.TODO);
    stmt.run(
      data.title || todo.title,
      data.description || todo.description,
      updatedAt,
      uuid
    );

    // Return the updated todo
    return this.getTodo(data.id);
  }

  /**
   * Mark a todo as completed
   * 
   * This method:
   * 1. Checks if the todo exists
   * 2. Sets the completedAt timestamp to the current time
   * 3. Returns the updated todo
   * 
   * @param id The task-* ID of the todo to complete
   * @returns The updated Todo if found, undefined otherwise
   */
  completeTodo(id: string): Todo | undefined {
    // First check if the todo exists
    const todo = this.getTodo(id);
    if (!todo) return undefined;

    // Create a timestamp for the completion and update
    const now = new Date().toISOString();
    
    const db = databaseService.getDb();
    const stmt = db.prepare(`
      UPDATE todos
      SET completedAt = ?, updatedAt = ?
      WHERE id = ?
    `);
    
    // Convert readable ID to UUID
    const uuid = idMapService.getUuid(id, EntityType.TODO);
    
    // Set the completedAt timestamp
    stmt.run(now, now, uuid);
    
    // Return the updated todo
    return this.getTodo(id);
  }

  /**
   * Delete a todo
   * 
   * This method removes a todo from the database permanently.
   * 
   * @param id The UUID of the todo to delete
   * @returns true if deleted, false if not found or not deleted
   */
  deleteTodo(id: string): boolean {
    const db = databaseService.getDb();
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');

    // Convert the readable id to uuid
    const uuid = idMapService.getUuid(id, EntityType.TODO);
    if (!uuid) return false;

    const result = stmt.run(uuid);
    
    if (result.changes > 0){
      idMapService.unregisterMapping(id, uuid, EntityType.TODO);
    }

    // Check if any rows were affected
    return result.changes > 0;
  }

  /**
   * Search todos by title
   * 
   * This method performs a case-insensitive partial match search
   * on todo titles.
   * 
   * @param title The search term to look for in titles
   * @returns Array of matching Todos
   */
  searchByTitle(title: string): Todo[] {
    // Add wildcards to the search term for partial matching
    const searchTerm = `%${title}%`;
    
    const db = databaseService.getDb();
    
    // COLLATE NOCASE makes the search case-insensitive
    const stmt = db.prepare('SELECT * FROM todos WHERE title LIKE ? COLLATE NOCASE');
    const rows = stmt.all(searchTerm) as any[];
    
    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tags = this.getTagIds(todo.id);
      todo.tagNames = tagService.getTagNames(todo.tags);
      return todo;
    });
  }

  /**
   * Search todos by date
   * 
   * This method finds todos created on a specific date.
   * It matches the start of the ISO string with the given date.
   * 
   * @param dateStr The date to search for in YYYY-MM-DD format
   * @returns Array of matching Todos
   */
  searchByDate(dateStr: string): Todo[] {
    // Add wildcard to match the time portion of ISO string
    const datePattern = `${dateStr}%`;
    
    const db = databaseService.getDb();
    const stmt = db.prepare('SELECT * FROM todos WHERE createdAt LIKE ?');
    const rows = stmt.all(datePattern) as any[];
    
    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tags = this.getTagIds(todo.id);
      todo.tagNames = tagService.getTagNames(todo.tags);
      return todo;
    });
  }

  /**
   * Search todos by priority
   * 
   * This method performs a case-insensitive partial match search
   * on priority of todos.
   * 
   * @param priority The priority, ranging from URGENT to LOWEST
   * @returns Array of matching Todos
   */
  searchByPriority(priority: string): Todo[] {    
    const db = databaseService.getDb();
    const stmt = db.prepare('SELECT * FROM todos WHERE priority LIKE ?');
    const rows = stmt.all(priority) as any[];
    
    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tags = this.getTagIds(todo.id);
      todo.tagNames = tagService.getTagNames(todo.tags);
      return todo;
    });
  }

  /**
   * Generate a summary of active todos
   * 
   * This method creates a markdown-formatted summary of all active todos.
   * 
   * WHY RETURN FORMATTED STRING?
   * - Provides ready-to-display content for the MCP client
   * - Encapsulates formatting logic in the service
   * - Makes it easy for LLMs to present a readable summary
   * 
   * @returns Markdown-formatted summary string
   */
  summarizeActiveTodos(): string {
    const activeTodos = this.getActiveTodos();
    
    // Handle the case when there are no active todos
    if (activeTodos.length === 0) {
      return "No active todos found.";
    }
    
    // Create a bulleted list of todo titles
    const summary = activeTodos.map(todo => `- ${todo.title}`).join('\n');
    return `# Active Todos Summary\n\nThere are ${activeTodos.length} active todos:\n\n${summary}`;
  }
  
  /**
   * Helper to convert a database row to a Todo object
   *
   * This private method handles the conversion between the database
   * representation and the application model.
   *
   * WHY SEPARATE THIS LOGIC?
   * - Avoids repeating the conversion code in multiple methods
   * - Creates a single place to update if the model changes
   * - Isolates database-specific knowledge from the rest of the code
   *
   * @param row The database row data, note that the 'id' field is the UUID
   * @returns A properly formatted Todo object
   */
  private rowToTodo(row: any): Todo {
    const taskName = idMapService.getHumanReadableId(row.id, EntityType.TODO);
      
    return {
      id: taskName,
      title: row.title,
      priority: row.priority,
      description: row.description,
      completedAt: row.completedAt,
      completed: row.completedAt !== null, // Computed from completedAt
      blocked_by: [],
      tags: [],
      tagNames: [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  /**
   * Add a blocker dependency to a todo
   * 
   * This marks that a todo is blocked by another todo.
   * 
   * @param blockedTodoId The task-* ID of the todo being blocked
   * @param blockerTodoId The task-* ID of the todo that blocks it
   * @returns true if the dependency was created, false if it already exists
   */
  addBlockerDependency(blockedTodoId: string, blockerTodoId: string): boolean {
    const db = databaseService.getDb();
    
    // Prevent self-blocking
    if (blockedTodoId === blockerTodoId) {
      throw new Error("A todo cannot be blocked by itself");
    }

    try {
      const stmt = db.prepare(`
        INSERT INTO todo_dependencies (blocked_todo_id, blocker_todo_id, createdAt)
        VALUES (?, ?, ?)
      `);
      
      const now = new Date().toISOString();
      
      // Convert readable IDs to UUIDs
      const blockedUuid = idMapService.getUuid(blockedTodoId, EntityType.TODO);
      const blockerUuid = idMapService.getUuid(blockerTodoId, EntityType.TODO);
      
      if (!blockedUuid || !blockerUuid) {
        throw new Error("One or both todos not found");
      }
      
      const result = stmt.run(blockedUuid, blockerUuid, now);
      return result.changes > 0;
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Remove a blocker dependency from a todo
   * 
   * @param blockedTodoId The task-* ID of the todo being blocked
   * @param blockerTodoId The task-* ID of the todo that blocks it
   * @returns true if the dependency was deleted, false if not found
   */
  removeBlockerDependency(blockedTodoId: string, blockerTodoId: string): boolean {
    const db = databaseService.getDb();
    
    const stmt = db.prepare(`
      DELETE FROM todo_dependencies 
      WHERE blocked_todo_id = ? AND blocker_todo_id = ?
    `);
    
    // Convert readable IDs to UUIDs
    const blockedUuid = idMapService.getUuid(blockedTodoId, EntityType.TODO);
    const blockerUuid = idMapService.getUuid(blockerTodoId, EntityType.TODO);
    
    if (!blockedUuid || !blockerUuid) {
      return false;
    }
    
    const result = stmt.run(blockedUuid, blockerUuid);
    return result.changes > 0;
  }

  /**
   * Get all blockers for a specific todo
   * 
   * Returns the todos that are blocking the specified todo.
   * 
   * @param todoId The task-* ID of the blocked todo
   * @returns Array of blocker Todos
   */
  getBlockersForTodo(todoId: string): Todo[] {
    const db = databaseService.getDb();
    const stmt = db.prepare(`
      SELECT t.* FROM todos t
      INNER JOIN todo_dependencies td ON t.id = td.blocker_todo_id
      WHERE td.blocked_todo_id = ?
      ORDER BY t.title
    `);
    
    // Convert readable ID to UUID
    const uuid = idMapService.getUuid(todoId, EntityType.TODO);
    if (!uuid) return [];
    
    const rows = stmt.all(uuid) as any[];
    
    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.tags = this.getTagIds(todo.id);
      todo.tagNames = tagService.getTagNames(todo.tags);
      return todo;
    });
  }

  /**
   * Get all todos blocked by a specific todo
   * 
   * Returns the todos that are blocked by the specified todo.
   * 
   * @param todoId The task-* ID of the blocker todo
   * @returns Array of blocked Todo IDs (task-*)
   */
  getTodosBlockedBy(todoId: string): string[] {
    const db = databaseService.getDb();
    const stmt = db.prepare(`
      SELECT blocked_todo_id FROM todo_dependencies
      WHERE blocker_todo_id = ?
      ORDER BY blocked_todo_id
    `);
    
    // Convert readable ID to UUID
    const uuid = idMapService.getUuid(todoId, EntityType.TODO);
    if (!uuid) return [];
    
    const rows = stmt.all(uuid) as any[];
    
    // Convert UUIDs back to task-* format
    return rows.map(row => {
      return idMapService.getHumanReadableId(row.blocked_todo_id, EntityType.TODO);
    });
  }

  /**
   * Get all blocker IDs (in task-* format) for a todo
   * 
   * @param todoId The task-* ID of the blocked todo
   * @returns Array of blocker task-* IDs
   */
  getBlockerIds(todoId: string): string[] {
    const db = databaseService.getDb();
    const stmt = db.prepare(`
      SELECT blocker_todo_id FROM todo_dependencies
      WHERE blocked_todo_id = ?
      ORDER BY blocker_todo_id
    `);
    
    // Convert readable ID to UUID
    const uuid = idMapService.getUuid(todoId, EntityType.TODO);
    if (!uuid) return [];
    
    const rows = stmt.all(uuid) as any[];
    
    // Convert UUIDs back to task-* format
    return rows.map(row => {
      return idMapService.getHumanReadableId(row.blocker_todo_id, EntityType.TODO);
    });
  }

  /**
   * Get all tag IDs (in tag-* format) for a todo
   *
   * @param todoId The task-* ID of the todo
   * @returns Array of tag-* IDs
   */
  getTagIds(todoId: string): string[] {
    const db = databaseService.getDb();
    const stmt = db.prepare(`
      SELECT tag_id FROM todo_tags
      WHERE todo_id = ?
      ORDER BY tag_id
    `);
    
    // Convert readable ID to UUID
    const uuid = idMapService.getUuid(todoId, EntityType.TODO);
    if (!uuid) return [];
    
    const rows = stmt.all(uuid) as any[];
    
    // Convert UUIDs back to tag-* format
    return rows.map(row => {
      return idMapService.getHumanReadableId(row.tag_id, EntityType.TAG);
    });
  }

  /**
   * Remove all dependencies for a todo (both blocked and blocking)
   *
   * This is useful when deleting a todo to clean up all relationships.
   *
   * @param todoId The task-* ID of the todo
   * @returns number of dependencies deleted
   */
  removeAllDependencies(todoId: string): number {
    const db = databaseService.getDb();
    
    // Convert readable ID to UUID
    const uuid = idMapService.getUuid(todoId, EntityType.TODO);
    if (!uuid) return 0;
    
    // Delete both: this todo blocking others AND this todo being blocked
    const stmt = db.prepare(`
      DELETE FROM todo_dependencies
      WHERE blocked_todo_id = ? OR blocker_todo_id = ?
    `);
    
    const result = stmt.run(uuid, uuid);
    return result.changes;
  }
}

// Create a singleton instance for use throughout the application
export const todoService = new TodoService(); 