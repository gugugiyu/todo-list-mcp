# DevOps Suite Setup Plan

## Overview

This plan outlines the setup of a comprehensive DevOps suite for the Todo List MCP Server project, including code formatting, linting, git hooks, commit message validation, and GitHub CI/CD workflow.

## Components

### 1. Prettier (Code Formatter)

**Purpose**: Consistent code formatting across the project

**Configuration Files**:

- `.prettierrc` - Prettier configuration
- `.prettierignore` - Files to ignore

**Key Settings**:

- Single quotes
- 2 space indentation
- Semicolons
- Trailing commas where valid
- Print width 100

**Scripts to Add**:

- `format` - Format all files
- `format:check` - Check formatting without modifying
- `format:write` - Format and fix files

---

### 2. ESLint (Linter)

**Purpose**: Identify and report on code patterns, enforce code quality

**Configuration Files**:

- `.eslintrc.js` - ESLint configuration
- `.eslintignore` - Files to ignore

**Key Settings**:

- TypeScript parser
- Recommended TypeScript rules
- Prettier integration (eslint-config-prettier)

**Scripts to Add**:

- `lint` - Run ESLint
- `lint:fix` - Run ESLint and auto-fix issues

---

### 3. Husky (Git Hooks)

**Purpose**: Run scripts before git actions (commit, push, etc.)

**Configuration**:

- `.husky/pre-commit` - Run before commit (format, lint, test)
- `.husky/commit-msg` - Run before commit message (commitlint)
- `.husky/pre-push` - Run before push (full test suite)

**Setup**:

- Initialize Husky
- Create hook scripts
- Make hooks executable

---

### 4. Commitlint (Commit Message Linter)

**Purpose**: Enforce conventional commit messages

**Configuration Files**:

- `.commitlintrc.js` - Commitlint configuration

**Commit Convention**:

- Conventional Commits specification
- Types: feat, fix, docs, style, refactor, test, chore
- Format: `<type>(<scope>): <subject>`

**Examples**:

- `feat: add user authentication`
- `fix: resolve database connection issue`
- `docs: update README with new features`

---

### 5. GitHub CI/CD Workflow

**Purpose**: Automated testing, linting, and releases

**Workflow File**: `.github/workflows/ci.yml`

**Triggers**:

- Pull requests to `main`
- Push to `main`

**Jobs**:

#### Job 1: Lint & Format Check

- Checkout code
- Install dependencies
- Run `npm run lint`
- Run `npm run format:check`

#### Job 2: Test

- Checkout code
- Install dependencies
- Run `npm run test:unit:coverage`
- Upload coverage reports

#### Job 3: Build

- Checkout code
- Install dependencies
- Run `npm run build`
- Verify build output

#### Job 4: Release (only on push to main)

- Checkout code
- Install dependencies
- Run tests
- Create GitHub release
- Tag version

**Runner**: `self-hosted`

---

## File Structure

```
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── .husky/
│   ├── pre-commit
│   ├── commit-msg
│   └── pre-push
├── .prettierrc
├── .prettierignore
├── .eslintrc.js
├── .eslintignore
├── .commitlintrc.js
├── package.json (updated)
└── .gitignore (updated)
```

---

## Dependencies to Install

```json
{
  "devDependencies": {
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.2.0",
    "prettier": "^3.2.0"
  }
}
```

---

## Updated Scripts in package.json

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "npm run build && npm start",
    "test": "npm run build && node dist/client.js",
    "test:unit": "vitest",
    "test:unit:coverage": "vitest --coverage",
    "inspector": "npx @modelcontextprotocol/inspector node dist/index.js",
    "format": "prettier --check .",
    "format:write": "prettier --write .",
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "prepare": "husky install"
  }
}
```

---

## Git Hooks Configuration

### pre-commit

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

### commit-msg

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx --no -- commitlint --edit $1
```

### pre-push

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npm run test:unit
```

---

## lint-staged Configuration

File: `.lint-staged.js`

```javascript
export default {
  '*.{ts,tsx,js,jsx}': ['prettier --write', 'eslint --fix'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
```

---

## Updated .gitignore

Additions:

```
node_modules/
dist/
contexts/
data/
.specstory/
.husky/_/
coverage/
*.log
.DS_Store
```

---

## Implementation Order

1. Install dependencies (Prettier, ESLint, Husky, Commitlint, lint-staged)
2. Create configuration files (.prettierrc, .eslintrc.js, .commitlintrc.js)
3. Create ignore files (.prettierignore, .eslintignore)
4. Update package.json with new scripts and dependencies
5. Initialize Husky and create git hooks
6. Create lint-staged configuration
7. Create GitHub CI/CD workflow file
8. Update .gitignore
9. Update README.md with DevOps documentation
10. Test the complete setup

---

## Verification Steps

1. Run `npm run format:write` to format all files
2. Run `npm run lint` to check for linting errors
3. Run `npm run test:unit` to ensure tests pass
4. Make a test commit with conventional commit format
5. Verify git hooks are working
6. Push to GitHub and verify CI/CD workflow runs

---

## Notes

- The CI/CD workflow uses `runs-on: self-hosted` as requested
- All hooks use `npx` to ensure tools are available without global installation
- lint-staged only runs on staged files for performance
- Coverage reports are uploaded as artifacts in CI/CD
- Release job only runs on push to main branch, not on PRs
