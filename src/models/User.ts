/**
 * User.ts
 * 
 * This file defines the User model and validation schemas.
 * 
 * USER MODEL:
 * - username: Unique identifier for the user (case-insensitive)
 * - createdAt: Timestamp when the user was created
 * 
 * USERNAME VALIDATION:
 * - Minimum 3 characters
 * - Maximum 12 characters
 * - Alphanumeric characters and hyphens only
 * - Case-insensitive (stored in lowercase)
 */

import { z } from 'zod';

/**
 * User Schema for validation
 * 
 * This schema validates username input with the following rules:
 * - Minimum 3 characters
 * - Maximum 12 characters
 * - Alphanumeric and hyphens only (regex: ^[a-zA-Z0-9-]+$)
 * - Case-insensitive (will be normalized to lowercase)
 */
export const UsernameSchema = z.string()
  .min(3, "Username must be at least 3 characters")
  .max(12, "Username must be at most 12 characters")
  .regex(/^[a-zA-Z0-9-]+$/, "Username can only contain alphanumeric characters and hyphens")
  .transform(val => val.toLowerCase()); // Normalize to lowercase for case-insensitivity

/**
 * User interface
 * 
 * Represents a user in the system.
 */
export interface User {
  username: string;
  createdAt: string;
}

/**
 * Factory function to create a new User
 * 
 * Creates a User object with proper defaults for timestamps.
 * 
 * @param username The validated username (already lowercase)
 * @returns A new User object
 */
export function createUser(username: string): User {
  return {
    username,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Schema for creating a new user
 */
export const CreateUserSchema = UsernameSchema;

/**
 * Schema for validating username in requests
 */
export const UsernameRequestSchema = UsernameSchema;
