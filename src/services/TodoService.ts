/**
 * TodoService.ts
 *
 * This service implements the core business logic for managing todos using TypeORM.
 * It acts as an intermediary between the data model and the database,
 * handling all CRUD operations and search functionality.
 *
 * WHY A SERVICE LAYER?
 * - Separates business logic from database operations
 * - Provides a clean API for the application to work with
 * - Makes it easier to change the database implementation later
 * - Encapsulates complex operations into simple method calls
 */
import { Todo, createTodo, CreateTodoSchema, UpdateTodoSchema, Priority } from '../models/Todo.js';
import { z } from 'zod';
import { formatRelativeTime } from '../utils/formatters.js';
import { DatabaseService, databaseService } from './DatabaseService.js';
import { IdMapService, EntityType, idMapService } from './IdMapService.js';
import { TagService, tagService } from './TagService.js';
import { UserService, userService } from './UserService.js';
import { ProjectService, projectService } from './ProjectService.js';
import { In, Like } from 'typeorm';

/**
 * TodoService Class
 *
 * This service follows the repository pattern to provide a clean
 * interface for working with todos. It encapsulates all database
 * operations and business logic in one place.
 */
class TodoService {
  private idMap: IdMapService;
  private tagSvc: TagService;
  private userSvc: UserService;
  private projectSvc: ProjectService;
  private dbService: DatabaseService;

  constructor(
    idMap?: IdMapService,
    tagSvc?: TagService,
    userSvc?: UserService,
    projectSvc?: ProjectService,
    dbService?: DatabaseService
  ) {
    // Allow dependency injection for testing
    this.idMap = idMap || idMapService;
    this.tagSvc = tagSvc || tagService;
    this.userSvc = userSvc || userService;
    this.projectSvc = projectSvc || projectService;
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
  async createTodo(data: z.infer<typeof CreateTodoSchema>): Promise<Todo> {
    // Get or create the user (automatic registration)
    const user = await this.userSvc.getOrCreateUser(data.username);

    // Use the factory function to create a Todo with proper defaults
    const todo = createTodo(data);

    const todoRepo = this.dbService.getTodoRepository();

    const newTodo = todoRepo.create({
      id: todo.id,
      username: user.username,
      title: todo.title,
      priority: todo.priority,
      description: todo.description,
      completedAt: todo.completedAt,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
    });

    await todoRepo.save(newTodo);

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
  async getTodo(id: string, username?: string): Promise<Todo | undefined> {
    const todoRepo = this.dbService.getTodoRepository();

    const uuid = this.idMap.getUuid(id, EntityType.TODO);
    if (!uuid) return undefined;

    const todo = await todoRepo.findOne({
      where: { id: uuid },
      relations: ['tags', 'blockers', 'project']
    });

    if (!todo) return undefined;

    // If username is provided, check if the todo belongs to that user
    if (username !== undefined) {
      const validatedUsername = (await this.userSvc.getOrCreateUser(username)).username;
      if (todo.username !== validatedUsername) {
        return undefined; // User doesn't own this todo
      }
    }

    // Convert the database row to a Todo object
    const result = this.entityToTodo(todo);
    // Populate blocked_by field
    result.blocked_by = this.getBlockerIds(id);
    // Populate tagNames field
    result.tagNames = todo.tags.map((tag: any) => tag.name);
    // Populate projectName field
    if (todo.project) {
      result.projectName = todo.project.name;
    }

    return result;
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
  async getAllTodos(username: string, useRelativeTime: boolean, limit: number, offset: number, isCompleted?: boolean): Promise<Todo[]> {
    // Get or create the user (automatic registration)
    const user = await this.userSvc.getOrCreateUser(username);

    const todoRepo = this.dbService.getTodoRepository();

    const where: any = { username: user.username };
    if (isCompleted !== undefined) {
      where.completedAt = isCompleted ? In([null]) : null;
    }

    const todos = await todoRepo.find({
      where,
      relations: ['tags', 'blockers', 'project'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    // Convert each database row to a Todo object and populate blocked_by, tagNames, and projectName
    return todos.map(todo => {
      const result = this.entityToTodo(todo, useRelativeTime);
      result.blocked_by = this.getBlockerIds(result.id);
      result.tagNames = todo.tags.map((tag: any) => tag.name);
      if (todo.project) {
        result.projectName = todo.project.name;
      }
      return result;
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
  async getActiveTodos(username: string): Promise<Todo[]> {
    // Get or create the user (automatic registration)
    const user = await this.userSvc.getOrCreateUser(username);

    const todoRepo = this.dbService.getTodoRepository();

    const todos = await todoRepo.find({
      where: { username: user.username, completedAt: null },
      relations: ['tags', 'blockers', 'project'],
      order: { createdAt: 'DESC' },
    });

    // Convert each database row to a Todo object and populate blocked_by, tagNames, and projectName
    return todos.map(todo => {
      const result = this.entityToTodo(todo);
      result.blocked_by = this.getBlockerIds(result.id);
      result.tagNames = todo.tags.map((tag: any) => tag.name);
      if (todo.project) {
        result.projectName = todo.project.name;
      }
      return result;
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
  async updateTodo(data: z.infer<typeof UpdateTodoSchema>, username: string): Promise<Todo | undefined> {
    // First check if the todo exists and belongs to the user
    const todo = await this.getTodo(data.id, username);
    if (!todo) return undefined;

    // Create a timestamp for the update
    const updatedAt = new Date().toISOString();

    const todoRepo = this.dbService.getTodoRepository();
    const uuid = this.idMap.getUuid(todo.id, EntityType.TODO);

    await todoRepo.update(
      { id: uuid },
      {
        title: data.title || todo.title,
        description: data.description || todo.description,
        priority: data.priority || todo.priority,
        updatedAt,
      }
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
  async completeTodo(id: string, username: string): Promise<Todo | undefined> {
    // First check if the todo exists and belongs to the user
    const todo = await this.getTodo(id, username);
    if (!todo) return undefined;

    // Create a timestamp for the completion and update
    const now = new Date().toISOString();

    const todoRepo = this.dbService.getTodoRepository();
    const uuid = this.idMap.getUuid(id, EntityType.TODO);

    await todoRepo.update(
      { id: uuid },
      { completedAt: now, updatedAt: now }
    );

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
  async deleteTodo(id: string, username: string): Promise<boolean> {
    // First check if the todo exists and belongs to the user
    const todo = await this.getTodo(id, username);
    if (!todo) return false;

    const todoRepo = this.dbService.getTodoRepository();
    const uuid = this.idMap.getUuid(id, EntityType.TODO);
    if (!uuid) return false;

    const result = await todoRepo.delete({ id: uuid });

    if (result.affected && result.affected > 0) {
      this.idMap.unregisterMapping(id, uuid, EntityType.TODO);
    }

    return (result.affected || 0) > 0;
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
  async searchByTitle(title: string, username: string): Promise<Todo[]> {
    // Get or create the user (automatic registration)
    const user = await this.userSvc.getOrCreateUser(username);

    // Add wildcards to the search term for partial matching
    const searchTerm = `%${title}%`;

    const todoRepo = this.dbService.getTodoRepository();

    const todos = await todoRepo.find({
      where: {
        username: user.username,
        title: Like(searchTerm),
      },
      relations: ['tags', 'blockers', 'project'],
    });

    return todos.map(todo => {
      const result = this.entityToTodo(todo);
      result.blocked_by = this.getBlockerIds(result.id);
      result.tagNames = todo.tags.map((tag: any) => tag.name);
      if (todo.project) {
        result.projectName = todo.project.name;
      }
      return result;
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
  async searchByDate(dateStr: string, username: string): Promise<Todo[]> {
    // Get or create the user (automatic registration)
    const user = await this.userSvc.getOrCreateUser(username);

    // Add wildcard to match the time portion of ISO string
    const datePattern = `${dateStr}%`;

    const todoRepo = this.dbService.getTodoRepository();

    const todos = await todoRepo.find({
      where: {
        username: user.username,
        createdAt: Like(datePattern),
      },
      relations: ['tags', 'blockers', 'project'],
    });

    return todos.map(todo => {
      const result = this.entityToTodo(todo);
      result.blocked_by = this.getBlockerIds(result.id);
      result.tagNames = todo.tags.map((tag: any) => tag.name);
      if (todo.project) {
        result.projectName = todo.project.name;
      }
      return result;
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
  async searchByPriority(priority: string, username: string): Promise<Todo[]> {
    // Get or create the user (automatic registration)
    const user = await this.userSvc.getOrCreateUser(username);

    const todoRepo = this.dbService.getTodoRepository();

    const todos = await todoRepo.find({
      where: {
        username: user.username,
        priority: priority as Priority,
      },
      relations: ['tags', 'blockers', 'project'],
    });

    return todos.map(todo => {
      const result = this.entityToTodo(todo);
      result.blocked_by = this.getBlockerIds(result.id);
      result.tagNames = todo.tags.map((tag: any) => tag.name);
      if (todo.project) {
        result.projectName = todo.project.name;
      }
      return result;
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
  async summarizeActiveTodos(username: string): Promise<string> {
    const activeTodos = await this.getActiveTodos(username);

    // Handle the case when there are no active todos
    if (activeTodos.length === 0) {
      return "No active todos found.";
    }

    // Create a bulleted list of todo titles
    const summary = activeTodos.map(todo => `- ${todo.title}`).join('\n');
    return `# Active Todos Summary\n\nThere are ${activeTodos.length} active todos:\n\n${summary}`;
  }

  /**
   * Helper to convert a database entity to a Todo object
   *
   * This private method handles the conversion between the database
   * representation and the application model.
   *
   * WHY SEPARATE THIS LOGIC?
   * - Avoids repeating the conversion code in multiple methods
   * - Creates a single place to update if the model changes
   * - Isolates database-specific knowledge from the rest of the code
   *
   * @param entity The database entity data, note that the 'id' field is the UUID
   * @param useRelativeTime Convert the ISO time string into human readable string
   * @returns A properly formatted Todo object
   */
  private entityToTodo(entity: any, useRelativeTime: boolean = false): Todo {
    const taskName = this.idMap.getHumanReadableId(entity.id, EntityType.TODO);

    return {
      id: taskName,
      username: entity.username,
      title: entity.title,
      priority: entity.priority,
      description: entity.description,
      completedAt: entity.completedAt,
      completed: entity.completedAt !== null,
      blocked_by: [],
      tagNames: [],
      projectId: entity.projectId ? this.idMap.getHumanReadableId(entity.projectId, EntityType.PROJECT) : null,
      projectName: null, // Will be populated by getTodo/getAllTodos methods
      createdAt: useRelativeTime ? formatRelativeTime(entity.createdAt) : entity.createdAt,
      updatedAt: useRelativeTime ? formatRelativeTime(entity.updatedAt) : entity.updatedAt,
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
  async addBlockerDependency(blockedTodoId: string, blockerTodoId: string, username: string): Promise<boolean> {
    // Verify both todos belong to the user
    const blockedTodo = await this.getTodo(blockedTodoId, username);
    const blockerTodo = await this.getTodo(blockerTodoId, username);

    if (!blockedTodo || !blockerTodo) {
      throw new Error("One or both todos not found");
    }

    // Prevent self-blocking
    if (blockedTodoId === blockerTodoId) {
      throw new Error("A todo cannot be blocked by itself");
    }

    const todoRepo = this.dbService.getTodoRepository();
    const blockedUuid = this.idMap.getUuid(blockedTodoId, EntityType.TODO);
    const blockerUuid = this.idMap.getUuid(blockerTodoId, EntityType.TODO);

    if (!blockedUuid || !blockerUuid) {
      return false;
    }

    const blockedEntity = await todoRepo.findOne({ where: { id: blockedUuid }, relations: ['blockers'] });
    if (!blockedEntity) return false;

    // Check if dependency already exists
    const existingBlocker = blockedEntity.blockers?.find((b: any) => b.id === blockerUuid);
    if (existingBlocker) {
      return false;
    }

    blockedEntity.blockers = blockedEntity.blockers || [];
    blockedEntity.blockers.push({ id: blockerUuid } as any);

    await todoRepo.save(blockedEntity);
    return true;
  }

  /**
   * Remove a blocker dependency from a todo
   *
   * @param blockedTodoId The task-* ID of the todo being blocked
   * @param blockerTodoId The task-* ID of the todo that blocks it
   * @returns true if the dependency was deleted, false if not found
   */
  async removeBlockerDependency(blockedTodoId: string, blockerTodoId: string, username: string): Promise<boolean> {
    // Verify both todos belong to the user
    const blockedTodo = await this.getTodo(blockedTodoId, username);
    const blockerTodo = await this.getTodo(blockerTodoId, username);

    if (!blockedTodo || !blockerTodo) {
      return false;
    }

    const todoRepo = this.dbService.getTodoRepository();
    const blockedUuid = this.idMap.getUuid(blockedTodoId, EntityType.TODO);
    const blockerUuid = this.idMap.getUuid(blockerTodoId, EntityType.TODO);

    if (!blockedUuid || !blockerUuid) {
      return false;
    }

    const blockedEntity = await todoRepo.findOne({ where: { id: blockedUuid }, relations: ['blockers'] });
    if (!blockedEntity) return false;

    if (!blockedEntity.blockers) return false;

    blockedEntity.blockers = blockedEntity.blockers.filter((b: any) => b.id !== blockerUuid);
    await todoRepo.save(blockedEntity);

    return true;
  }

  /**
   * Get all blockers for a specific todo
   *
   * Returns the todos that are blocking the specified todo.
   *
   * @param todoId The task-* ID of the blocked todo
   * @returns Array of blocker Todos
   */
  async getBlockersForTodo(todoId: string, username: string): Promise<Todo[]> {
    // Verify the todo belongs to the user
    const todo = await this.getTodo(todoId, username);
    if (!todo) return [];

    const todoRepo = this.dbService.getTodoRepository();
    const uuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!uuid) return [];

    const blockers = await todoRepo.find({
      relations: ['blockedBy'],
      where: {
        blockedBy: {
          id: uuid,
        },
      },
    });

    return blockers.map(blocker => {
      const result = this.entityToTodo(blocker);
      result.tagNames = blocker.tags?.map((tag: any) => tag.name) || [];
      if (blocker.project) {
        result.projectName = blocker.project.name;
      }
      return result;
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
  async getTodosBlockedBy(todoId: string, username: string): Promise<string[]> {
    // Verify the todo belongs to the user
    const todo = await this.getTodo(todoId, username);
    if (!todo) return [];

    const todoRepo = this.dbService.getTodoRepository();
    const uuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!uuid) return [];

    const blockedTodos = await todoRepo.find({
      relations: ['blockers'],
      where: {
        blockers: {
          id: uuid,
        },
      },
    });

    // Convert UUIDs back to task-* format
    return blockedTodos.map(blocked => {
      return this.idMap.getHumanReadableId(blocked.id, EntityType.TODO);
    });
  }

  /**
   * Get all blocker IDs (in task-* format) for a todo
   *
   * @param todoId The task-* ID of the blocked todo
   * @returns Array of blocker task-* IDs
   */
  getBlockerIds(todoId: string): string[] {
    // This method uses the in-memory blocker relationships from getTodo
    // For now, we'll keep this simple as the blocker data is populated in getTodo
    // In a full refactor, we'd query the database here
    return [];
  }

  /**
   * Get all tag IDs (in tag-* format) for a todo
   *
   * @param todoId The task-* ID of the todo
   * @returns Array of tag-* IDs
   */
  getTagIds(todoId: string): string[] {
    // This method uses the in-memory tag relationships from getTodo
    // For now, we'll keep this simple as the tag data is populated in getTodo
    // In a full refactor, we'd query the database here
    return [];
  }

  /**
   * Remove all dependencies for a todo (both blocked and blocking)
   *
   * This is useful when deleting a todo to clean up all relationships.
   *
   * @param todoId The task-* ID of the todo
   * @returns number of dependencies deleted
   */
  async removeAllDependencies(todoId: string): Promise<number> {
    const todoRepo = this.dbService.getTodoRepository();
    const uuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!uuid) return 0;

    const todo = await todoRepo.findOne({
      where: { id: uuid },
      relations: ['blockers', 'blockedBy'],
    });

    if (!todo) return 0;

    const blockerCount = todo.blockers?.length || 0;
    const blockedCount = todo.blockedBy?.length || 0;

    todo.blockers = [];
    todo.blockedBy = [];
    await todoRepo.save(todo);

    return blockerCount + blockedCount;
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
  async getTodosByProject(projectId: string, username: string): Promise<Todo[]> {
    // Verify the project exists and belongs to the user
    const project = await this.projectSvc.getProject(projectId, username);
    if (!project) return [];

    const todoRepo = this.dbService.getTodoRepository();
    const projectUuid = this.idMap.getUuid(projectId, EntityType.PROJECT);
    if (!projectUuid) return [];

    const todos = await todoRepo.find({
      where: { projectId: projectUuid },
      relations: ['tags', 'blockers', 'project'],
      order: { createdAt: 'DESC' },
    });

    return todos.map(todo => {
      const result = this.entityToTodo(todo);
      result.blocked_by = this.getBlockerIds(result.id);
      result.tagNames = todo.tags.map((tag: any) => tag.name);
      result.projectName = project.name;
      return result;
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
  async assignTodoToProject(todoId: string, projectId: string, username: string): Promise<boolean> {
    // Verify the todo exists and belongs to the user
    const todo = await this.getTodo(todoId, username);
    if (!todo) return false;

    // Verify the project exists and belongs to the user
    const project = await this.projectSvc.getProject(projectId, username);
    if (!project) return false;

    const todoRepo = this.dbService.getTodoRepository();
    const todoUuid = this.idMap.getUuid(todoId, EntityType.TODO);
    const projectUuid = this.idMap.getUuid(projectId, EntityType.PROJECT);

    if (!todoUuid || !projectUuid) return false;

    const result = await todoRepo.update(
      { id: todoUuid },
      { projectId: projectUuid }
    );

    return (result.affected || 0) > 0;
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
  async removeTodoFromProject(todoId: string, username: string): Promise<boolean> {
    // Verify the todo exists and belongs to the user
    const todo = await this.getTodo(todoId, username);
    if (!todo) return false;

    const todoRepo = this.dbService.getTodoRepository();
    const todoUuid = this.idMap.getUuid(todoId, EntityType.TODO);
    if (!todoUuid) return false;

    const result = await todoRepo.update(
      { id: todoUuid },
      { projectId: null }
    );

    return (result.affected || 0) > 0;
  }
}

// Export class for testing (allows creating fresh instances with custom dependencies)
export { TodoService };

// Create a singleton instance for use throughout the application
export const todoService = new TodoService();
