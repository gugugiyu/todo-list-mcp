/**
 * ProjectService.ts
 *
 * This service implements the core business logic for managing projects.
 * It acts as an intermediary between the data model and the database,
 * handling all CRUD operations for projects and managing project-todo relationships.
 *
 * WHY A SERVICE LAYER?
 * - Separates business logic from database operations
 * - Provides a clean API for the application to work with
 * - Makes it easier to change the database implementation later
 * - Encapsulates complex operations into simple method calls
 */
import { Project, createProject, CreateProjectSchema, UpdateProjectSchema } from '../models/Project.js';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { databaseService } from './DatabaseService.js';
import { IdMapService, EntityType, idMapService } from './IdMapService.js';
import { UserService, userService } from './UserService.js';

/**
 * ProjectService Class
 *
 * This service follows the repository pattern to provide a clean
 * interface for working with projects. It encapsulates all database
 * operations and business logic in one place.
 */
class ProjectService {
  private db: Database.Database;
  private idMap: IdMapService;
  private userSvc: UserService;

  constructor(db?: Database.Database, idMap?: IdMapService, userSvc?: UserService) {
    // Allow dependency injection for testing
    this.db = db || databaseService.getDb();
    this.idMap = idMap || idMapService;
    this.userSvc = userSvc || userService;
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
   * Get the UserService instance
   * Useful for testing to verify user operations
   */
  getUserService(): UserService {
    return this.userSvc;
  }
  /**
   * Create a new project
   *
   * This method:
   * 1. Uses the factory function to create a new Project object
   * 2. Persists it to the database
   * 3. Registers the ID mapping
   * 4. Returns the created Project
   *
   * @param data Validated input data (username, name, description)
   * @returns The newly created Project
   */
  createProject(data: z.infer<typeof CreateProjectSchema>): Project {
    // Validate input data
    const validatedData = CreateProjectSchema.parse(data);

    // Get or create the user (automatic registration)
    const user = this.userSvc.getOrCreateUser(validatedData.username);

    // Use the factory function to create a Project with proper defaults
    const project = createProject({ ...validatedData, username: user.username });

    // Get the database instance
    const db = this.db;

    // Prepare the SQL statement for inserting a new project
    const stmt = db.prepare(`
      INSERT INTO projects (id, username, name, description, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Execute the statement with the project's data
    stmt.run(
      project.id,
      project.username,
      project.name,
      project.description,
      project.createdAt,
      project.updatedAt
    );

    // Register the human-readable ID mapping
    const humanReadableId = this.idMap.getHumanReadableId(project.id, EntityType.PROJECT);

    // Update the project's id to use the human-readable version
    project.id = humanReadableId;

    // Return the created project
    return project;
  }

  /**
   * Get a project by ID
   *
   * This method:
   * 1. Queries the database for a project with the given ID
   * 2. Converts the database row to a Project object if found
   *
   * @param id The project id (project-*) of the project to retrieve
   * @param username The username to verify ownership
   * @returns The Project if found, undefined otherwise
   */
  getProject(id: string, username: string): Project | undefined {
    const db = this.db;

    // Use parameterized query to prevent SQL injection
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');

    const uuid = this.idMap.getUuid(id, EntityType.PROJECT);
    if (!uuid) return undefined;

    const row = stmt.get(uuid) as any;

    // Return undefined if no project was found
    if (!row) return undefined;

    // If username is provided, check if the project belongs to that user
    const validatedUsername = this.userSvc.getOrCreateUser(username).username;
    if (row.username !== validatedUsername) {
      return undefined; // User doesn't own this project
    }

    // Convert the database row to a Project object
    return this.rowToProject(row);
  }

  /**
   * Get all projects
   *
   * This method returns all projects for a specific user with optional pagination.
   *
   * @param username The username to filter projects by
   * @param limit Maximum number of projects to return (default: all)
   * @param offset Number of projects to skip (default: 0)
   * @returns Array of Projects for the user
   */
  getAllProjects(username: string, limit?: number, offset?: number): Project[] {
    // Get or create the user (automatic registration)
    const user = this.userSvc.getOrCreateUser(username);

    const db = this.db;
    let query = 'SELECT * FROM projects WHERE username = ? ORDER BY name';
    const params: any[] = [user.username];
    
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

    // Convert each database row to a Project object
    return rows.map(row => this.rowToProject(row));
  }

  /**
   * Update a project
   *
   * This method:
   * 1. Checks if the project exists and belongs to the user
   * 2. Updates the specified fields
   * 3. Returns the updated project
   *
   * @param data The update data (id required, name/description optional)
   * @param username The username to verify ownership
   * @returns The updated Project if found, undefined otherwise
   */
  updateProject(data: z.infer<typeof UpdateProjectSchema>, username: string): Project | undefined {
    // Validate input data
    const validatedData = UpdateProjectSchema.parse(data);

    // First check if the project exists and belongs to the user
    const project = this.getProject(validatedData.id, username);
    if (!project) return undefined;

    // Create a timestamp for the update
    const updatedAt = new Date().toISOString();

    const db = this.db;
    const stmt = db.prepare(`
      UPDATE projects
      SET name = ?, description = ?, updatedAt = ?
      WHERE id = ?
    `);

    // Update with new values or keep existing ones if not provided
    const uuid = this.idMap.getUuid(project.id, EntityType.PROJECT);
    stmt.run(
      validatedData.name ?? project.name,
      validatedData.description ?? project.description,
      updatedAt,
      uuid
    );

    // Return the updated project
    return this.getProject(validatedData.id, username);
  }

  /**
   * Delete a project
   *
   * This method removes a project from the database permanently.
   * Associated todos are unassigned (project_id set to NULL) rather than deleted.
   *
   * @param id The project-* ID of the project to delete
   * @param username The username to verify ownership
   * @returns true if deleted, false if not found or not deleted
   */
  deleteProject(id: string, username: string): boolean {
    // First check if the project exists and belongs to the user
    const project = this.getProject(id, username);
    if (!project) return false;

    const db = this.db;

    // First, unassign all todos from this project
    const unassignStmt = db.prepare('UPDATE todos SET project_id = NULL WHERE project_id = ?');
    const projectUuid = this.idMap.getUuid(id, EntityType.PROJECT);
    if (!projectUuid) return false;
    unassignStmt.run(projectUuid);

    // Then delete the project
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(projectUuid);

    if (result.changes > 0) {
      this.idMap.unregisterMapping(id, projectUuid, EntityType.PROJECT);
    }

    // Check if any rows were affected
    return result.changes > 0;
  }

  /**
   * Search projects by name
   *
   * This method performs a case-insensitive partial match search
   * on project names for a specific user.
   *
   * @param name The search term to look for in project names
   * @param username The username to filter projects by
   * @returns Array of matching Projects
   */
  searchProjectsByName(name: string, username: string): Project[] {
    // Get or create the user (automatic registration)
    const user = this.userSvc.getOrCreateUser(username);

    // Add wildcards to the search term for partial matching
    const searchTerm = `%${name}%`;

    const db = this.db;

    // COLLATE NOCASE makes the search case-insensitive
    const stmt = db.prepare('SELECT * FROM projects WHERE username = ? AND name COLLATE NOCASE LIKE ? ORDER BY name');
    const rows = stmt.all(user.username, searchTerm) as any[];

    return rows.map(row => this.rowToProject(row));
  }

  /**
   * Get all todos in a project
   *
   * This method returns all todo IDs that belong to a specific project.
   *
   * @param projectId The project-* ID of the project
   * @param username The username to verify ownership
   * @returns Array of todo IDs (task-*) in the project
   */
  getTodosInProject(projectId: string, username: string): string[] {
    // Verify the project exists and belongs to the user
    const project = this.getProject(projectId, username);
    if (!project) return [];

    const db = this.db;
    const stmt = db.prepare('SELECT id FROM todos WHERE project_id = ? ORDER BY createdAt');

    const projectUuid = this.idMap.getUuid(projectId, EntityType.PROJECT);
    if (!projectUuid) return [];

    const rows = stmt.all(projectUuid) as any[];

    // Convert UUIDs back to task-* format
    return rows.map(row => {
      return this.idMap.getHumanReadableId(row.id, EntityType.TODO);
    });
  }

  /**
   * Helper to convert a database row to a Project object
   *
   * Uses IdMapService to get human-readable ID mapping.
   *
   * @param row The database row data
   * @returns A properly formatted Project object
   */
  private rowToProject(row: any): Project {
    const humanReadableId = this.idMap.getHumanReadableId(row.id, EntityType.PROJECT);
    return {
      id: humanReadableId,
      username: row.username,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}

// Export class for testing (allows creating fresh instances with custom dependencies)
export { ProjectService };

// Create a singleton instance for use throughout the application
export const projectService = new ProjectService();
