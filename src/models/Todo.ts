/**
 * Todo.ts
 * 
 * This file defines the core data model for our Todo application, along with validation
 * schemas and a factory function for creating new Todo instances.
 * 
 * WHY USE ZOD?
 * - Zod provides runtime type validation, ensuring our data meets specific requirements
 * - Using schemas creates a clear contract for each operation's input requirements
 * - Error messages are automatically generated with clear validation feedback
 * - TypeScript integration gives us both compile-time and runtime type safety
 * - Schemas can be converted to JSON Schema, which is useful for MCP clients
 */
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';


export enum Priority {
  URGENT = "URGENT",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  LOWEST = "LOWEST",
}

/**
 * Todo Interface
 *
 * This defines the structure of a Todo item in our application.
 * We've designed it with several important considerations:
 * - IDs use UUID for uniqueness across systems
 * - Timestamps track creation and updates for data lifecycle management
 * - Description supports markdown for rich text formatting
 * - Completion status is tracked both as a boolean flag and with a timestamp
 * - blocked_by field tracks task dependencies (uses task-* IDs for LLM-friendliness)
 * - tags field tracks associated tags (uses tag-* IDs for LLM-friendliness)
 */
export interface Todo {
  id: string;
  priority: Priority;
  title: string;
  description: string; // Markdown format
  completed: boolean; // Computed from completedAt for backward compatibility
  completedAt: string | null; // ISO timestamp when completed, null if not completed
  blocked_by: string[]; // Array of task-* IDs that block this todo
  tags: string[]; // Array of tag-* IDs assigned to this todo
  tagNames: string[]; // Array of tag names for display
  createdAt: string;
  updatedAt: string;
}

/**
 * Input Validation Schemas
 * 
 * These schemas define the requirements for different operations.
 * Each schema serves as both documentation and runtime validation.
 * 
 * WHY SEPARATE SCHEMAS?
 * - Different operations have different validation requirements
 * - Keeps validation focused on only what's needed for each operation
 * - Makes the API more intuitive by clearly defining what each operation expects
 */

// Schema for creating a new todo - requires title and description
export const CreateTodoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  priority: z.nativeEnum(Priority, {"message": "Invalid priority value"})
});

// Schema for updating a todo - requires ID, title and description are optional
export const UpdateTodoSchema = z.object({
  id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().min(1, "Description is required").optional(),
  priority: z.nativeEnum(Priority, {"message": "Invalid priority value"}).optional()
});

// Schema for completing a todo - requires only ID
export const CompleteTodoSchema = z.object({
  id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
});

// Schema for deleting a todo - requires only ID
export const DeleteTodoSchema = z.object({
  id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
});

// Schema for searching todos by title - requires search term
export const SearchTodosByTitleSchema = z.object({
  title: z.string().min(1, "Search term is required"),
});

// Schema for searching todos by date - requires date in YYYY-MM-DD format
export const SearchTodosByDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
});

// Schema for searching with a specific priority
export const SearchByPrioritySchema = z.object({
  priority: z.nativeEnum(Priority, {"message": "Invalid priority value"}),
})

/**
 * Factory Function: createTodo
 * 
 * WHY USE A FACTORY FUNCTION?
 * - Centralizes the creation logic in one place
 * - Ensures all required fields are set with proper default values
 * - Guarantees all todos have the same structure
 * - Makes it easy to change the implementation without affecting code that creates todos
 * 
 * @param data The validated input data
 * @returns A fully formed Todo object with generated ID and timestamps
 */
export function createTodo(data: z.infer<typeof CreateTodoSchema>): Todo {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    title: data.title,
    priority: data.priority,
    description: data.description,
    completed: false,
    completedAt: null,
    blocked_by: [],
    tags: [],
    tagNames: [],
    createdAt: now,
    updatedAt: now,
  };
}