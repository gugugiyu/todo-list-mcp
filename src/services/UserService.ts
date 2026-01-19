/**
 * UserService.ts
 *
 * This service implements the core business logic for managing users using TypeORM.
 * It handles user registration, retrieval, and listing.
 *
 * USER MANAGEMENT:
 * - Users are automatically registered when they first use the system
 * - Usernames are case-insensitive (stored in lowercase)
 * - Username uniqueness is enforced at the database level
 */
import { User, createUser, UsernameRequestSchema } from '../models/User.js';
import { DatabaseService, databaseService } from './DatabaseService.js';

/**
 * UserService Class
 *
 * This service follows the repository pattern to provide a clean
 * interface for working with users. It encapsulates all database
 * operations and business logic in one place.
 */
class UserService {
  private dbService: DatabaseService;

  constructor(dbService?: DatabaseService) {
    // Allow dependency injection for testing
    this.dbService = dbService || databaseService;
  }

  /**
   * Get or create a user by username
   *
   * This method:
   * 1. Validates the username
   * 2. Checks if the user already exists
   * 3. Creates the user if they don't exist (automatic registration)
   * 4. Returns the User object
   *
   * @param username The username to get or create
   * @returns The User object (existing or newly created)
   */
  async getOrCreateUser(username: string): Promise<User> {
    // Validate and normalize the username
    const validatedUsername = UsernameRequestSchema.parse(username);

    const userRepo = this.dbService.getUserRepository();

    // Check if user already exists
    const existingUser = await userRepo.findOne({
      where: { username: validatedUsername },
    });

    if (existingUser) {
      // User exists, return it
      return {
        username: existingUser.username,
        createdAt: existingUser.createdAt,
      };
    }

    // User doesn't exist, create it (automatic registration)
    const user = createUser(validatedUsername);

    const newUser = userRepo.create({
      username: user.username,
      createdAt: user.createdAt,
    });

    await userRepo.save(newUser);

    return user;
  }

  /**
   * Get a user by username
   *
   * @param username The username to retrieve
   * @returns The User if found, undefined otherwise
   */
  async getUser(username: string): Promise<User | undefined> {
    // Validate and normalize the username (safeParse to handle invalid usernames gracefully)
    const result = UsernameRequestSchema.safeParse(username);
    if (!result.success) {
      return undefined; // Return undefined for invalid usernames
    }
    const validatedUsername = result.data;

    const userRepo = this.dbService.getUserRepository();
    const user = await userRepo.findOne({
      where: { username: validatedUsername },
    });

    if (!user) return undefined;

    return {
      username: user.username,
      createdAt: user.createdAt,
    };
  }

  /**
   * Get all users
   *
   * @returns Array of all Users
   */
  async getAllUsers(): Promise<User[]> {
    const userRepo = this.dbService.getUserRepository();
    const users = await userRepo.find({
      order: { createdAt: 'ASC' },
    });

    return users.map((user) => ({
      username: user.username,
      createdAt: user.createdAt,
    }));
  }

  /**
   * Check if a user exists
   *
   * @param username The username to check
   * @returns true if the user exists, false otherwise
   */
  async userExists(username: string): Promise<boolean> {
    // Validate and normalize the username (safeParse to handle invalid usernames gracefully)
    const parseResult = UsernameRequestSchema.safeParse(username);
    if (!parseResult.success) {
      return false; // Return false for invalid usernames
    }
    const validatedUsername = parseResult.data;

    const userRepo = this.dbService.getUserRepository();
    const count = await userRepo.count({
      where: { username: validatedUsername },
    });

    return count > 0;
  }

  /**
   * Delete a user and all their data
   *
   * This method removes a user and all associated todos from the database.
   * Note: Tags are shared globally and are not deleted when a user is deleted.
   *
   * @param username The username to delete
   * @returns true if deleted, false if not found
   */
  async deleteUser(username: string): Promise<boolean> {
    // Validate and normalize the username (safeParse to handle invalid usernames gracefully)
    const parseResult = UsernameRequestSchema.safeParse(username);
    if (!parseResult.success) {
      return false; // Return false for invalid usernames
    }
    const validatedUsername = parseResult.data;

    const userRepo = this.dbService.getUserRepository();

    // Delete the user (cascades to todos and projects)
    const result = await userRepo.delete({
      username: validatedUsername,
    });

    return result.affected ? result.affected > 0 : false;
  }
}

// Export class for testing (allows creating fresh instances)
export { UserService };

// Create a singleton instance for use throughout the application
export const userService = new UserService();
