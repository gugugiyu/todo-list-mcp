/**
 * Project.ts
 *
 * This file defines the core data model for Projects in our Todo application.
 * Projects are containers for organizing related todos. Each project belongs to a user
 * and can contain multiple todos, but each todo can only belong to one project.
 *
 * WHY HAVE PROJECTS?
 * - Organize related tasks together (e.g., "Home Renovation", "Work Project X")
 * - Provide higher-level categorization beyond tags
 * - Enable filtering and grouping of todos by project
 * - Help users manage large todo lists by breaking them into smaller, focused groups
 */
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

/**
 * Project Interface
 *
 * This defines the structure of a Project item in our application.
 * - IDs use UUID for uniqueness across systems
 * - Timestamps track creation and updates
 * - Username links the project to its owner
 * - Name and description are required fields
 */
export interface Project {
  id: string; // Format: project-* (LLM-friendly mapping to UUID)
  username: string; // The user who owns this project
  name: string; // Project name (required)
  description: string; // Project description (required)
  createdAt: string; // ISO timestamp of creation
  updatedAt: string; // ISO timestamp of last update
}

/**
 * Input Validation Schemas
 *
 * These schemas define the requirements for different project operations.
 * Each schema serves as both documentation and runtime validation.
 */

// Schema for creating a new project - requires username, name and description
export const CreateProjectSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be less than 100 characters'),
  description: z
    .string()
    .min(1, 'Project description is required')
    .max(1000, 'Project description must be less than 1000 characters'),
});

// Schema for updating a project - requires ID, name and description are optional
export const UpdateProjectSchema = z.object({
  id: z.string().regex(/project-[\d]+/, 'Invalid project ID'),
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be less than 100 characters')
    .optional(),
  description: z
    .string()
    .min(1, 'Project description is required')
    .max(1000, 'Project description must be less than 1000 characters')
    .optional(),
});

// Schema for getting/deleting a project - requires only ID
export const ProjectIdSchema = z.object({
  id: z.string().regex(/project-[\d]+/, 'Invalid project ID'),
});

// Schema for searching projects by name - requires search term
export const SearchProjectsByNameSchema = z.object({
  name: z.string().min(1, 'Search term is required'),
});

/**
 * Factory Function: createProject
 *
 * WHY USE A FACTORY FUNCTION?
 * - Centralizes the creation logic in one place
 * - Ensures all required fields are set with proper default values
 * - Guarantees all projects have the same structure
 * - Makes it easy to change the implementation without affecting code that creates projects
 *
 * @param data The validated input data
 * @returns A fully formed Project object with generated ID and timestamps
 */
export function createProject(data: z.infer<typeof CreateProjectSchema>): Project {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    username: data.username,
    name: data.name,
    description: data.description,
    createdAt: now,
    updatedAt: now,
  };
}
