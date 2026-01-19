/**
 * Tag.ts
 *
 * This file defines the core data model for Tags in our Todo application.
 * Tags can be associated with multiple todos, and todos can have multiple tags
 * (N-N relationship). Tags are used to organize and categorize todos.
 */
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

/**
 * Tag Interface
 *
 * This defines the structure of a Tag item in our application.
 * - IDs use UUID for uniqueness across systems
 * - Timestamps track creation and updates
 * - Color is optional for visual organization
 */
export interface Tag {
  id: string;
  name: string;
  color?: string; // Optional color code for UI (e.g., "#FF5733")
  createdAt: string;
  updatedAt: string;
}

/**
 * Input Validation Schemas
 *
 * These schemas define the requirements for different tag operations.
 */

// Schema for creating a new tag
export const CreateTagSchema = z.object({
  name: z
    .string()
    .min(1, 'Tag name is required')
    .min(1)
    .max(50, 'Tag name must be less than 50 characters'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color code')
    .optional(),
});

// Schema for updating a tag
export const UpdateTagSchema = z.object({
  id: z.string().regex(/tag-[\d]+/, 'Invalid tag ID'),
  name: z
    .string()
    .min(1, 'Tag name is required')
    .max(50, 'Tag name must be less than 50 characters')
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color code')
    .optional(),
});

// Schema for getting/deleting a tag
export const TagIdSchema = z.object({
  id: z.string().regex(/tag-[\d]+/, 'Invalid tag ID'),
});

// Schema for tag-todo relationship operations
export const TagTodoSchema = z.object({
  tagId: z.string().regex(/tag-[\d]+/, 'Invalid tag ID'),
  todoId: z.string().regex(/task-[\d]+/, 'Invalid todo ID'),
});

/**
 * Factory Function: createTag
 *
 * This function creates a new Tag object with:
 * - A unique UUID
 * - Current timestamps (ISO format)
 * - The provided name and optional color
 *
 * WHY USE A FACTORY?
 * - Ensures all tags have required fields
 * - Centralizes UUID generation
 * - Makes timestamp handling consistent
 * - Provides a clear contract for tag creation
 *
 * @param data The input data (name and optional color)
 * @returns A new Tag object
 */
export function createTag(data: z.infer<typeof CreateTagSchema>): Tag {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    name: data.name,
    color: data.color,
    createdAt: now,
    updatedAt: now,
  };
}
