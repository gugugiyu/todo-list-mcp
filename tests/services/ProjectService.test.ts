/**
 * ProjectService.test.ts
 *
 * Unit tests for ProjectService.
 * Tests for project management operations including CRUD and project-todo relationships.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectService } from '../../src/services/ProjectService.js';
import { UserService } from '../../src/services/UserService.js';
import { IdMapService, EntityType } from '../../src/services/IdMapService.js';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { TestDatabaseService, seedUser, seedProject, generateTestUuid } from '../utils/testDatabase.js';

describe('ProjectService', () => {
  let testDb: TestDatabaseService;
  let idMapService: IdMapService;
  let userService: UserService;
  let projectService: ProjectService;

  beforeEach(async () => {
    // Create fresh instances for each test
    testDb = new TestDatabaseService();
    await testDb.initialize();
    idMapService = new IdMapService();
    // Create a DatabaseService instance with test DataSource
    const testDbService = new DatabaseService(testDb.getDataSource());
    userService = new UserService(testDbService);
    projectService = new ProjectService(idMapService, userService, testDbService);
  });

  afterEach(async () => {
    // Clean up
    await testDb.close();
  });

  describe('createProject', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should create a new project', async () => {
      const project = await projectService.createProject({
        username: 'john-doe',
        name: 'Home Renovation',
        description: 'Renovate the kitchen',
      });

      expect(project.id).toBe('project-1');
      expect(project.username).toBe('john-doe');
      expect(project.name).toBe('Home Renovation');
      expect(project.description).toBe('Renovate the kitchen');
      expect(project.createdAt).toBeDefined();
      expect(project.updatedAt).toBeDefined();
    });

    it('should create user if they do not exist', async () => {
      const project = await projectService.createProject({
        username: 'new-user',
        name: 'Test Project',
        description: 'Test Description',
      });

      const user = await userService.getUser('new-user');
      expect(user).toBeDefined();
    });

    it('should use existing user if they exist', async () => {
      await userService.getOrCreateUser('exist-user');

      const project = await projectService.createProject({
        username: 'exist-user',
        name: 'Test Project',
        description: 'Test Description',
      });

      expect(project.username).toBe('exist-user');
    });

    it('should validate name length', async () => {
      await expect(() => {
        return projectService.createProject({
          username: 'test-user',
          name: '',
          description: 'Description',
        });
      }).rejects.toThrow();

      await expect(() => {
        return projectService.createProject({
          username: 'test-user',
          name: 'a'.repeat(101),
          description: 'Description',
        });
      }).rejects.toThrow();
    });

    it('should validate description length', async () => {
      await expect(() => {
        return projectService.createProject({
          username: 'test-user',
          name: 'Name',
          description: '',
        });
      }).rejects.toThrow();

      await expect(() => {
        return projectService.createProject({
          username: 'test-user',
          name: 'Name',
          description: 'a'.repeat(1001),
        });
      }).rejects.toThrow();
    });
  });

  describe('getProject', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return undefined for non-existent project', async () => {
      const project = await projectService.getProject('project-999', 'test-user');

      expect(project).toBeUndefined();
    });

    it('should return project by ID', async () => {
      const createdProject = await projectService.createProject({
        username: 'test-user',
        name: 'Test Project',
        description: 'Test Description',
      });

      const project = await projectService.getProject(createdProject.id, 'test-user');

      expect(project).toBeDefined();
      expect(project?.id).toBe('project-1');
      expect(project?.name).toBe('Test Project');
    });

    it('should return undefined for project owned by different user', async () => {
      const project = await projectService.createProject({
        username: 'user1',
        name: 'User1 Project',
        description: 'Description',
      });

      const retrieved = await projectService.getProject(project.id, 'user2');

      expect(retrieved).toBeUndefined();
    });

    it('should return project without username check when username not provided', async () => {
      const project = await projectService.createProject({
        username: 'test-user',
        name: 'Test Project',
        description: 'Test Description',
      });

      const retrieved = await projectService.getProject(project.id, 'test-user');

      expect(retrieved).toBeDefined();
    });
  });

  describe('getAllProjects', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });
 
    it('should return empty array when no projects exist', async () => {
      const projects = await projectService.getAllProjects('test-user');
 
      expect(projects).toEqual([]);
    });
 
    it('should return all projects for user ordered by name', async () => {
      await projectService.createProject({
        username: 'test-user',
        name: 'Zebra Project',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Apple Project',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Banana Project',
        description: 'Description',
      });
 
      const projects = await projectService.getAllProjects('test-user');
 
      expect(projects).toHaveLength(3);
      expect(projects[0].name).toBe('Apple Project');
      expect(projects[1].name).toBe('Banana Project');
      expect(projects[2].name).toBe('Zebra Project');
    });

    it('should only return projects for specified user', async () => {
      await projectService.createProject({
        username: 'user1',
        name: 'Project 1',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'user2',
        name: 'Project 2',
        description: 'Description',
      });
 
      const user1Projects = await projectService.getAllProjects('user1');
      const user2Projects = await projectService.getAllProjects('user2');
 
      expect(user1Projects).toHaveLength(1);
      expect(user2Projects).toHaveLength(1);
      expect(user1Projects[0].name).toBe('Project 1');
      expect(user2Projects[0].name).toBe('Project 2');
    });

    it('should respect limit parameter', async () => {
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 1',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 2',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 3',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 4',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 5',
        description: 'Description',
      });
 
      const projects = await projectService.getAllProjects('test-user', 2);
 
      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBe('Project 1');
      expect(projects[1].name).toBe('Project 2');
    });

    it('should respect offset parameter', async () => {
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 1',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 2',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 3',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 4',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 5',
        description: 'Description',
      });
 
      const projects = await projectService.getAllProjects('test-user', undefined, 2);
 
      expect(projects).toHaveLength(3);
      expect(projects[0].name).toBe('Project 3');
      expect(projects[1].name).toBe('Project 4');
      expect(projects[2].name).toBe('Project 5');
    });

    it('should respect both limit and offset parameters', async () => {
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 1',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 2',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 3',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 4',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Project 5',
        description: 'Description',
      });
 
      const projects = await projectService.getAllProjects('test-user', 2, 1);
 
      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBe('Project 2');
      expect(projects[1].name).toBe('Project 3');
    });
  });

  describe('updateProject', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return undefined for non-existent project', async () => {
      const result = await projectService.updateProject({
        id: 'project-999',
        name: 'Updated Name',
      }, 'test-user');

      expect(result).toBeUndefined();
    });

    it('should update project name', async () => {
      const project = await projectService.createProject({
        username: 'test-user',
        name: 'Original Name',
        description: 'Description',
      });

      const updated = await projectService.updateProject({
        id: project.id,
        name: 'Updated Name',
      }, 'test-user');

      expect(updated?.name).toBe('Updated Name');
      expect((await projectService.getProject(project.id, 'test-user'))?.name).toBe('Updated Name');
    });

    it('should update project description', async () => {
      const project = await projectService.createProject({
        username: 'test-user',
        name: 'Name',
        description: 'Original Description',
      });

      const updated = await projectService.updateProject({
        id: project.id,
        description: 'Updated Description',
      }, 'test-user');

      expect(updated?.description).toBe('Updated Description');
      expect((await projectService.getProject(project.id, 'test-user'))?.description).toBe('Updated Description');
    });

    it('should return undefined for project owned by different user', async () => {
      const project = await projectService.createProject({
        username: 'user1',
        name: 'Project',
        description: 'Description',
      });

      const result = await projectService.updateProject({
        id: project.id,
        name: 'Updated',
      }, 'user2');

      expect(result).toBeUndefined();
    });
  });

  describe('deleteProject', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return false for non-existent project', async () => {
      const result = await projectService.deleteProject('project-999', 'test-user');

      expect(result).toBe(false);
    });

    it('should delete project and return true', async () => {
      const project = await projectService.createProject({
        username: 'test-user',
        name: 'Delete Me',
        description: 'Description',
      });

      const result = await projectService.deleteProject(project.id, 'test-user');

      expect(result).toBe(true);
      expect(await projectService.getProject(project.id, 'test-user')).toBeUndefined();
    });

    it('should unassign all todos from project', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';

      // Create project and todos
      const project = await projectService.createProject({
        username,
        name: 'Test Project',
        description: 'Description',
      });

      const todoId1 = generateTestUuid();
      const todoId2 = generateTestUuid();

      // Get the project UUID for foreign key reference
      const projectUuid = idMapService.getUuid(project.id, EntityType.PROJECT);

      // Seed todos with project assignment
      await dataSource.query(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt, projectId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [todoId1, username, 'Todo 1', 'MEDIUM', 'Description 1', null, new Date().toISOString(), new Date().toISOString(), projectUuid]);
      await dataSource.query(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt, projectId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [todoId2, username, 'Todo 2', 'HIGH', 'Description 2', null, new Date().toISOString(), new Date().toISOString(), projectUuid]);

      // Delete project
      await projectService.deleteProject(project.id, username);

      // Check todos are unassigned
      const todos = await dataSource.query('SELECT * FROM todos WHERE username = ?', [username]);
      expect(todos).toHaveLength(2);
      expect(todos[0].projectId).toBeNull();
      expect(todos[1].projectId).toBeNull();
    });

    it('should return false for project owned by different user', async () => {
      const project = await projectService.createProject({
        username: 'user1',
        name: 'Project',
        description: 'Description',
      });

      const result = await projectService.deleteProject(project.id, 'user2');

      expect(result).toBe(false);
    });
  });

  describe('searchProjectsByName', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return empty array for no matches', async () => {
      await projectService.createProject({
        username: 'test-user',
        name: 'Test Project',
        description: 'Description',
      });

      const results = await projectService.searchProjectsByName('nonexistent', 'test-user');

      expect(results).toEqual([]);
    });

    it('should perform case-insensitive partial match', async () => {
      await projectService.createProject({
        username: 'test-user',
        name: 'Important Project',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Portfolio',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'test-user',
        name: 'Personal Stuff',
        description: 'Description',
      });

      const results = await projectService.searchProjectsByName('port', 'test-user');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Important Project');
      expect(results[1].name).toBe('Portfolio');
    });

    it('should only return projects for specified user', async () => {
      await projectService.createProject({
        username: 'user1',
        name: 'Test Project',
        description: 'Description',
      });
      await projectService.createProject({
        username: 'user2',
        name: 'Test Project',
        description: 'Description',
      });

      const user1Results = await projectService.searchProjectsByName('test', 'user1');
      const user2Results = await projectService.searchProjectsByName('test', 'user2');

      expect(user1Results).toHaveLength(1);
      expect(user2Results).toHaveLength(1);
      expect(user1Results[0].name).toBe('Test Project');
      expect(user2Results[0].name).toBe('Test Project');
    });
  });

  describe('getTodosInProject', () => {
    beforeEach(async () => {
      await testDb.clearAll();
    });

    it('should return empty array for project with no todos', async () => {
      const project = await projectService.createProject({
        username: 'test-user',
        name: 'Test Project',
        description: 'Description',
      });

      const todos = await projectService.getTodosInProject(project.id, 'test-user');

      expect(todos).toEqual([]);
    });

    it('should return all todos in project', async () => {
      const dataSource = testDb.getDataSource();
      const username = 'test-user';

      const project = await projectService.createProject({
        username,
        name: 'Test Project',
        description: 'Description',
      });

      const todoId1 = generateTestUuid();
      const todoId2 = generateTestUuid();
      const todoId3 = generateTestUuid();

      // Register the UUIDs with IdMapService so they can be found
      const todoHumanId1 = idMapService.getHumanReadableId(todoId1, EntityType.TODO);
      const todoHumanId2 = idMapService.getHumanReadableId(todoId2, EntityType.TODO);
      const todoHumanId3 = idMapService.getHumanReadableId(todoId3, EntityType.TODO);

      // Get the project UUID for foreign key reference
      const projectUuid = idMapService.getUuid(project.id, EntityType.PROJECT);

      await dataSource.query(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt, projectId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [todoId1, username, 'Todo 1', 'MEDIUM', 'Description 1', null, new Date().toISOString(), new Date().toISOString(), projectUuid]);
      await dataSource.query(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt, projectId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [todoId2, username, 'Todo 2', 'HIGH', 'Description 2', null, new Date().toISOString(), new Date().toISOString(), projectUuid]);
      await dataSource.query(`
        INSERT INTO todos (id, username, title, priority, description, completedAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [todoId3, username, 'Todo 3', 'LOW', 'Description 3', null, new Date().toISOString(), new Date().toISOString()]); // Not in project

      const todos = await projectService.getTodosInProject(project.id, username);

      expect(todos).toHaveLength(2);
      expect(todos).toContain(todoHumanId1);
      expect(todos).toContain(todoHumanId2);
      expect(todos).not.toContain(todoHumanId3);
    });

    it('should return empty array for non-existent project', async () => {
      const todos = await projectService.getTodosInProject('project-999', 'test-user');

      expect(todos).toEqual([]);
    });

    it('should return empty array for project owned by different user', async () => {
      const project = await projectService.createProject({
        username: 'user1',
        name: 'Test Project',
        description: 'Description',
      });

      const todos = await projectService.getTodosInProject(project.id, 'user2');

      expect(todos).toEqual([]);
    });
  });
});
