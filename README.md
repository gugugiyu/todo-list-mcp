# Todo List MCP Server

A Model Context Protocol (MCP) server that provides a comprehensive API for managing todo items.

<a href="https://glama.ai/mcp/servers/kh39rjpplx">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/kh39rjpplx/badge" alt="Todo List Server MCP server" />
</a>

> **📚 Learning Resource**: This project is designed as an educational example of MCP implementation. See [GUIDE.md](GUIDE.md) for a comprehensive explanation of how the project works and why things are implemented the way they are.

## Features

- **User authentication**: Automatic user registration with username-based access control
- **Create todos**: Add new tasks with title and markdown description
- **Update todos**: Modify existing tasks
- **Complete todos**: Mark tasks as done
- **Delete todos**: Remove tasks from the list
- **Search todos**: Find tasks by title, date, or priority
- **Summarize todos**: Get a quick overview of active tasks
- **Tag management**: Organize todos with custom tags and colors (shared across all users)
- **Task dependencies**: Mark tasks as blocked by other tasks (blocked_by relationships)
- **Projects**: Organize related tasks into projects (each task belongs to at most one project)
- **Tag limit**: Maximum of 4 tags per todo enforced

## Tools

This MCP server exposes the following tools:

### User Management
1. `list-users`: List all registered users

### Todo Management
2. `create-todo`: Create a new todo item (requires username)
3. `list-todos`: List all todos for a user (requires username)
4. `get-todo`: Get a specific todo by ID (requires username)
5. `update-todo`: Update a todo's title or description (requires username)
6. `complete-todo`: Mark a todo as completed (requires username)
7. `delete-todo`: Delete a todo (requires username)
8. `search-todos-by-title`: Search todos by title (case-insensitive partial match, requires username)
9. `search-todos-by-date`: Search todos by creation date (format: YYYY-MM-DD, requires username)
10. `search-todos-by-priority`: Search todos by priority level (requires username)
11. ~~`list-active-todos`: List all non-completed todos for a user (requires username)~~ **(merged with list-todos)**
12. ~~`summarize-active-todos`: Generate a summary of all active (non-completed) todos (requires username)~~ **(merged with list-todos)**

### Tag Management
13. `create-tag`: Create a new tag with optional color (validates if tag already exists)
14. `list-tags`: List all available tags (shared across all users)
15. ~~`get-tag`: Get a specific tag by ID~~ (batching is by default)
16. `get-tags`: Get multiple tags by IDs (batch operation for efficiency)
17. `update-tag`: Update a tag's name or color
18. `delete-tag`: Delete a tag (removes from all todos)
19. `search-tags`: Search tags by name
20. `add-tag-to-todo`: Assign a tag to a todo
21. `remove-tag-from-todo`: Remove a tag from a todo
22. `get-todo-tags`: Get all tags assigned to a todo
23. `search-todos-by-tag`: Find all todos with a specific tag

### Task Dependencies (blocked_by)
24. `add-blocker-dependency`: Mark a todo as blocked by another todo (requires username)
25. `remove-blocker-dependency`: Remove a blocker dependency (requires username)
26. `get-blockers`: Get all todos blocking a specific todo (requires username)
27. `get-blocked-todos`: Get all todos blocked by a specific todo (requires username)

### Project Management
28. `create-project`: Create a new project (requires username, name, description)
29. `list-projects`: List all projects for a user (requires username)
30. `get-project`: Get a specific project by ID (requires username)
31. `update-project`: Update a project name or description (requires username)
32. `delete-project`: Delete a project (requires username)
33. `search-projects-by-name`: Search projects by name (requires username)
34. `get-project-todos`: Get all todos in a project (requires username)
35. `assign-todo-to-project`: Assign a todo to a project (requires username)
36. `remove-todo-from-project`: Remove a todo from its project (requires username)

## Data Model

### User Item
Each user contains:
- `username`: Unique username (3-12 characters, alphanumeric + hyphens only, case-insensitive)
- `createdAt`: ISO timestamp of registration

### Todo Item
Each todo item contains:
- `id`: Unique task identifier (format: `task-*`, LLM-friendly mapping to UUID)
- `username`: The user who owns this todo
- `title`: Task title
- `description`: Markdown-formatted description
- `priority`: Priority level (URGENT, HIGH, MEDIUM, LOW, LOWEST)
- `completed`: Boolean completion status
- `completedAt`: ISO timestamp when completed (null if not completed)
- `blocked_by`: Array of task-* IDs that block this todo (task dependencies)
- `tagNames`: Array of tag names for display (max 4 tags)
- `projectId`: Reference to project (project-*) if assigned, null otherwise
- `projectName`: Project name for display
- `createdAt`: ISO timestamp of creation
- `updatedAt`: ISO timestamp of last update

### Tag Item
Each tag contains:
- `id`: Unique UUID identifier (format: `tag-*`, LLM-friendly mapping to UUID)
- `name`: Tag name (unique, case-insensitive)
- `color`: Optional hex color code (format: #RRGGBB)
- `createdAt`: ISO timestamp of creation
- `updatedAt`: ISO timestamp of last update

### Project Item
Each project contains:
- `id`: Unique project identifier (format: `project-*`, LLM-friendly mapping to UUID)
- `username`: The user who owns this project
- `name`: Project name (required)
- `description`: Project description (required)
- `createdAt`: ISO timestamp of creation
- `updatedAt`: ISO timestamp of last update

### Relationships
- **User → Project**: 1-N relationship (each user has their own projects)
- **User → Todo**: 1-N relationship (each user has their own todos)
- **Project → Todo**: 1-N relationship (each project can have many todos, each todo belongs to at most one project)
- **Todo ↔ Tag**: N-N relationship (many todos can have many tags, tags are shared globally, max 4 tags per todo)
- **Todo → Todo (blocked_by)**: A todo can be blocked by one or more other todos, creating a directed dependency graph

### Authentication & Access Control
- **Username**: Required for all todo and project operations (create, list, get, update, delete, search)
- **Automatic Registration**: Users are automatically registered when they first use the system
- **Data Isolation**: Each user can only access their own todos and projects (cross-access returns "not found")
- **Shared Tags**: Tags are shared globally across all users (not user-specific)
- **Tag Limit**: Maximum of 4 tags per todo enforced (existing todos with 4+ tags are grandfathered)

## Installation

```bash
# Clone the repository
git clone https://github.com/gugugiyu/todo-list-mcp.git
cd todo-list-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Starting the Server

```bash
npm start
```

### Configuring with Claude for Desktop

#### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "todo": {
      "command": "node",
      "args": ["/absolute/path/to/todo-list-mcp/dist/index.js"]
    }
  }
}
```

#### Cursor

- Go to "Cursor Settings" -> MCP
- Add a new MCP server with a "command" type
- Add the absolute path of the server and run it with node
- Example: node /absolute/path/to/todo-list-mcp/dist/index.js

### Example Commands

When using with Claude for Desktop or Cursor, you can try:

- "List all users in the system"
- "Create a todo for user 'john-doe' with title 'Learn MCP' and description explaining why MCP is useful"
- "List all active todos for user 'jane-smith'"
- "Create a todo for user 'bob' for tomorrow's meeting with details about the agenda in markdown"
- "Mark todo 'task-1' as completed for user 'john-doe'"
- "Summarize all active todos for user 'jane-smith'"
- "Create a project 'Home Renovation' for user 'john-doe' with description 'Renovate the kitchen'"
- "Assign todo 'task-1' to project 'Home Renovation'"

## Database Migration

The project includes a migration script for upgrading the database schema:

```bash
# Check migration status
npm run migrate:status

# Migrate database to v2 (adds projects and tag limit)
npm run migrate

# Rollback database to v1
npm run migrate:rollback
```

The migration script automatically creates a backup before any changes and supports rollback functionality.

## Project Structure

This project follows a clear separation of concerns to make the code easy to understand:

```
src/
├── models/       # Data structures and validation schemas
├── services/     # Business logic and database operations
├── utils/        # Helper functions and formatters
├── scripts/       # Migration scripts
├── config.ts     # Configuration settings
├── client.ts     # Test client for local testing
└── index.ts      # Main entry point with MCP tool definitions
```

## Learning from This Project

This project is designed as an educational resource. To get the most out of it:

1. Read the [GUIDE.md](GUIDE.md) for a comprehensive explanation of the design
2. Study the heavily commented source code to understand implementation details
3. Use the test client to see how the server works in practice
4. Experiment with adding your own tools or extending the existing ones

## Development

### Building

```bash
npm run build
```

### Running in Development Mode

```bash
npm run dev
```

## License

MIT
