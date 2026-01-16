# Todo List MCP Server

A Model Context Protocol (MCP) server that provides a comprehensive API for managing todo items.

<a href="https://glama.ai/mcp/servers/kh39rjpplx">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/kh39rjpplx/badge" alt="Todo List Server MCP server" />
</a>

> **📚 Learning Resource**: This project is designed as an educational example of MCP implementation. See [GUIDE.md](GUIDE.md) for a comprehensive explanation of how the project works and why things are implemented the way they are.

## Features

- **Create todos**: Add new tasks with title and markdown description
- **Update todos**: Modify existing tasks
- **Complete todos**: Mark tasks as done
- **Delete todos**: Remove tasks from the list
- **Search todos**: Find tasks by title, date, or priority
- **Summarize todos**: Get a quick overview of active tasks
- **Tag management**: Organize todos with custom tags and colors
- **Task dependencies**: Mark tasks as blocked by other tasks (blocked_by relationships)

## Tools

This MCP server exposes the following tools:

### Todo Management
1. `create-todo`: Create a new todo item
2. `list-todos`: List all todos
3. `get-todo`: Get a specific todo by ID
4. `update-todo`: Update a todo's title or description
5. `complete-todo`: Mark a todo as completed
6. `delete-todo`: Delete a todo
7. `search-todos-by-title`: Search todos by title (case-insensitive partial match)
8. `search-todos-by-date`: Search todos by creation date (format: YYYY-MM-DD)
9. `search-todos-by-priority`: Search todos by priority level
10. `list-active-todos`: List all non-completed todos
11. `summarize-active-todos`: Generate a summary of all active (non-completed) todos

### Tag Management
12. `create-tag`: Create a new tag with optional color
13. `list-tags`: List all available tags
14. `get-tag`: Get a specific tag by ID
15. `get-tags`: Get multiple tags by IDs (batch operation for efficiency)
16. `update-tag`: Update a tag's name or color
17. `delete-tag`: Delete a tag (removes from all todos)
18. `search-tags`: Search tags by name
19. `add-tag-to-todo`: Assign a tag to a todo
20. `remove-tag-from-todo`: Remove a tag from a todo
21. `get-todo-tags`: Get all tags assigned to a todo
22. `search-todos-by-tag`: Find all todos with a specific tag

### Task Dependencies (blocked_by)
23. `add-blocker-dependency`: Mark a todo as blocked by another todo
24. `remove-blocker-dependency`: Remove a blocker dependency
25. `get-blockers`: Get all todos blocking a specific todo
26. `get-blocked-todos`: Get all todos blocked by a specific todo

## Data Model

### Todo Item
Each todo item contains:
- `id`: Unique task identifier (format: `task-*`, LLM-friendly mapping to UUID)
- `title`: Task title
- `description`: Markdown-formatted description
- `priority`: Priority level (URGENT, HIGH, MEDIUM, LOW, LOWEST)
- `completed`: Boolean completion status
- `completedAt`: ISO timestamp when completed (null if not completed)
- `blocked_by`: Array of task-* IDs that block this todo (task dependencies)
- `createdAt`: ISO timestamp of creation
- `updatedAt`: ISO timestamp of last update

### Tag Item
Each tag contains:
- `id`: Unique UUID identifier
- `name`: Tag name (unique, case-insensitive)
- `color`: Optional hex color code (format: #RRGGBB)
- `createdAt`: ISO timestamp of creation
- `updatedAt`: ISO timestamp of last update

### Relationships
- **Todo ↔ Tag**: N-N relationship (many todos can have many tags)
- **Todo → Todo (blocked_by)**: A todo can be blocked by one or more other todos, creating a directed dependency graph

## Installation

```bash
# Clone the repository
git clone https://github.com/RegiByte/todo-list-mcp.git
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

- "Create a todo to learn MCP with a description explaining why MCP is useful"
- "List all my active todos"
- "Create a todo for tomorrow's meeting with details about the agenda in markdown"
- "Mark my learning MCP todo as completed"
- "Summarize all my active todos"

## Project Structure

This project follows a clear separation of concerns to make the code easy to understand:

```
src/
├── models/       # Data structures and validation schemas
├── services/     # Business logic and database operations
├── utils/        # Helper functions and formatters
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