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
import Database from 'better-sqlite3';
import { formatRelativeTime } from '../utils/formatters.js'
import { databaseService } from './DatabaseService.js';
import { IdMapService, EntityType, idMapService } from './IdMapService.js';
import { TagService, tagService } from './TagService.js';
import { UserService, userService } from './UserService.js';
import { ProjectService, projectService } from './ProjectService.js';

/**
 * TodoService Class
 *
 * This service follows the repository pattern to provide a clean
 * interface for working with todos. It encapsulates all database
 * operations and business logic in one place.
 */
class TodoService {
  private db: Database.Database;
  private idMap: IdMapService;
  private tagSvc: TagService;
  private userSvc: UserService;
  private projectSvc: ProjectService;

  constructor(
    db?: Database.Database,
    idMap?: IdMapService,
    tagSvc?: TagService,
    userSvc?: UserService,
    projectSvc?: ProjectService
  ) {
    // Allow dependency injection for testing
    this.db = db || databaseService.getDb();
    this.idMap = idMap || idMapService;
    this.tagSvc = tagSvc || tagService;
    this.userSvc = userSvc || userService;
    this.projectSvc = projectSvc || projectService;
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
   * Get the TagService instance
   * Useful for testing to verify tag operations
   */
  getTagService(): TagService {
    return this.tagSvc;
  }

  /**
   * Get the UserService instance
   * Useful for testing to verify user operations
   */
  getUserService(): UserService {
    return this.userSvc;
  }

  /**
   * Get the ProjectService instance
   * Useful for testing to verify project operations
   */
  getProjectService(): ProjectService {
    return this.projectSvc;
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
    // Get or create the user (automatic registration)
    const user = this.userSvc.getOrCreateUser(data.username);
    
    // Use the factory function to create a Todo with proper defaults
    const todo = createTodo(data);
    
    // Get the database instance
    const db = this.db;
    
    // Prepare the SQL statement for inserting a new todo
    const stmt = db.prepare(`
      INSERT INTO todos (id, username, priority, title, description, completedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Execute the statement with the todo's data
    stmt.run(
      todo.id,
      user.username,
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
  getTodo(id: string, username?: string): Todo | undefined {
    const db = this.db;
    
    // Use parameterized query to prevent SQL injection
    const stmt = db.prepare('SELECT * FROM todos WHERE id = ?');

    const uuid = this.idMap.getUuid(id, EntityType.TODO);
    if (!uuid) return undefined;

    const row = stmt.get(uuid) as any;

    // Return undefined if no todo was found
    if (!row) return undefined;
    
    // If username is provided, check if the todo belongs to that user
    if (username !== undefined) {
      const validatedUsername = this.userSvc.getOrCreateUser(username).username;
      if (row.username !== validatedUsername) {
        return undefined; // User doesn't own this todo
      }
    }
    
    // Convert the database row to a Todo object
    const todo = this.rowToTodo(row);
    // Populate blocked_by field
    todo.blocked_by = this.getBlockerIds(id);
    // Populate tagNames field
    todo.tagNames = this.tagSvc.getTagNames(this.getTagIds(id));
    // Populate projectName field
    if (todo.projectId) {
      const project = this.projectSvc.getProject(todo.projectId, row.username);
      todo.projectName = project?.name || null;
    }
    return todo;
  }

  /**
   * Get all todos
   *
   * This method returns todos in the database with optional filtering by completion status.
   * Populates the blocked_by field for each todo.
   *
   * @param username The username to filter todos by
   * @param useRelativeTime Whether to format timestamps as relative time
   * @param limit Maximum number of todos to return
   * @param offset Number of todos to skip
   * @param isCompleted Optional filter for completion status (true=completed, false=active, undefined=all)
   * @returns Array of Todos
   */
  getAllTodos(username: string, useRelativeTime: boolean, limit: number, offset: number, isCompleted?: boolean): Todo[] {
    // Get or create the user (automatic registration)
    const user = this.userSvc.getOrCreateUser(username);
    
    const db = this.db;
    let query = 'SELECT * FROM todos WHERE username = ?';
    const params: any[] = [user.username];
    
    // Add completion filter if specified
    if (isCompleted !== undefined) {
      query += ' AND completedAt IS ' + (isCompleted ? 'NOT NULL' : 'NULL');
    }
    
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    // Convert each database row to a Todo object and populate blocked_by, tagNames, and projectName
    return rows.map(row => {
      const todo = this.rowToTodo(row, useRelativeTime);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tagNames = this.tagSvc.getTagNames(this.getTagIds(todo.id));
      // Populate projectName field
      if (todo.projectId) {
        const project = this.projectSvc.getProject(todo.projectId, row.username);
        todo.projectName = project?.name || null;
      }
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
  getActiveTodos(username: string): Todo[] {
    // Get or create the user (automatic registration)
    const user = this.userSvc.getOrCreateUser(username);
    
    const db = this.db;
    const stmt = db.prepare('SELECT * FROM todos WHERE username = ? AND completedAt IS NULL');
    const rows = stmt.all(user.username) as any[];
    
    // Convert each database row to a Todo object and populate blocked_by, tagNames, and projectName
    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tagNames = this.tagSvc.getTagNames(this.getTagIds(todo.id));
      // Populate projectName field
      if (todo.projectId) {
        const project = this.projectSvc.getProject(todo.projectId, row.username);
        todo.projectName = project?.name || null;
      }
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
  updateTodo(data: z.infer<typeof UpdateTodoSchema>, username: string): Todo | undefined {
    // First check if the todo exists and belongs to the user
    const todo = this.getTodo(data.id, username);
    if (!todo) return undefined;

    // Create a timestamp for the update
    const updatedAt = new Date().toISOString();
    
    const db = this.db;
    const stmt = db.prepare(`
      UPDATE todos
      SET title = ?, description = ?, updatedAt = ?, priority = ?
      WHERE id = ?
    `);
    
    // Update with new values or keep existing ones if not provided
    const uuid = this.idMap.getUuid(todo.id, EntityType.TODO);
    stmt.run(
      data.title || todo.title,
      data.description || todo.description,
      updatedAt,
      data.priority || todo.priority,
      uuid
    );

    // Return the updated todo
    return this.getTodo(data.id, username);
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
  completeTodo(id: string, username: string): Todo | undefined {
    // First check if the todo exists and belongs to the user
    const todo = this.getTodo(id, username);
    if (!todo) return undefined;

    // Create a timestamp for the completion and update
    const now = new Date().toISOString();
    
    const db = this.db;
    const stmt = db.prepare(`
      UPDATE todos
      SET completedAt = ?, updatedAt = ?
      WHERE id = ?
    `);
    
    // Convert readable ID to UUID
    const uuid = this.idMap.getUuid(id, EntityType.TODO);
    
    // Set the completedAt timestamp
    stmt.run(now, now, uuid);
    
    // Return the updated todo
    return this.getTodo(id, username);
  }

  /**
   * Delete a todo
   * 
   * This method removes a todo from the database permanently.
   * 
   * @param id The UUID of the todo to delete
   * @returns true if deleted, false if not found or not deleted
   */
  deleteTodo(id: string, username: string): boolean {
    // First check if the todo exists and belongs to the user
    const todo = this.getTodo(id, username);
    if (!todo) return false;

    const db = this.db;
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');

    // Convert the readable id to uuid
    const uuid = this.idMap.getUuid(id, EntityType.TODO);
    if (!uuid) return false;

    const result = stmt.run(uuid);
    
    if (result.changes > 0){
      this.idMap.unregisterMapping(id, uuid, EntityType.TODO);
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
  searchByTitle(title: string, username: string): Todo[] {
    // Get or create the user (automatic registration)
    const user = this.userSvc.getOrCreateUser(username);
    
    // Add wildcards to the search term for partial matching
    const searchTerm = `%${title}%`;
    
    const db = this.db;
    
    // COLLATE NOCASE makes the search case-insensitive
    const stmt = db.prepare('SELECT * FROM todos WHERE username = ? AND title LIKE ? COLLATE NOCASE');
    const rows = stmt.all(user.username, searchTerm) as any[];
    
    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tagNames = this.tagSvc.getTagNames(this.getTagIds(todo.id));
      // Populate projectName field
      if (todo.projectId) {
        const project = this.projectSvc.getProject(todo.projectId, row.username);
        todo.projectName = project?.name || null;
      }
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
  searchByDate(dateStr: string, username: string): Todo[] {
    // Get or create the user (automatic registration)
    const user = this.userSvc.getOrCreateUser(username);
    
    // Add wildcard to match the time portion of ISO string
    const datePattern = `${dateStr}%`;
    
    const db = this.db;
    const stmt = db.prepare('SELECT * FROM todos WHERE username = ? AND createdAt LIKE ?');
    const rows = stmt.all(user.username, datePattern) as any[];
    
    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tagNames = this.tagSvc.getTagNames(this.getTagIds(todo.id));
      // Populate projectName field
      if (todo.projectId) {
        const project = this.projectSvc.getProject(todo.projectId, row.username);
        todo.projectName = project?.name || null;
      }
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
  searchByPriority(priority: string, username: string): Todo[] {
    // Get or create the user (automatic registration)
    const user = this.userSvc.getOrCreateUser(username);
    
    const db = this.db;
    const stmt = db.prepare('SELECT * FROM todos WHERE username = ? AND priority LIKE ?');
    const rows = stmt.all(user.username, priority) as any[];
    
    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tagNames = this.tagSvc.getTagNames(this.getTagIds(todo.id));
      // Populate projectName field
      if (todo.projectId) {
        const project = this.projectSvc.getProject(todo.projectId, row.username);
        todo.projectName = project?.name || null;
      }
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
  summarizeActiveTodos(username: string): string {
    const activeTodos = this.getActiveTodos(username);
    
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
   * @param useRelativeTime Convert the ISO time string into human readable string
   * @returns A properly formatted Todo object
   */
  private rowToTodo(row: any, useRelativeTime: boolean = false): Todo {
    const taskName = this.idMap.getHumanReadableId(row.id, EntityType.TODO);
      
    return {
      id: taskName,
      username: row.username,
      title: row.title,
      priority: row.priority,
      description: row.description,
      completedAt: row.completedAt,
      completed: row.completedAt !== null,
      blocked_by: [],
      tagNames: [],
      projectId: row.project_id ? this.idMap.getHumanReadableId(row.project_id, EntityType.PROJECT) : null,
      projectName: null, // Will be populated by getTodo/getAllTodos methods
      createdAt: useRelativeTime ? formatRelativeTime(row.createdAt) : row.createdAt,
      updatedAt: useRelativeTime ? formatRelativeTime(row.updatedAt) : row.updatedAt
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
  addBlockerDependency(blockedTodoId: string, blockerTodoId: string, username: string): boolean {
    // Verify both todos belong to the user
    const blockedTodo = this.getTodo(blockedTodoId, username);
    const blockerTodo = this.getTodo(blockerTodoId, username);
    
    if (!blockedTodo || !blockerTodo) {
      throw new Error("One or both todos not found");
    }
    
    const db = this.db;
    
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
      const blockedUuid = this.idMap.getUuid(blockedTodoId, EntityType.TODO);
      const blockerUuid = this.idMap.getUuid(blockerTodoId, EntityType.TODO);
      
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
  removeBlockerDependency(blockedTodoId: string, blockerTodoId: string, username: string): boolean {
    // Verify both todos belong to the user
    const blockedTodo = this.getTodo(blockedTodoId, username);
    const blockerTodo = this.getTodo(blockerTodoId, username);
    
    if (!blockedTodo || !blockerTodo) {
      return false;
    }
    
    const db = this.db;
    
    const stmt = db.prepare(`
      DELETE FROM todo_dependencies
      WHERE blocked_todo_id = ? AND blocker_todo_id = ?
    `);
    
    // Convert readable IDs to UUIDs
    const blockedUuid = this.idMap.getUuid(blockedTodoId, EntityType.TODO);
    const blockerUuid = this.idMap.getUuid(blockerTodoId, EntityType.TODO);
    
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
  getBlockersForTodo(todoId: string, username: string): Todo[] {
    // Verify the todo belongs to the user
    const todo = this.getTodo(todoId, username);
    if (!todo) return [];
    
    const db = this.db;
    const stmt = db.prepare(`
      SELECT t.* FROM todos t
      INNER JOIN todo_dependencies td ON t.id = td.blocker_todo_id
      WHERE td.blocked_todo_id = ?
      ORDER BY t.title
    `);
    
    // Convert readable ID to UUID
    const uuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!uuid) return [];
    
    const rows = stmt.all(uuid) as any[];
    
    return rows.map(row => {
      const resultTodo = this.rowToTodo(row);
      resultTodo.tagNames = this.tagSvc.getTagNames(this.getTagIds(resultTodo.id));
      // Populate projectName field
      if (resultTodo.projectId) {
        const project = this.projectSvc.getProject(resultTodo.projectId, row.username);
        resultTodo.projectName = project?.name || null;
      }
      return resultTodo;
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
  getTodosBlockedBy(todoId: string, username: string): string[] {
    // Verify the todo belongs to the user
    const todo = this.getTodo(todoId, username);
    if (!todo) return [];
    
    const db = this.db;
    const stmt = db.prepare(`
      SELECT blocked_todo_id FROM todo_dependencies
      WHERE blocker_todo_id = ?
      ORDER BY blocked_todo_id
    `);
    
    // Convert readable ID to UUID
    const uuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!uuid) return [];
    
    const rows = stmt.all(uuid) as any[];
    
    // Convert UUIDs back to task-* format
    return rows.map(row => {
      return this.idMap.getHumanReadableId(row.blocked_todo_id, EntityType.TODO);
    });
  }

  /**
   * Get all blocker IDs (in task-* format) for a todo
   * 
   * @param todoId The task-* ID of the blocked todo
   * @returns Array of blocker task-* IDs
   */
  getBlockerIds(todoId: string): string[] {
    const db = this.db;
    const stmt = db.prepare(`
      SELECT blocker_todo_id FROM todo_dependencies
      WHERE blocked_todo_id = ?
      ORDER BY blocker_todo_id
    `);
    
    // Convert readable ID to UUID
    const uuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!uuid) return [];
    
    const rows = stmt.all(uuid) as any[];
    
    // Convert UUIDs back to task-* format
    return rows.map(row => {
      return this.idMap.getHumanReadableId(row.blocker_todo_id, EntityType.TODO);
    });
  }

  /**
   * Get all tag IDs (in tag-* format) for a todo
   *
   * @param todoId The task-* ID of the todo
   * @returns Array of tag-* IDs
   */
  getTagIds(todoId: string): string[] {
    const db = this.db;
    const stmt = db.prepare(`
      SELECT tag_id FROM todo_tags
      WHERE todo_id = ?
      ORDER BY tag_id
    `);
    
    // Convert readable ID to UUID
    const uuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!uuid) return [];
    
    const rows = stmt.all(uuid) as any[];
    
    // Convert UUIDs back to tag-* format
    return rows.map(row => {
      return this.idMap.getHumanReadableId(row.tag_id, EntityType.TAG);
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
    const db = this.db;
    
    // Convert readable ID to UUID
    const uuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!uuid) return 0;
    
    // Delete both: this todo blocking others AND this todo being blocked
    const stmt = db.prepare(`
      DELETE FROM todo_dependencies
      WHERE blocked_todo_id = ? OR blocker_todo_id = ?
    `);
    
    const result = stmt.run(uuid, uuid);
    return result.changes;
  }

  /**
   * Get todos by project
   *
   * This method returns all todos that belong to a specific project.
   *
   * @param projectId The project-* ID of the project
   * @param username The username to verify ownership
   * @returns Array of Todos in the project
   */
  getTodosByProject(projectId: string, username: string): Todo[] {
    // Verify the project exists and belongs to the user
    const project = this.projectSvc.getProject(projectId, username);
    if (!project) return [];

    const db = this.db;
    const projectUuid = this.idMap.getUuid(projectId, EntityType.PROJECT);
    if (!projectUuid) return [];

    const stmt = db.prepare('SELECT * FROM todos WHERE project_id = ? ORDER BY createdAt');
    const rows = stmt.all(projectUuid) as any[];

    return rows.map(row => {
      const todo = this.rowToTodo(row);
      todo.blocked_by = this.getBlockerIds(todo.id);
      todo.tagNames = this.tagSvc.getTagNames(this.getTagIds(todo.id));
      todo.projectName = project.name;
      return todo;
    });
  }

  /**
   * Assign a todo to a project
   *
   * This method assigns a todo to a project. The todo must belong to the user,
   * and the project must also belong to the user.
   *
   * @param todoId The task-* ID of the todo to assign
   * @param projectId The project-* ID of the project
   * @param username The username to verify ownership
   * @returns true if assigned, false if not found
   */
  assignTodoToProject(todoId: string, projectId: string, username: string): boolean {
    // Verify the todo exists and belongs to the user
    const todo = this.getTodo(todoId, username);
    if (!todo) return false;

    // Verify the project exists and belongs to the user
    const project = this.projectSvc.getProject(projectId, username);
    if (!project) return false;

    const db = this.db;
    const stmt = db.prepare('UPDATE todos SET project_id = ? WHERE id = ?');

    const todoUuid = this.idMap.getUuid(todoId, EntityType.TODO);
    const projectUuid = this.idMap.getUuid(projectId, EntityType.PROJECT);

    if (!todoUuid || !projectUuid) return false;

    const result = stmt.run(projectUuid, todoUuid);
    return result.changes > 0;
  }

  /**
   * Remove a todo from its project
   *
   * This method unassigns a todo from its project by setting project_id to NULL.
   *
   * @param todoId The task-* ID of the todo to unassign
   * @param username The username to verify ownership
   * @returns true if unassigned, false if not found
   */
  removeTodoFromProject(todoId: string, username: string): boolean {
    // Verify the todo exists and belongs to the user
    const todo = this.getTodo(todoId, username);
    if (!todo) return false;

    const db = this.db;
    const stmt = db.prepare('UPDATE todos SET project_id = NULL WHERE id = ?');

    const todoUuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!todoUuid) return false;

    const result = stmt.run(todoUuid);
    return result.changes > 0;
  }
}

// Export class for testing (allows creating fresh instances with custom dependencies)
export { TodoService };

// Create a singleton instance for use throughout the application
export const todoService = new TodoService();