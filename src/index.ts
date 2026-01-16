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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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

// Import services
import { todoService } from "./services/TodoService.js";
import { databaseService } from "./services/DatabaseService.js";
import { tagService } from "./services/TagService.js";

// Import utilities
import { createSuccessResponse, createErrorResponse, formatTodo, formatTodoList, formatTag, formatTagList, formatTagNames } from "./utils/formatters.js";
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
async function safeExecute<T>(operation: () => T, errorMessage: string) {
  try {
    const result = operation();
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
    title: z.string().min(1, "Title is required"),
    description: z.string().min(1, "Description is required"),
    priority: z.nativeEnum(Priority, {"message": "Invalid priority value"})
  },
  async ({ title, description, priority }) => {
    const result = await safeExecute(() => {
      const validatedData = CreateTodoSchema.parse({ title, description, priority });
      const newTodo = todoService.createTodo(validatedData);
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
 * 1. Retrieves all todos from the service
 * 2. Formats them as a list
 * 3. Returns the formatted list
 */
server.tool(
  "list-todos",
  "List all todos",
  {},
  async () => {
    const result = await safeExecute(() => {
      const todos = todoService.getAllTodos();
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
    id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
  },
  async ({ id }) => {
    const result = await safeExecute(() => {
      const todo = todoService.getTodo(id);
      if (!todo) {
        throw new Error(`Todo with ID ${id} not found. This can happen if the id hash map hasn't been initialized yet. Suggest fix: use list-todos to list all todo.`);
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
    id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
    title: z.string().min(1, "Title is required").optional(),
    description: z.string().min(1, "Description is required").optional(),
    priority: z.nativeEnum(Priority, {"message": "Invalid priority value"}).optional(),
  },
  async ({ id, title, description, priority }) => {
    const result = await safeExecute(() => {
      const validatedData = UpdateTodoSchema.parse({ id, title, description, priority });

      // Ensure at least one field is being updated
      if (!title && !description && priority === undefined) {
        throw new Error("At least one field (title or description) must be provided");
      }

      const updatedTodo = todoService.updateTodo(validatedData);
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
    id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
  },
  async ({ id }) => {
    const result = await safeExecute(() => {
      const validatedData = CompleteTodoSchema.parse({ id });
      const completedTodo = todoService.completeTodo(validatedData.id);
      
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
    id: z.string().regex(/task-[\d]+/, "Invalid ID value"),
  },
  async ({ id }) => {
    const result = await safeExecute(() => {
      const validatedData = DeleteTodoSchema.parse({ id });
      const todo = todoService.getTodo(validatedData.id);
      
      if (!todo) {
        throw new Error(`Todo with ID ${id} not found`);
      }
      
      const success = todoService.deleteTodo(validatedData.id);
      
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
    title: z.string().min(1, "Search term is required"),
  },
  async ({ title }) => {
    const result = await safeExecute(() => {
      const validatedData = SearchTodosByTitleSchema.parse({ title });
      const todos = todoService.searchByTitle(validatedData.title);
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
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  },
  async ({ date }) => {
    const result = await safeExecute(() => {
      const validatedData = SearchTodosByDateSchema.parse({ date });
      const todos = todoService.searchByDate(validatedData.date);
      return formatTodoList(todos);
    }, "Failed to search todos by date");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 9: List active todos
 * 
 * This tool:
 * 1. Retrieves all non-completed todos
 * 2. Returns a formatted list of active todos
 * 
 * WHY SEPARATE FROM LIST ALL?
 * - Active todos are typically what users most often want to see
 * - Reduces noise by filtering out completed items
 * - Provides a clearer view of outstanding work
 */
server.tool(
  "list-active-todos",
  "List all non-completed todos",
  {},
  async () => {
    const result = await safeExecute(() => {
      const todos = todoService.getActiveTodos();
      return formatTodoList(todos);
    }, "Failed to list active todos");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 10: Summarize active todos
 * 
 * This tool:
 * 1. Generates a summary of all active todos
 * 2. Returns a formatted markdown summary
 * 
 * WHY HAVE A SUMMARY?
 * - Provides a quick overview without details
 * - Perfect for a quick status check
 * - Easier to read than a full list when there are many todos
 * - Particularly useful for LLM interfaces where conciseness matters
 */
server.tool(
  "summarize-active-todos",
  "Generate a summary of all active (non-completed) todos",
  {},
  async () => {
    const result = await safeExecute(() => {
      return todoService.summarizeActiveTodos();
    }, "Failed to summarize active todos");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 11: Search todos by priority
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
    priority: z.nativeEnum(Priority, {"message": "Invalid priority value"}),
  },
  async ({ priority }) => {
    const result = await safeExecute(() => {
      const validatedData = SearchByPrioritySchema.parse({ priority });
      const todos = todoService.searchByPriority(validatedData.priority);
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
    const result = await safeExecute(() => {
      const validatedData = CreateTagSchema.parse({ name, color });
      const newTag = tagService.createTag(validatedData);
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
  "List all tags",
  {},
  async () => {
    const result = await safeExecute(() => {
      const tags = tagService.getAllTags();
      return formatTagList(tags);
    }, "Failed to list tags");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 14: Get a specific tag by ID
 */
server.tool(
  "get-tag",
  "Get a specific tag by ID",
  {
    id: z.string().regex(/tag-[\d]+/, "Invalid tag ID"),
  },
  async ({ id }) => {
    const result = await safeExecute(() => {
      const tag = tagService.getTag(id);
      if (!tag) {
        throw new Error(`Tag with ID ${id} not found`);
      }
      return formatTag(tag);
    }, "Failed to get tag");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
  }
);

/**
 * Tool 15: Get multiple tags by IDs (batch operation)
 *
 * This tool retrieves multiple tags in a single request for efficiency.
 * Useful when you need to get details for multiple tags at once.
 */
server.tool(
  "get-tags",
  "Get multiple tags by IDs (batch operation for efficiency)",
  {
    ids: z.array(z.string().regex(/tag-[\d]+/, "Invalid tag ID")).min(1, "At least one tag ID is required"),
  },
  async ({ ids }) => {
    const result = await safeExecute(() => {
      const tags = tagService.getTags(ids);
      if (tags.length === 0) {
        return "No tags found with the provided IDs";
      }
      return formatTagList(tags);
    }, "Failed to get tags");

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
    const result = await safeExecute(() => {
      const validatedData = UpdateTagSchema.parse({ id, name, color });

      // Ensure at least one field is being updated
      if (!name && !color) {
        throw new Error("At least one field (name or color) must be provided");
      }

      const updatedTag = tagService.updateTag(validatedData);
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
    const result = await safeExecute(() => {
      const tag = tagService.getTag(id);
      if (!tag) {
        throw new Error(`Tag with ID ${id} not found`);
      }

      const success = tagService.deleteTag(id);
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
    const result = await safeExecute(() => {
      const tags = tagService.searchTags(name);
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
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
    tagId: z.string().regex(/tag-[\d]+/, "Invalid tag ID"),
  },
  async ({ todoId, tagId }) => {
    const result = await safeExecute(() => {
      // Verify todo exists
      const todo = todoService.getTodo(todoId);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      // Verify tag exists
      const tag = tagService.getTag(tagId);
      if (!tag) {
        throw new Error(`Tag with ID ${tagId} not found`);
      }

      const added = tagService.addTagToTodo(todoId, tagId);
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
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
    tagId: z.string().regex(/tag-[\d]+/, "Invalid tag ID"),
  },
  async ({ todoId, tagId }) => {
    const result = await safeExecute(() => {
      // Verify todo exists
      const todo = todoService.getTodo(todoId);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      // Verify tag exists
      const tag = tagService.getTag(tagId);
      if (!tag) {
        throw new Error(`Tag with ID ${tagId} not found`);
      }

      const removed = tagService.removeTagFromTodo(todoId, tagId);
      if (!removed) {
        throw new Error(`Tag "${tag.name}" is not assigned to this todo`);
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
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
  },
  async ({ todoId }) => {
    const result = await safeExecute(() => {
      // Verify todo exists
      const todo = todoService.getTodo(todoId);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      const tags = tagService.getTagsForTodo(todoId);
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
    tagId: z.string().regex(/tag-[\d]+/, "Invalid tag ID"),
  },
  async ({ tagId }) => {
    const result = await safeExecute(() => {
      // Verify tag exists
      const tag = tagService.getTag(tagId);
      if (!tag) {
        throw new Error(`Tag with ID ${tagId} not found`);
      }

      const todoIds = tagService.getTodosWithTag(tagId);
      if (todoIds.length === 0) {
        return `No todos found with tag "${tag.name}"`;
      }

      // Get the full todo objects
      const todos = todoIds
        .map(id => todoService.getTodo(id))
        .filter((todo): todo is any => todo !== undefined);

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
    blockedTodoId: z.string().regex(/task-[\d]+/, "Invalid blocked todo ID"),
    blockerTodoId: z.string().regex(/task-[\d]+/, "Invalid blocker todo ID"),
  },
  async ({ blockedTodoId, blockerTodoId }) => {
    const result = await safeExecute(() => {
      // Verify both todos exist
      const blockedTodo = todoService.getTodo(blockedTodoId);
      if (!blockedTodo) {
        throw new Error(`Todo with ID ${blockedTodoId} not found`);
      }

      const blockerTodo = todoService.getTodo(blockerTodoId);
      if (!blockerTodo) {
        throw new Error(`Todo with ID ${blockerTodoId} not found`);
      }

      const added = todoService.addBlockerDependency(blockedTodoId, blockerTodoId);
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
    blockedTodoId: z.string().regex(/task-[\d]+/, "Invalid blocked todo ID"),
    blockerTodoId: z.string().regex(/task-[\d]+/, "Invalid blocker todo ID"),
  },
  async ({ blockedTodoId, blockerTodoId }) => {
    const result = await safeExecute(() => {
      // Verify both todos exist
      const blockedTodo = todoService.getTodo(blockedTodoId);
      if (!blockedTodo) {
        throw new Error(`Todo with ID ${blockedTodoId} not found`);
      }

      const blockerTodo = todoService.getTodo(blockerTodoId);
      if (!blockerTodo) {
        throw new Error(`Todo with ID ${blockerTodoId} not found`);
      }

      const removed = todoService.removeBlockerDependency(blockedTodoId, blockerTodoId);
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
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
  },
  async ({ todoId }) => {
    const result = await safeExecute(() => {
      // Verify todo exists
      const todo = todoService.getTodo(todoId);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      const blockers = todoService.getBlockersForTodo(todoId);
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
    todoId: z.string().regex(/task-[\d]+/, "Invalid todo ID"),
  },
  async ({ todoId }) => {
    const result = await safeExecute(() => {
      // Verify todo exists
      const todo = todoService.getTodo(todoId);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }

      const blockedIds = todoService.getTodosBlockedBy(todoId);
      if (blockedIds.length === 0) {
        return `"${todo.title}" is not blocking any todos`;
      }

      // Get the full todo objects
      const blockedTodos = blockedIds
        .map(id => todoService.getTodo(id))
        .filter((todo): todo is any => todo !== undefined);

      return `Todos blocked by "${todo.title}":\n\n${formatTodoList(blockedTodos)}`;
    }, "Failed to get blocked todos");

    if (result instanceof Error) {
      return createErrorResponse(result.message);
    }

    return createSuccessResponse(result);
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
    // Database is automatically initialized when the service is imported
    
    /**
     * Set up graceful shutdown to close the database
     * 
     * This ensures data is properly saved when the server is stopped.
     * Both SIGINT (Ctrl+C) and SIGTERM (kill command) are handled.
     */
    process.on('SIGINT', () => {
      console.error('Shutting down...');
      databaseService.close();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.error('Shutting down...');
      databaseService.close();
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
    databaseService.close();
    process.exit(1);
  }
}

// Start the server
main(); 