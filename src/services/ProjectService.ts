/**
 * ProjectService.ts
 *
 * This service implements the core business logic for managing projects using TypeORM.
 * It acts as an intermediary between the data model and the database,
 * handling all CRUD operations for projects and managing project-todo relationships.
 *
 * WHY A SERVICE LAYER?
 * - Separates business logic from database operations
 * - Provides a clean API for the application to work with
 * - Makes it easier to change the database implementation later
 * - Encapsulates complex operations into simple method calls
 */
import {
  Project,
  createProject,
  CreateProjectSchema,
  UpdateProjectSchema,
} from '../models/Project.js';
import { z } from 'zod';
import { DatabaseService, databaseService } from './DatabaseService.js';
import { IdMapService, EntityType, idMapService } from './IdMapService.js';
import { UserService, userService } from './UserService.js';
import { Like } from 'typeorm';

/**
 * ProjectService Class
 *
 * This service follows the repository pattern to provide a clean
 * interface for working with projects. It encapsulates all database
 * operations and business logic in one place.
 */
class ProjectService {
  private idMap: IdMapService;
  private userSvc: UserService;
  private dbService: DatabaseService;

  constructor(idMap?: IdMapService, userSvc?: UserService, dbService?: DatabaseService) {
    // Allow dependency injection for testing
    this.idMap = idMap || idMapService;
    this.userSvc = userSvc || userService;
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
  async createProject(data: z.infer<typeof CreateProjectSchema>): Promise<Project> {
    // Validate input data
    const validatedData = CreateProjectSchema.parse(data);

    // Get or create the user (automatic registration)
    const user = await this.userSvc.getOrCreateUser(validatedData.username);

    // Use the factory function to create a Project with proper defaults
    const project = createProject({ ...validatedData, username: user.username });

    const projectRepo = this.dbService.getProjectRepository();

    const newProject = projectRepo.create({
      id: project.id,
      username: project.username,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });

    await projectRepo.save(newProject);

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
  async getProject(id: string, username: string): Promise<Project | undefined> {
    const projectRepo = this.dbService.getProjectRepository();

    const uuid = this.idMap.getUuid(id, EntityType.PROJECT);
    if (!uuid) return undefined;

    const project = await projectRepo.findOne({ where: { id: uuid } });

    if (!project) return undefined;

    // If username is provided, check if the project belongs to that user
    const validatedUsername = (await this.userSvc.getOrCreateUser(username)).username;
    if (project.username !== validatedUsername) {
      return undefined; // User doesn't own this project
    }

    // Convert the database row to a Project object
    return this.entityToProject(project);
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
  async getAllProjects(username: string, limit?: number, offset?: number): Promise<Project[]> {
    // Get or create the user (automatic registration)
    const user = await this.userSvc.getOrCreateUser(username);

    const projectRepo = this.dbService.getProjectRepository();

    const findOptions: any = {
      where: { username: user.username },
      order: { name: 'ASC' },
    };

    // Add pagination if specified
    if (limit !== undefined) {
      findOptions.take = limit;
    }
    if (offset !== undefined) {
      findOptions.skip = offset;
    }

    const projects = await projectRepo.find(findOptions);

    // Convert each database row to a Project object
    return projects.map((project) => this.entityToProject(project));
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
  async updateProject(
    data: z.infer<typeof UpdateProjectSchema>,
    username: string
  ): Promise<Project | undefined> {
    // Validate input data
    const validatedData = UpdateProjectSchema.parse(data);

    // First check if the project exists and belongs to the user
    const project = await this.getProject(validatedData.id, username);
    if (!project) return undefined;

    // Create a timestamp for the update
    const updatedAt = new Date().toISOString();

    const projectRepo = this.dbService.getProjectRepository();
    const uuid = this.idMap.getUuid(project.id, EntityType.PROJECT);

    await projectRepo.update(
      { id: uuid },
      {
        name: validatedData.name ?? project.name,
        description: validatedData.description ?? project.description,
        updatedAt,
      }
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
  async deleteProject(id: string, username: string): Promise<boolean> {
    // First check if the project exists and belongs to the user
    const project = await this.getProject(id, username);
    if (!project) return false;

    const projectRepo = this.dbService.getProjectRepository();
    const projectUuid = this.idMap.getUuid(id, EntityType.PROJECT);
    if (!projectUuid) return false;

    // First, unassign all todos from this project
    const todoRepo = this.dbService.getTodoRepository();
    await todoRepo.update({ projectId: projectUuid }, { projectId: null });

    // Then delete the project
    const result = await projectRepo.delete({ id: projectUuid });

    if (result.affected && result.affected > 0) {
      this.idMap.unregisterMapping(id, projectUuid, EntityType.PROJECT);
    }

    // Check if any rows were affected
    return (result.affected || 0) > 0;
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
  async searchProjectsByName(name: string, username: string): Promise<Project[]> {
    // Get or create the user (automatic registration)
    const user = await this.userSvc.getOrCreateUser(username);

    // Add wildcards to the search term for partial matching
    const searchTerm = `%${name}%`;

    const projectRepo = this.dbService.getProjectRepository();

    const projects = await projectRepo.find({
      where: {
        username: user.username,
        name: Like(searchTerm),
      },
      order: { name: 'ASC' },
    });

    return projects.map((project) => this.entityToProject(project));
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
  async getTodosInProject(projectId: string, username: string): Promise<string[]> {
    // Verify the project exists and belongs to the user
    const project = await this.getProject(projectId, username);
    if (!project) return [];

    const todoRepo = this.dbService.getTodoRepository();
    const projectUuid = this.idMap.getUuid(projectId, EntityType.PROJECT);
    if (!projectUuid) return [];

    const todos = await todoRepo.find({
      where: { projectId: projectUuid },
      order: { createdAt: 'ASC' },
    });

    // Convert UUIDs back to task-* format
    return todos.map((todo) => {
      return this.idMap.getHumanReadableId(todo.id, EntityType.TODO);
    });
  }

  /**
   * Helper to convert a database entity to a Project object
   *
   * Uses IdMapService to get human-readable ID mapping.
   *
   * @param entity The database entity data
   * @returns A properly formatted Project object
   */
  private entityToProject(entity: any): Project {
    const humanReadableId = this.idMap.getHumanReadableId(entity.id, EntityType.PROJECT);
    return {
      id: humanReadableId,
      username: entity.username,
      name: entity.name,
      description: entity.description,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

// Export class for testing (allows creating fresh instances with custom dependencies)
export { ProjectService };

// Create a singleton instance for use throughout the application
export const projectService = new ProjectService();
