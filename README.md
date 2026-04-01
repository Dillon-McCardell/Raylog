# Raylog

Focused task management in Raycast, backed by a single standalone markdown note.

Raylog is a compact Raycast extension for people who want fast local task capture
without adopting a larger notes or project-management stack. It stores tasks in
one markdown file, but the workflow is built entirely around Raycast.

## Features

- Status-driven task lifecycle: `Open`, `In Progress`, `Done`, `Archived`
- Filtered list views for focused review instead of one long mixed list
- Urgency-aware ordering for active work
- Configurable list metadata for due and start countdown indicators
- Quick actions for start, complete, reopen, archive, and delete
- Structured markdown-backed storage with resettable setup

## Workflow

### List Tasks

Use **List Tasks** to manage work from one command.

- Filter by `Inbox / Open`, `In Progress`, `Due Soon`, `Done`, or `Archived`
- Search task headers and bodies within the active view
- Jump between task views with `Cmd-1` through `Cmd-6`
- Review task metadata in the detail pane
- Trigger lifecycle actions without leaving the list
- Open the form to edit or create tasks

### Add Task

Use **Add Task** to create a task with:

- **Header** (required)
- **Body**
- **Status**
- **Due Date**
- **Start Date**

## Storage Model

Raylog manages a JSON block inside your configured markdown note.

````md
<!-- raylog:start -->
```json
{
  "schemaVersion": 2,
  "tasks": []
}
```
<!-- raylog:end -->
````

Markdown outside the managed block is preserved. The managed block is intended to
be written by Raylog, not edited manually.

If the storage block is malformed or from an old schema, Raylog will prompt you
to reset the note to a fresh v2 document.

## Configuration

Set the **Storage Note** preference in Raycast to any existing `.md` file. Raylog
will initialize the managed block automatically when the file is empty or missing
the Raylog block.

`List Tasks` also has command-specific preferences for:

- showing the due countdown indicator
- showing the start countdown indicator
- choosing how many days count as `Due Soon`

## Troubleshooting

- If tasks do not load, verify that **Storage Note** points at the expected
  markdown file.
- If Raylog reports a schema or parse error, use the in-app reset action to
  reinitialize the managed block.
- If the setup prompt repeats, open Raycast extension settings and confirm the
  file path is still valid.

## Development

```bash
npm install
npm test
npm run lint
npm run build
```
