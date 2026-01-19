/**
 * index.ts
 * 
 * This is the main entry point for the Todo MCP server.
 * It defines all the tools provided by the server and handles
 * connecting to clients.
 * 
 * WHAT IS MCP?
 * The Model Context Protocol (MCP) allows AI models like Claude
 * to interact with external tools and services. This server implements
 * the MCP specification to provide a Todo list functionality that
 * Claude can use.
 * 
 * HOW THE SERVER WORKS:
 * 1. It creates an MCP server instance with identity information
 * 2. It defines a set of tools for managing todos
 * 3. It connects to a transport (stdio in this case)
 * 4. It handles incoming tool calls from clients (like Claude)
 */
import 'reflect-metadata';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initializeDataSource, closeDataSource } from "./data-source.js";

// Import models and schemas
import {
  CreateTodoSchema,
  UpdateTodoSchema,
  CompleteTodoSchema,
  DeleteTodoSchema,
  SearchTodosByTitleSchema,
  SearchTodosByDateSchema,
  Priority,
  SearchByPrioritySchema
} from "./models/Todo.js";

import {
  CreateTagSchema,
  UpdateTagSchema,
  TagIdSchema,
  TagTodoSchema
} from "./models/Tag.js";

import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectIdSchema,
  SearchProjectsByNameSchema
} from "./models/Project.js";

// Import services
import { todoService } from "./services/TodoService.js";
import { databaseService } from "./services/DatabaseService.js";
import { tagService } from "./services/TagService.js";
import { userService } from "./services/UserService.js";
import { projectService } from "./services/ProjectService.js";

// Import utilities
import { createSuccessResponse, createErrorResponse, formatTodo, formatTodoList, formatTag, formatTagList, formatTagNames, formatProject, formatProjectList } from "./utils/formatters.js";
import { config } from "./config.js";

/**
 * Create the MCP server
 * 
 * We initialize with identity information that helps clients
 * understand what they're connecting to.
 */
const server = new McpServer({
  name: "Todo-MCP-Server",
  version: "1.0.1",
});

/**
 * Helper function to safely execute operations
 * 
 * This function:
 * 1. Attempts to execute an operation
 * 2. Catches any errors
 * 3. Returns either the result or an Error object
 * 
 * WHY USE THIS PATTERN?
 * - Centralizes error handling
 * - Prevents crashes from uncaught exceptions
 * - Makes error reporting consistent across all tools
 * - Simplifies the tool implementations
 * 
 * @param operation The function to execute
 * @param errorMessage The message to include if an error occurs
 * @returns Either the operation result or an Error
 */
async function safeExecute<T>(operation: () => T | Promise<T>, errorMessage: string): Promise<T | Error> {
  try {
    const result = await operation();
    return result;
  } catch (error) {
    console.error(errorMessage, error);
    if (error instanceof Error) {
      return new Error(`${errorMessage}: ${error.message}`);
    }
    return new Error(errorMessage);
  }
}

/**
 * Tool 1: Create a new todo
 * 
 * This tool:
 * 1. Validates the input (title and description)
 * 2. Creates a new todo using the service
 * 3. Returns the formatted todo
 * 
 * PATTERN FOR ALL TOOLS:
 * - Register with server.tool()
 * - Define name, description, and parameter schema
 * - Implement the async handler function
 * - Use safeExecute for error handling
 * - Return properly formatted response
 */
server.tool(
  "create-todo",
  "Create a new todo item",
  {
    username: z.string().min(1, "Username is required"),
    title: z.string().min(1, "Title is required"),
    description: z.string().min(1, "Description is required"),
    priority: z.nativeEnum(Priority, {"message": "Invalid priority value"})
  },
  async ({ username, title, description, priority }) => {
    const result = await safeExecute(async () => {
      const validatedData = CreateTodoSchema.parse({ username, title, description, priority });
      const newTodo = await todoService.createTodo(validatedData);
      return formatTodo(newTodo);
    }, "Failed to create todo");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ Todo Created:\n\n${result}`);
  }
);

/**
 * Tool 2: List all todos
 *
 * This tool:
 * 1. Retrieves todos from the service with optional filtering
 * 2. Formats them as a list
 * 3. Returns the formatted list
 *
 * The isCompleted parameter allows filtering:
 * - true: only completed todos
 * - false: only active (non-completed) todos
 * - undefined: all todos
 */
server.tool(
  "list-todos",
  "List all todos with optional filtering by completion status",
  {
    username: z.string().min(1, "Username is required"),
    useRelativeTime: z.boolean().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    isCompleted: z.boolean().optional()
  },
  async ({ username, useRelativeTime, limit, offset, isCompleted }) => {
    const result = await safeExecute(async () => {
      const todos = await todoService.getAllTodos(
        username,
        useRelativeTime || false,
        limit || 100,
        offset || 0,
        isCompleted
      );
      return formatTodoList(todos);
    }, "Failed to list todos");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 3: Get a specific todo by ID
 * 
 * This tool:
 * 1. Validates the input ID
 * 2. Retrieves the specific todo
 * 3. Returns the formatted todo
 */
server.tool(
  "get-todo",
  "Get a specific todo by ID",
  {
    username: z.string().min(1, "Username is required"),
    id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
  },
  async ({ username, id }) => {
    const result = await safeExecute(async () => {
      const todo = await todoService.getTodo(id, username);
      if (!todo) {
        throw new Error(`Todo with ID ${id} not found.`);
      }
      return formatTodo(todo);
    }, "Failed to get todo");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 4: Update a todo
 * 
 * This tool:
 * 1. Validates the input (id required, title/description optional)
 * 2. Ensures at least one field is being updated
 * 3. Updates the todo using the service
 * 4. Returns the formatted updated todo
 */
server.tool(
  "update-todo",
  "Update a todo title or description",
  {
    username: z.string().min(1, "Username is required"),
    id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
    title: z.string().min(1, "Title is required").optional(),
    description: z.string().min(1, "Description is required").optional(),
    priority: z.nativeEnum(Priority, {"message": "Invalid priority value"}).optional(),
  },
  async ({ username, id, title, description, priority }) => {
    const result = await safeExecute(async () => {
      const validatedData = UpdateTodoSchema.parse({ id, title, description, priority });

      // Ensure at least one field is being updated
      if (!title && !description && priority === undefined) {
        throw new Error("At least one field (title, description, or priority) must be provided");
      }

      const updatedTodo = await todoService.updateTodo(validatedData, username);
      if (!updatedTodo) {
        throw new Error(`Todo with ID ${id} not found`);
      }

      return formatTodo(updatedTodo);
    }, "Failed to update todo");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ Todo Updated:\n\n${result}`);
  }
);

/**
 * Tool 5: Complete a todo
 * 
 * This tool:
 * 1. Validates the todo ID
 * 2. Marks the todo as completed using the service
 * 3. Returns the formatted completed todo
 * 
 * WHY SEPARATE FROM UPDATE?
 * - Provides a dedicated semantic action for completion
 * - Simplifies the client interaction model
 * - It's easier for the LLM to match the user intent with the completion action
 * - Makes it clear in the UI that the todo is done
 */
server.tool(
  "complete-todo",
  "Mark a todo as completed",
  {
    username: z.string().min(1, "Username is required"),
    id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
  },
  async ({ username, id }) => {
    const result = await safeExecute(async () => {
      const validatedData = CompleteTodoSchema.parse({ id });
      const completedTodo = await todoService.completeTodo(validatedData.id, username);
      
      if (!completedTodo) {
        throw new Error(`Todo with ID ${id} not found`);
      }

      return formatTodo(completedTodo);
    }, "Failed to complete todo");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ Todo Completed:\n\n${result}`);
  }
);

/**
 * Tool 6: Delete a todo
 * 
 * This tool:
 * 1. Validates the todo ID
 * 2. Retrieves the todo to be deleted (for the response)
 * 3. Deletes the todo using the service
 * 4. Returns a success message with the deleted todo's title
 */
server.tool(
  "delete-todo",
  "Delete a todo",
  {
    username: z.string().min(1, "Username is required"),
    id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
  },
  async ({ username, id }) => {
    const result = await safeExecute(async () => {
      const validatedData = DeleteTodoSchema.parse({ id });
      const todo = await todoService.getTodo(validatedData.id, username);
      
      if (!todo) {
        throw new Error(`Todo with ID ${id} not found`);
      }
      
      const success = await todoService.deleteTodo(validatedData.id, username);
      
      if (!success) {
        throw new Error(`Failed to delete todo with ID ${id}`);
      }
      
      return todo.title;
    }, "Failed to delete todo");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ Todo Deleted: "${result}"`);
  }
);

/**
 * Tool 7: Search todos by title
 * 
 * This tool:
 * 1. Validates the search term
 * 2. Searches todos by title using the service
 * 3. Returns a formatted list of matching todos
 * 
 * WHY HAVE SEARCH?
 * - Makes it easy to find specific todos when the list grows large
 * - Allows partial matching without requiring exact title
 * - Case-insensitive for better user experience
 */
server.tool(
  "search-todos-by-title",
  "Search todos by title (case insensitive partial match)",
  {
    username: z.string().min(1, "Username is required"),
    title: z.string().min(1, "Search term is required"),
  },
  async ({ username, title }) => {
    const result = await safeExecute(async () => {
      const validatedData = SearchTodosByTitleSchema.parse({ title });
      const todos = await todoService.searchByTitle(validatedData.title, username);
      return formatTodoList(todos);
    }, "Failed to search todos");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 8: Search todos by date
 * 
 * This tool:
 * 1. Validates the date format (YYYY-MM-DD)
 * 2. Searches todos created on that date
 * 3. Returns a formatted list of matching todos
 * 
 * WHY DATE SEARCH?
 * - Allows finding todos created on a specific day
 * - Useful for reviewing what was added on a particular date
 * - Complements title search for different search needs
 */
server.tool(
  "search-todos-by-date",
  "Search todos by creation date (format: YYYY-MM-DD)",
  {
    username: z.string().min(1, "Username is required"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  },
  async ({ username, date }) => {
    const result = await safeExecute(async () => {
      const validatedData = SearchTodosByDateSchema.parse({ date });
      const todos = await todoService.searchByDate(validatedData.date, username);
      return formatTodoList(todos);
    }, "Failed to search todos by date");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 9: Search todos by priority
 * 
 * This tool:
 * 1. Validates the search term
 * 2. Searches todos by priority using the service
 * 3. Returns a formatted list of matching todos
 * 
 * WHY HAVE SEARCH?
 * - Makes it easy to find specific todos when the list grows large
 * - Allows partial matching without requiring exact priority
 * - Case-insensitive for better user experience
 */
server.tool(
  "search-todos-by-priority",
  "Search todos by priority (case insensitive partial match)",
  {
    username: z.string().min(1, "Username is required"),
    priority: z.nativeEnum(Priority, {"message": "Invalid priority value"}),
  },
  async ({ username, priority }) => {
    const result = await safeExecute(async () => {
      const validatedData = SearchByPrioritySchema.parse({ priority });
      const todos = await todoService.searchByPriority(validatedData.priority, username);
      return formatTodoList(todos);
    }, "Failed to search todos");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 12: Create a new tag
 */
server.tool(
  "create-tag",
  "Create a new tag for organizing todos",
  {
    name: z.string().min(1, "Tag name is required").max(50, "Tag name must be less than 50 characters"),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color code").optional(),
  },
  async ({ name, color }) => {
    const result = await safeExecute(async () => {
      const validatedData = CreateTagSchema.parse({ name, color });
      const newTag = await tagService.createTag(validatedData);
      return formatTag(newTag);
    }, "Failed to create tag");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ Tag Created:\n\n${result}`);
  }
);

/**
 * Tool 13: List all tags
 */
server.tool(
  "list-tags",
  "List all tags with optional pagination",
  {
    limit: z.number().optional(),
    offset: z.number().optional()
  },
  async ({ limit, offset }) => {
    const result = await safeExecute(async () => {
      const tags = await tagService.getAllTags(limit, offset);
      return formatTagList(tags);
    }, "Failed to list tags");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 14: Get tag(s) by ID(s)
 *
 * This tool retrieves one or more tags by their IDs.
 * Accepts either a single tag ID or an array of tag IDs for batch operations.
 */
server.tool(
  "get-tag",
  "Get one or more tags by ID(s) - accepts single ID or array of IDs for batch operations",
  {
    id: z.union([
      z.string().regex(/tag-[\d]+/, "Invalid tag ID"),
      z.array(z.string().regex(/tag-[\d]+/, "Invalid tag ID")).min(1, "At least one tag ID is required")
    ])
  },
  async ({ id }) => {
    const result = await safeExecute(async () => {
      const ids = Array.isArray(id) ? id : [id];
      const tags = await tagService.getTags(ids);
      
      if (tags.length === 0) {
        return "No tags found with the provided ID(s)";
      }
      
      // Return single tag format for single ID request, list for multiple
      if (ids.length === 1 && tags.length === 1) {
        return formatTag(tags[0]);
      }
      return formatTagList(tags);
    }, "Failed to get tag(s)");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 16: Update a tag
 */
server.tool(
  "update-tag",
  "Update a tag name or color",
  {
    id: z.string().regex(/tag-[\d]+/, "Invalid tag ID"),
    name: z.string().min(1, "Tag name is required").max(50, "Tag name must be less than 50 characters").optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color code").optional(),
  },
  async ({ id, name, color }) => {
    const result = await safeExecute(async () => {
      const validatedData = UpdateTagSchema.parse({ id, name, color });

      // Ensure at least one field is being updated
      if (!name && !color) {
        throw new Error("At least one field (name or color) must be provided");
      }

      const updatedTag = await tagService.updateTag(validatedData);
      if (!updatedTag) {
        throw new Error(`Tag with ID ${id} not found`);
      }

      return formatTag(updatedTag);
    }, "Failed to update tag");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ Tag Updated:\n\n${result}`);
  }
);

/**
 * Tool 17: Delete a tag
 */
server.tool(
  "delete-tag",
  "Delete a tag",
  {
    id: z.string().regex(/tag-[\d]+/, "Invalid tag ID"),
  },
  async ({ id }) => {
    const result = await safeExecute(async () => {
      const tag = await tagService.getTag(id);
      if (!tag) {
        throw new Error(`Tag with ID ${id} not found`);
      }

      const success = await tagService.deleteTag(id);
      if (!success) {
        throw new Error(`Failed to delete tag with ID ${id}`);
      }

      return tag.name;
    }, "Failed to delete tag");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ Tag Deleted: "${result}"`);
  }
);

/**
 * Tool 18: Search tags by name
 */
server.tool(
  "search-tags",
  "Search tags by name (case insensitive partial match)",
  {
    name: z.string().min(1, "Search term is required"),
  },
  async ({ name }) => {
    const result = await safeExecute(async () => {
      const tags = await tagService.searchTags(name);
      return formatTagList(tags);
    }, "Failed to search tags");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 19: Add a tag to a todo
 */
server.tool(
  "add-tag-to-todo",
  "Add a tag to a todo item",
  {
    username: z.string().min(1, "Username is required"),
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
    tagId: z.string().regex(/tag-[\d]+/, "Invalid tag ID"),
  },
  async ({ username, todoId, tagId }) => {
    const result = await safeExecute(async () => {
      // Verify todo exists and belongs to user
      const todo = await todoService.getTodo(todoId, username);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      // Verify tag exists
      const tag = await tagService.getTag(tagId);
      if (!tag) {
        throw new Error(`Tag with ID ${tagId} not found`);
      }

      const added = await tagService.addTagToTodo(todoId, tagId);
      if (!added) {
        return `Tag "${tag.name}" is already assigned to this todo`;
      }

      return `Tag "${tag.name}" added to todo "${todo.title}"`;
    }, "Failed to add tag to todo");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ ${result}`);
  }
);

/**
 * Tool 20: Remove a tag from a todo
 */
server.tool(
  "remove-tag-from-todo",
  "Remove a tag from a todo item",
  {
    username: z.string().min(1, "Username is required"),
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
    tagId: z.string().regex(/tag-[\d]+/, "Invalid tag ID"),
  },
  async ({ username, todoId, tagId }) => {
    const result = await safeExecute(async () => {
      // Verify todo exists and belongs to user
      const todo = await todoService.getTodo(todoId, username);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      // Verify tag exists
      const tag = await tagService.getTag(tagId);
      if (!tag) {
        throw new Error(`Tag with ID ${tagId} not found`);
      }

      const removed = await tagService.removeTagFromTodo(todoId, tagId);
      if (!removed) {
        return `Tag "${tag.name}" is not assigned to this todo`;
      }

      return `Tag "${tag.name}" removed from todo "${todo.title}"`;
    }, "Failed to remove tag from todo");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ ${result}`);
  }
);

/**
 * Tool 21: Get all tags for a todo
 */
server.tool(
  "get-todo-tags",
  "Get all tags associated with a todo",
  {
    username: z.string().min(1, "Username is required"),
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
  },
  async ({ username, todoId }) => {
    const result = await safeExecute(async () => {
      // Verify todo exists and belongs to user
      const todo = await todoService.getTodo(todoId, username);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      const tags = await tagService.getTagsForTodo(todoId);
      const tagNames = formatTagNames(tags);
      return `Tags for "${todo.title}": ${tagNames}`;
    }, "Failed to get tags for todo");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 22: Search todos by tag
 */
server.tool(
  "search-todos-by-tag",
  "Find all todos with a specific tag",
  {
    username: z.string().min(1, "Username is required"),
    tagId: z.string().regex(/tag-[\d]+/, "Invalid tag ID"),
  },
  async ({ username, tagId }) => {
    const result = await safeExecute(async () => {
      // Verify tag exists
      const tag = await tagService.getTag(tagId);
      if (!tag) {
        throw new Error(`Tag with ID ${tagId} not found`);
      }

      const todoIds = await tagService.getTodosWithTag(tagId);
      if (todoIds.length === 0) {
        return `No todos found with tag "${tag.name}"`;
      }

      // Get the full todo objects, filtering by username
      const todoPromises = todoIds.map((id: string) => todoService.getTodo(id, username));
      const todoResults = await Promise.all(todoPromises);
      const todos = todoResults.filter((todo): todo is any => todo !== undefined);

      return `Todos with tag "${tag.name}":\n\n${formatTodoList(todos)}`;
    }, "Failed to search todos by tag");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 23: Add a blocker dependency
 *
 * Marks that one todo is blocked by another todo.
 * The blockedTodoId cannot be completed until blockerTodoId is completed.
 */
server.tool(
  "add-blocker-dependency",
  "Mark a todo as blocked by another todo",
  {
    username: z.string().min(1, "Username is required"),
    blockedTodoId: z.string().regex(/task-[\d]+/, "Invalid blocked todo ID"),
    blockerTodoId: z.string().regex(/task-[\d]+/, "Invalid blocker todo ID"),
  },
  async ({ username, blockedTodoId, blockerTodoId }) => {
    const result = await safeExecute(async () => {
      // Verify both todos exist
      const blockedTodo = await todoService.getTodo(blockedTodoId, username);
      if (!blockedTodo) {
        throw new Error(`Todo with ID ${blockedTodoId} not found`);
      }

      const blockerTodo = await todoService.getTodo(blockerTodoId, username);
      if (!blockerTodo) {
        throw new Error(`Todo with ID ${blockerTodoId} not found`);
      }

      const added = await todoService.addBlockerDependency(blockedTodoId, blockerTodoId, username);
      if (!added) {
        return `"${blockedTodo.title}" is already blocked by "${blockerTodo.title}"`;
      }

      return `"${blockedTodo.title}" is now blocked by "${blockerTodo.title}"`;
    }, "Failed to add blocker dependency");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ ${result}`);
  }
);

/**
 * Tool 24: Remove a blocker dependency
 */
server.tool(
  "remove-blocker-dependency",
  "Remove a blocker dependency from a todo",
  {
    username: z.string().min(1, "Username is required"),
    blockedTodoId: z.string().regex(/task-[\d]+/, "Invalid blocked todo ID"),
    blockerTodoId: z.string().regex(/task-[\d]+/, "Invalid blocker todo ID"),
  },
  async ({ username, blockedTodoId, blockerTodoId }) => {
    const result = await safeExecute(async () => {
      // Verify both todos exist
      const blockedTodo = await todoService.getTodo(blockedTodoId, username);
      if (!blockedTodo) {
        throw new Error(`Todo with ID ${blockedTodoId} not found`);
      }

      const blockerTodo = await todoService.getTodo(blockerTodoId, username);
      if (!blockerTodo) {
        throw new Error(`Todo with ID ${blockerTodoId} not found`);
      }

      const removed = await todoService.removeBlockerDependency(blockedTodoId, blockerTodoId, username);
      if (!removed) {
        throw new Error(`"${blockedTodo.title}" is not blocked by "${blockerTodo.title}"`);
      }

      return `"${blockedTodo.title}" is no longer blocked by "${blockerTodo.title}"`;
    }, "Failed to remove blocker dependency");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ ${result}`);
  }
);

/**
 * Tool 25: Get all blockers for a todo
 *
 * Returns the todos that are blocking the specified todo.
 */
server.tool(
  "get-blockers",
  "Get all todos that are blocking a specific todo",
  {
    username: z.string().min(1, "Username is required"),
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
  },
  async ({ username, todoId }) => {
    const result = await safeExecute(async () => {
      // Verify todo exists
      const todo = await todoService.getTodo(todoId, username);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      const blockers = await todoService.getBlockersForTodo(todoId, username);
      if (blockers.length === 0) {
        return `"${todo.title}" is not blocked by any todos`;
      }

      return `Todos blocking "${todo.title}":\n\n${formatTodoList(blockers)}`;
    }, "Failed to get blockers");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 26: Get all blocked todos
 *
 * Returns all todos that are blocked by a specific todo.
 */
server.tool(
  "get-blocked-todos",
  "Get all todos that are blocked by a specific todo",
  {
    username: z.string().min(1, "Username is required"),
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
  },
  async ({ username, todoId }) => {
    const result = await safeExecute(async () => {
      // Verify todo exists
      const todo = await todoService.getTodo(todoId, username);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      const blockedIds = await todoService.getTodosBlockedBy(todoId, username);
      if (blockedIds.length === 0) {
        return `"${todo.title}" is not blocking any todos`;
      }

      // Get the full todo objects
      const blockedTodoPromises = blockedIds.map((id: string) => todoService.getTodo(id, username));
      const blockedTodoResults = await Promise.all(blockedTodoPromises);
      const blockedTodos = blockedTodoResults.filter((todo): todo is any => todo !== undefined);

      return `Todos blocked by "${todo.title}":\n\n${formatTodoList(blockedTodos)}`;
    }, "Failed to get blocked todos");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 27: List all users
 *
 * Returns a list of all registered users in the system.
 */
server.tool(
  "list-users",
  "List all registered users",
  {},
  async () => {
    const result = await safeExecute(async () => {
      const users = await userService.getAllUsers();
      if (users.length === 0) {
        return "No users found.";
      }
      
      const userList = users.map(user => `- ${user.username} (created: ${new Date(user.createdAt).toLocaleDateString()})`).join('\n');
      return `# Registered Users\n\nThere are ${users.length} users:\n\n${userList}`;
    }, "Failed to list users");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 28: Create a new project
 */
server.tool(
  "create-project",
  "Create a new project for organizing todos",
  {
    username: z.string().min(1, "Username is required"),
    name: z.string().min(1, "Project name is required").max(100, "Project name must be less than 100 characters"),
    description: z.string().min(1, "Project description is required").max(1000, "Project description must be less than 1000 characters"),
  },
  async ({ username, name, description }) => {
    const result = await safeExecute(async () => {
      const validatedData = CreateProjectSchema.parse({ username, name, description });
      const newProject = await projectService.createProject(validatedData);
      return formatProject(newProject);
    }, "Failed to create project");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ Project Created:\n\n${result}`);
  }
);

/**
 * Tool 29: List all projects
 */
server.tool(
  "list-projects",
  "List all projects for a user with optional pagination",
  {
    username: z.string().min(1, "Username is required"),
    limit: z.number().optional(),
    offset: z.number().optional()
  },
  async ({ username, limit, offset }) => {
    const result = await safeExecute(async () => {
      const projects = await projectService.getAllProjects(username, limit, offset);
      return formatProjectList(projects);
    }, "Failed to list projects");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 30: Get a specific project by ID
 */
server.tool(
  "get-project",
  "Get a specific project by ID",
  {
    username: z.string().min(1, "Username is required"),
    id: z.string().regex(/project-[\d]+/, "Invalid project ID"),
  },
  async ({ username, id }) => {
    const result = await safeExecute(async () => {
      const project = await projectService.getProject(id, username);
      if (!project) {
        throw new Error(`Project with ID ${id} not found`);
      }
      return formatProject(project);
    }, "Failed to get project");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 31: Update a project
 */
server.tool(
  "update-project",
  "Update a project name or description",
  {
    username: z.string().min(1, "Username is required"),
    id: z.string().regex(/project-[\d]+/, "Invalid project ID"),
    name: z.string().min(1, "Project name is required").max(100, "Project name must be less than 100 characters").optional(),
    description: z.string().min(1, "Project description is required").max(1000, "Project description must be less than 1000 characters").optional(),
  },
  async ({ username, id, name, description }) => {
    const result = await safeExecute(async () => {
      const validatedData = UpdateProjectSchema.parse({ id, name, description });

      // Ensure at least one field is being updated
      if (!name && !description) {
        throw new Error("At least one field (name or description) must be provided");
      }

      const updatedProject = await projectService.updateProject(validatedData, username);
      if (!updatedProject) {
        throw new Error(`Project with ID ${id} not found`);
      }

      return formatProject(updatedProject);
    }, "Failed to update project");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ Project Updated:\n\n${result}`);
  }
);

/**
 * Tool 32: Delete a project
 */
server.tool(
  "delete-project",
  "Delete a project",
  {
    username: z.string().min(1, "Username is required"),
    id: z.string().regex(/project-[\d]+/, "Invalid project ID"),
  },
  async ({ username, id }) => {
    const result = await safeExecute(async () => {
      const project = await projectService.getProject(id, username);
      if (!project) {
        throw new Error(`Project with ID ${id} not found`);
      }

      const success = await projectService.deleteProject(id, username);
      if (!success) {
        throw new Error(`Failed to delete project with ID ${id}`);
      }

      return project.name;
    }, "Failed to delete project");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ Project Deleted: "${result}"`);
  }
);

/**
 * Tool 33: Search projects by name
 */
server.tool(
  "search-projects-by-name",
  "Search projects by name (case insensitive partial match)",
  {
    username: z.string().min(1, "Username is required"),
    name: z.string().min(1, "Search term is required"),
  },
  async ({ username, name }) => {
    const result = await safeExecute(async () => {
      const validatedData = SearchProjectsByNameSchema.parse({ name });
      const projects = await projectService.searchProjectsByName(validatedData.name, username);
      return formatProjectList(projects);
    }, "Failed to search projects");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 34: Get all todos in a project
 */
server.tool(
  "get-project-todos",
  "Get all todos in a project",
  {
    username: z.string().min(1, "Username is required"),
    projectId: z.string().regex(/project-[\d]+/, "Invalid project ID"),
  },
  async ({ username, projectId }) => {
    const result = await safeExecute(async () => {
      const project = await projectService.getProject(projectId, username);
      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      const todoIds = await projectService.getTodosInProject(projectId, username);
      if (todoIds.length === 0) {
        return `No todos found in project "${project.name}"`;
      }

      // Get the full todo objects
      const todoPromises = todoIds.map((id: string) => todoService.getTodo(id, username));
      const todoResults = await Promise.all(todoPromises);
      const todos = todoResults.filter((todo): todo is any => todo !== undefined);

      return `Todos in project "${project.name}":\n\n${formatTodoList(todos)}`;
    }, "Failed to get project todos");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 35: Assign a todo to a project
 */
server.tool(
  "assign-todo-to-project",
  "Assign a todo to a project",
  {
    username: z.string().min(1, "Username is required"),
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
    projectId: z.string().regex(/project-[\d]+/, "Invalid project ID"),
  },
  async ({ username, todoId, projectId }) => {
    const result = await safeExecute(async () => {
      // Verify todo exists
      const todo = await todoService.getTodo(todoId, username);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      // Verify project exists
      const project = await projectService.getProject(projectId, username);
      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      const assigned = await todoService.assignTodoToProject(todoId, projectId, username);
      if (!assigned) {
        throw new Error(`Failed to assign todo to project`);
      }

      return `Todo "${todo.title}" assigned to project "${project.name}"`;
    }, "Failed to assign todo to project");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ ${result}`);
  }
);

/**
 * Tool 36: Remove a todo from its project
 */
server.tool(
  "remove-todo-from-project",
  "Remove a todo from its project",
  {
    username: z.string().min(1, "Username is required"),
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
  },
  async ({ username, todoId }) => {
    const result = await safeExecute(async () => {
      // Verify todo exists
      const todo = await todoService.getTodo(todoId, username);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      const removed = await todoService.removeTodoFromProject(todoId, username);
      if (!removed) {
        throw new Error(`Failed to remove todo from project`);
      }

      return `Todo "${todo.title}" removed from project`;
    }, "Failed to remove todo from project");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(`✅ ${result}`);
  }
);

/**
 * Main function to start the server
 * 
 * This function:
 * 1. Initializes the server
 * 2. Sets up graceful shutdown handlers
 * 3. Connects to the transport
 * 
 * WHY USE STDIO TRANSPORT?
 * - Works well with the MCP protocol
 * - Simple to integrate with LLM platforms like Claude Desktop
 * - No network configuration required
 * - Easy to debug and test
 */
async function main() {
  console.error("Starting Todo MCP Server...");
  console.error(`SQLite database path: ${config.db.path}`);

  try {
    // Initialize TypeORM DataSource
    await initializeDataSource();
    
    /**
     * Set up graceful shutdown to close the database
     * 
     * This ensures data is properly saved when the server is stopped.
     * Both SIGINT (Ctrl+C) and SIGTERM (kill command) are handled.
     */
    process.on('SIGINT', async () => {
      console.error('Shutting down...');
      await closeDataSource();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('Shutting down...');
      await closeDataSource();
      process.exit(0);
    });
    
    /**
     * Connect to stdio transport
     * 
     * The StdioServerTransport uses standard input/output for communication,
     * which is how Claude Desktop and other MCP clients connect to the server.
     */
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("Todo MCP Server running on stdio transport");
  } catch (error) {
    console.error("Failed to start Todo MCP Server:", error);
    await closeDataSource();
    process.exit(1);
  }
}

// Start the server
main(); 