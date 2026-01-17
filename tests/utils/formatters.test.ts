/**
 * formatters.test.ts
 *
 * Unit tests for formatter utility functions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatTodo,
  formatTodoList,
  createSuccessResponse,
  createErrorResponse,
  formatTag,
  formatTagList,
  formatTagNames,
  formatProject,
  formatProjectList,
  formatRelativeTime,
} from '../../src/utils/formatters.js';
import { Todo, Priority } from '../../src/models/Todo.js';
import { Tag } from '../../src/models/Tag.js';
import { Project } from '../../src/models/Project.js';

describe('formatters', () => {
  describe('formatTodo', () => {
    it('should format a completed todo', () => {
      const todo: Todo = {
        id: 'task-1',
        username: 'test-user',
        title: 'Test Todo',
        priority: Priority.HIGH,
        description: 'Test description',
        completed: true,
        completedAt: '2024-01-01T00:00:00.000Z',
        blocked_by: [],
        tagNames: [],
        projectId: null,
        projectName: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const formatted = formatTodo(todo);

      expect(formatted).toContain('## Test Todo ✅');
      expect(formatted).toContain('ID: task-1');
      expect(formatted).toContain('Priority: HIGH');
      expect(formatted).toContain('Description: Test description');
    });

    it('should format an incomplete todo', () => {
      const todo: Todo = {
        id: 'task-1',
        username: 'test-user',
        title: 'Test Todo',
        priority: Priority.MEDIUM,
        description: 'Test description',
        completed: false,
        completedAt: null,
        blocked_by: [],
        tagNames: [],
        projectId: null,
        projectName: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const formatted = formatTodo(todo);

      expect(formatted).toContain('## Test Todo ⏳');
      expect(formatted).toContain('ID: task-1');
      expect(formatted).toContain('Priority: MEDIUM');
    });

    it('should include blocked_by section when todos are blocked', () => {
      const todo: Todo = {
        id: 'task-1',
        username: 'test-user',
        title: 'Test Todo',
        priority: Priority.LOW,
        description: 'Test description',
        completed: false,
        completedAt: null,
        blocked_by: ['task-2', 'task-3'],
        tagNames: [],
        projectId: null,
        projectName: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const formatted = formatTodo(todo);

      expect(formatted).toContain('**Blocked by:** task-2, task-3');
    });

    it('should include tags section when todos have tags', () => {
      const todo: Todo = {
        id: 'task-1',
        username: 'test-user',
        title: 'Test Todo',
        priority: Priority.LOWEST,
        description: 'Test description',
        completed: false,
        completedAt: null,
        blocked_by: [],
        tagNames: ['Important', 'Work'],
        projectId: null,
        projectName: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const formatted = formatTodo(todo);

      expect(formatted).toContain('**Tags:** [Important] [Work]');
    });

    it('should include project name when todo has project', () => {
      const todo: Todo = {
        id: 'task-1',
        username: 'test-user',
        title: 'Test Todo',
        priority: Priority.URGENT,
        description: 'Test description',
        completed: false,
        completedAt: null,
        blocked_by: [],
        tagNames: [],
        projectId: 'project-1',
        projectName: 'Test Project',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const formatted = formatTodo(todo);

      expect(formatted).toContain('Project: Test Project');
    });
  });

  describe('formatTodoList', () => {
    it('should return message for empty list', () => {
      const formatted = formatTodoList([]);

      expect(formatted).toBe('No todos found.');
    });

    it('should format list of todos', () => {
      const todos: Todo[] = [
        {
          id: 'task-1',
          username: 'test-user',
          title: 'Todo 1',
          priority: Priority.HIGH,
          description: 'Description 1',
          completed: false,
          completedAt: null,
          blocked_by: [],
          tagNames: [],
          projectId: null,
          projectName: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'task-2',
          username: 'test-user',
          title: 'Todo 2',
          priority: Priority.MEDIUM,
          description: 'Description 2',
          completed: true,
          completedAt: '2024-01-01T00:00:00.000Z',
          blocked_by: [],
          tagNames: [],
          projectId: null,
          projectName: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const formatted = formatTodoList(todos);

      expect(formatted).toContain('# Todo List (2 items)');
      expect(formatted).toContain('## Todo 1 ⏳');
      expect(formatted).toContain('## Todo 2 ✅');
      expect(formatted).toContain('---');
    });
  });

  describe('createSuccessResponse', () => {
    it('should create a success response', () => {
      const response = createSuccessResponse('Operation successful');

      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: 'Operation successful',
          },
        ],
      });
    });

    it('should handle multiline messages', () => {
      const response = createSuccessResponse('Line 1\nLine 2');

      expect(response.content[0].text).toBe('Line 1\nLine 2');
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response', () => {
      const response = createErrorResponse('Operation failed');

      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: 'Operation failed',
          },
        ],
        isError: true,
      });
    });
  });

  describe('formatTag', () => {
    it('should format a tag without color', () => {
      const tag: Tag = {
        id: 'tag-1',
        name: 'Important',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const formatted = formatTag(tag);

      expect(formatted).toContain('## Important');
      expect(formatted).toContain('ID: tag-1');
    });

    it('should format a tag with color', () => {
      const tag: Tag = {
        id: 'tag-1',
        name: 'Work',
        color: '#FF5733',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const formatted = formatTag(tag);

      expect(formatted).toContain('## Work 🎨 #FF5733');
    });
  });

  describe('formatTagList', () => {
    it('should return message for empty list', () => {
      const formatted = formatTagList([]);

      expect(formatted).toBe('No tags found.');
    });

    it('should format list of tags', () => {
      const tags: Tag[] = [
        {
          id: 'tag-1',
          name: 'Important',
          color: '#FF0000',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'tag-2',
          name: 'Work',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const formatted = formatTagList(tags);

      expect(formatted).toContain('# Tags (2 total)');
      expect(formatted).toContain('- **Important** (#FF0000)');
      expect(formatted).toContain('- **Work**');
    });
  });

  describe('formatTagNames', () => {
    it('should return placeholder for empty list', () => {
      const formatted = formatTagNames([]);

      expect(formatted).toBe('(no tags)');
    });

    it('should return comma-separated tag names', () => {
      const tags: Tag[] = [
        {
          id: 'tag-1',
          name: 'Important',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'tag-2',
          name: 'Work',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'tag-3',
          name: 'Personal',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const formatted = formatTagNames(tags);

      expect(formatted).toBe('Important, Work, Personal');
    });
  });

  describe('formatProject', () => {
    it('should format a project', () => {
      const project: Project = {
        id: 'project-1',
        username: 'test-user',
        name: 'Home Renovation',
        description: 'Renovate the kitchen',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const formatted = formatProject(project);

      expect(formatted).toContain('## Home Renovation');
      expect(formatted).toContain('ID: project-1');
      expect(formatted).toContain('Description: Renovate the kitchen');
    });
  });

  describe('formatProjectList', () => {
    it('should return message for empty list', () => {
      const formatted = formatProjectList([]);

      expect(formatted).toBe('No projects found.');
    });

    it('should format list of projects', () => {
      const projects: Project[] = [
        {
          id: 'project-1',
          username: 'test-user',
          name: 'Project 1',
          description: 'Description 1',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'project-2',
          username: 'test-user',
          name: 'Project 2',
          description: 'Description 2',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const formatted = formatProjectList(projects);

      expect(formatted).toContain('# Projects (2 total)');
      expect(formatted).toContain('## Project 1');
      expect(formatted).toContain('## Project 2');
      expect(formatted).toContain('---');
    });
  });

  describe('formatRelativeTime', () => {
    const originalDateNow = Date.now;

    beforeEach(() => {
      // Mock Date.now to return a fixed time
      const fixedTime = new Date('2024-01-01T12:00:00.000Z').getTime();
      vi.spyOn(Date, 'now').mockReturnValue(fixedTime);
    });

    afterEach(() => {
      // Restore original Date.now
      vi.restoreAllMocks();
    });

    it('should return NOW for recent timestamps', () => {
      const timestamp = '2024-01-01T11:55:00.000Z';

      const formatted = formatRelativeTime(timestamp);

      expect(formatted).toBe('NOW');
    });

    it('should return minutes ago for timestamps within an hour', () => {
      const timestamp = '2024-01-01T11:30:00.000Z';

      const formatted = formatRelativeTime(timestamp);

      expect(formatted).toBe('30 min ago');
    });

    it('should return hours ago for timestamps within a day', () => {
      const timestamp = '2024-01-01T08:00:00.000Z';

      const formatted = formatRelativeTime(timestamp);

      expect(formatted).toBe('4 hours ago');
    });

    it('should return singular hour for 1 hour', () => {
      const timestamp = '2024-01-01T11:00:00.000Z';

      const formatted = formatRelativeTime(timestamp);

      expect(formatted).toBe('1 hour ago');
    });

    it('should return days ago for older timestamps', () => {
      const timestamp = '2023-12-30T12:00:00.000Z';

      const formatted = formatRelativeTime(timestamp);

      expect(formatted).toBe('2 days ago');
    });

    it('should return singular day for 1 day', () => {
      const timestamp = '2023-12-31T12:00:00.000Z';

      const formatted = formatRelativeTime(timestamp);

      expect(formatted).toBe('1 day ago');
    });
  });
});
