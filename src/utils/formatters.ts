/**
 * formatters.ts
 * 
 * This file contains utility functions for formatting data in the application.
 * These utilities handle the transformation of internal data structures into
 * human-readable formats appropriate for display to LLMs and users.
 * 
 * WHY SEPARATE FORMATTERS?
 * - Keeps formatting logic separate from business logic
 * - Allows consistent formatting across the application
 * - Makes it easier to change display formats without affecting core functionality
 * - Centralizes presentation concerns in one place
 */
import { Todo } from "../models/Todo.js";
import { Tag } from "../models/Tag.js";
import { Project } from "../models/Project.js";

/**
 * Format a todo item to a readable string representation
 * 
 * This formatter converts a Todo object into a markdown-formatted string
 * with clear visual indicators for completion status (emojis).
 * 
 * WHY USE MARKDOWN?
 * - Provides structured, readable output
 * - Works well with LLMs which understand markdown syntax
 * - Allows rich formatting like headers, lists, and emphasis
 * - Can be displayed directly in many UI contexts
 * 
 * @param todo The Todo object to format
 * @returns A markdown-formatted string representation
 */
export function formatTodo(todo: Todo): string {
  const blockedBySection = todo.blocked_by.length > 0
    ? `\n\n**Blocked by:** ${todo.blocked_by.join(", ")}`
    : "";
  
  const tagsSection = todo.tagNames && todo.tagNames.length > 0
    ? `\n\n**Tags:** ${todo.tagNames.map(name => `[${name}]`).join(' ')}`
    : "";
  
  return `
## ${todo.title} ${todo.completed ? '✅' : '⏳'}

### Metadata
ID: ${todo.id}
Project: ${todo.projectName}
Priority: ${todo.priority}
Created: ${new Date(todo.createdAt).toLocaleString()}
Updated: ${new Date(todo.updatedAt).toLocaleString()}${blockedBySection}${tagsSection}

### Content
Description: ${todo.description}
  `.trim();
}

/**
 * Format a list of todos to a readable string representation
 * 
 * This formatter takes an array of Todo objects and creates a complete
 * markdown document with a title and formatted entries.
 * 
 * @param todos Array of Todo objects to format
 * @returns A markdown-formatted string with the complete list
 */
export function formatTodoList(todos: Todo[]): string {
  if (todos.length === 0) {
    return "No todos found.";
  }

  const todoItems = todos.map(formatTodo).join('\n\n---\n\n');
  return `# Todo List (${todos.length} items)\n\n${todoItems}`;
}

/**
 * Create success response for MCP tool calls
 * 
 * This utility formats successful responses according to the MCP protocol.
 * It wraps the message in the expected content structure.
 * 
 * WHY THIS FORMAT?
 * - Follows the MCP protocol's expected response structure
 * - Allows the message to be properly displayed by MCP clients
 * - Clearly indicates success status
 * 
 * @param message The success message to include
 * @returns A properly formatted MCP response object
 */
export function createSuccessResponse(message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
}

/**
 * Create error response for MCP tool calls
 * 
 * This utility formats error responses according to the MCP protocol.
 * It includes the isError flag to indicate failure.
 * 
 * @param message The error message to include
 * @returns A properly formatted MCP error response object
 */
export function createErrorResponse(message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
    isError: true,
  };
}

/**
 * Format a tag to a readable string representation
 * 
 * @param tag The Tag object to format
 * @returns A markdown-formatted string representation
 */
export function formatTag(tag: Tag): string {
  const colorIndicator = tag.color ? `🎨 ${tag.color}` : "";
  return `
## ${tag.name} ${colorIndicator}

ID: ${tag.id}
Created: ${new Date(tag.createdAt).toLocaleString()}
Updated: ${new Date(tag.updatedAt).toLocaleString()}
  `.trim();
}

/**
 * Format a list of tags to a readable string representation
 * 
 * @param tags Array of Tag objects to format
 * @returns A markdown-formatted string with the complete list
 */
export function formatTagList(tags: Tag[]): string {
  if (tags.length === 0) {
    return "No tags found.";
  }

  const tagItems = tags.map(tag => `- **${tag.name}** ${tag.color ? `(${tag.color})` : ""}`).join('\n');
  return `# Tags (${tags.length} total)\n\n${tagItems}`;
}

/**
 * Format a simple list of tag names
 * 
 * @param tags Array of Tag objects
 * @returns Comma-separated list of tag names
 */
export function formatTagNames(tags: Tag[]): string {
  if (tags.length === 0) {
    return "(no tags)";
  }
  return tags.map(tag => tag.name).join(", ");
}

/**
 * Format a project to a readable string representation
 *
 * @param project The Project object to format
 * @returns A markdown-formatted string representation
 */
export function formatProject(project: Project): string {
  return `
## ${project.name}

ID: ${project.id}
Description: ${project.description}
Created: ${new Date(project.createdAt).toLocaleString()}
Updated: ${new Date(project.updatedAt).toLocaleString()}
  `.trim();
}

/**
 * Format a list of projects to a readable string representation
 *
 * @param projects Array of Project objects to format
 * @returns A markdown-formatted string with complete list
 */
export function formatProjectList(projects: Project[]): string {
  if (projects.length === 0) {
    return "No projects found.";
  }
  
  const projectItems = projects.map(formatProject).join('\n\n---\n\n');
  return `# Projects (${projects.length} total)\n\n${projectItems}`;
}

/**
 * Convert ISO timestamp to relative time string
 * 
 * @param isoString ISO timestamp string
 * @returns Human-readable relative time (e.g., "NOW", "5 min ago", "2 hours ago")
 */
export function formatRelativeTime(isoString: string): string {
  const now = new Date(Date.now());
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 10) return "NOW";
  if (diffMins < 60) return `${diffMins} min ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}
