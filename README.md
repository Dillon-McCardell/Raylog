# Raylog

Minimal markdown task management, powered by Raycast.

Raylog is a lightweight Raycast extension for managing tasks stored in a single
markdown file. It is inspired by the Obsidian Tasks Raycast extension, but it is
designed to be fully standalone: you do not need Obsidian, an Obsidian vault, or
the Obsidian Tasks plugin. You only need Raycast and a markdown file.

## Features

- **List Tasks**: Browse active and completed tasks in a searchable Raycast list
- **Add Task**: Create new tasks from Raycast with a focused form workflow
- **Edit Task**: Update any task directly from the main task list
- **Complete Task**: Mark tasks complete without leaving the list view
- **Markdown File Storage**: Keep all task data in one user-selected markdown file
- **Standalone by Design**: No Obsidian dependency, no vault scanning, no plugin requirement

## Why Raylog

Raylog is built for people who want the speed of Raycast and the portability of a
plain markdown file, without adopting a larger notes workflow.

Use it if you want:

- a minimal task manager that lives inside Raycast
- a single local markdown file as your source of truth
- structured task storage without needing a separate app or backend

## Requirements

- [Raycast](https://raycast.com)
- A markdown file to use as your Raylog storage note

## Configuration

Raylog stores tasks in the markdown file configured in the extension settings.

On first use, Raycast will prompt you to select the required **Storage Note**
preference. Once selected, that file path is shown in Raycast settings and used as
the persistent storage target for all task actions.

## Usage

### List Tasks

Open **List Tasks** to view and manage everything in one place.

From the list you can:

- search tasks by header or body
- review open and completed tasks in separate sections
- open a task in the detail pane
- edit a task
- mark a task complete
- create a new task

### Add Task

Open **Add Task** to create a task with the following fields:

- **Header** (required)
- **Body**
- **Due Date**
- **Start Date**
- **Finish Date**

## Storage Model

Raylog uses a machine-readable JSON payload embedded inside your markdown file.
This makes writes reliable and keeps the storage format stable for future changes.

Raylog manages a fenced JSON block wrapped in markers:

````md
<!-- raylog:start -->
```json
{
  "schemaVersion": 1,
  "tasks": []
}
```
<!-- raylog:end -->
````

Markdown outside the managed block is preserved.

This means the storage note is intended primarily for Raylog itself, not for
hand-editing by humans.

## Relationship to Obsidian Tasks

Raylog is based on the standalone work originally developed around the Obsidian
Tasks Raycast extension workflow and UI patterns, but it serves a different goal.

Unlike Obsidian Tasks:

- Raylog does **not** require Obsidian
- Raylog does **not** require the Obsidian Tasks plugin
- Raylog does **not** use Obsidian task-line syntax as its storage format

Instead, Raylog focuses on being a compact markdown-backed task manager built with
the power of Raycast.

## Troubleshooting

- **Tasks do not appear**: Confirm the configured **Storage Note** points to the
  markdown file you expect
- **The setup prompt keeps appearing**: Open Raycast extension settings and make
  sure the required **Storage Note** preference is set
- **The markdown file looks unusual**: This is expected; Raylog stores tasks in a
  machine-oriented format for reliable parsing and updates

## Development

```bash
npm install
npm test
npm run lint
npm run build
```
