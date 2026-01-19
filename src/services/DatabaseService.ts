/**
 * DatabaseService.ts
 *
 * This file implements a database service for the Todo application using TypeORM.
 *
 * WHY TYPEORM?
 * - TypeORM is a popular ORM for TypeScript/Node.js
 * - Provides type-safe database operations
 * - Supports migrations, relationships, and complex queries
 * - Works with SQLite and other databases
 */
import { AppDataSource } from '../data-source.js';
import { DataSource } from 'typeorm';

/**
 * DatabaseService Class
 *
 * This service manages the TypeORM DataSource and provides access to repositories.
 * It follows the singleton pattern to ensure only one database connection exists.
 *
 * WHY SINGLETON PATTERN?
 * - Prevents multiple database connections which could lead to conflicts
 * - Provides a central access point to the database throughout the application
 * - Makes it easier to manage connection lifecycle (open/close)
 */
class DatabaseService {
  private dataSource: DataSource;

  constructor(dataSource?: DataSource) {
    // Allow dependency injection for testing
    // If no DataSource is provided, use the production AppDataSource
    this.dataSource = dataSource || AppDataSource;
  }

  /**
   * Get the DataSource instance
   *
   * This allows other services to access the DataSource for operations.
   *
   * @returns The TypeORM DataSource instance
   */
  getDataSource() {
    return this.dataSource;
  }

  /**
   * Get the User repository
   *
   * @returns The User repository
   */
  getUserRepository() {
    return this.dataSource.getRepository('User');
  }

  /**
   * Get the Todo repository
   *
   * @returns The Todo repository
   */
  getTodoRepository() {
    return this.dataSource.getRepository('Todo');
  }

  /**
   * Get the Tag repository
   *
   * @returns The Tag repository
   */
  getTagRepository() {
    return this.dataSource.getRepository('Tag');
  }

  /**
   * Get the Project repository
   *
   * @returns The Project repository
   */
  getProjectRepository() {
    return this.dataSource.getRepository('Project');
  }

  /**
   * Get the TodoDependency repository
   *
   * @returns The TodoDependency repository
   */
  getTodoDependencyRepository() {
    return this.dataSource.getRepository('TodoDependency');
  }

  /**
   * Close the database connection
   *
   * This should be called when shutting down the application to ensure
   * all data is properly saved and resources are released.
   */
  async close(): Promise<void> {
    await this.dataSource.destroy();
  }
}

// Export the class for testing (allows creating fresh instances with custom DataSource)
export { DatabaseService };

// Create a singleton instance that will be used throughout the application
export const databaseService = new DatabaseService();
