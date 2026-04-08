# Raylog

Focused task management in Raycast, backed by a single standalone markdown note.

Raylog is a compact Raycast extension for people who want fast local task capture
without adopting a larger notes or project-management stack. It stores tasks in
one markdown file, but the workflow is built entirely around Raycast.

## Features

- Status-driven task lifecycle: `Open`, `In Progress`, `Done`, `Archived`
- Filtered list views for focused review instead of one long mixed list
- Urgency-aware ordering for active work
- Optional macOS menu bar task view for active work
- Configurable list metadata for due and start countdown indicators
- Quick actions for start, complete, reopen, archive, and delete
- Structured markdown-backed storage with resettable setup

## Workflow

### List Tasks

Use **List Tasks** to manage work from one command.

- Filter by `Inbox / Open`, `In Progress`, `Due Soon`, `Done`, or `Archived`
- Search task headers and bodies within the active view
- Jump between task views with `Cmd-1` through `Cmd-6`
- Preview the task body and work logs in the detail pane
- Use `Cmd+L` to jump straight into logging from the selected task
- Trigger lifecycle actions without leaving the list
- Open the form to edit or create tasks

### Add Task

Use **Add Task** to create a task with:

- **Header** (required)
- **Body**
- **Status**
- **Due Date**
- **Start Date**

### Refresh Menu Bar

Use **Refresh Menu Bar** to show your current Raylog task in the macOS menu bar.

- This feature is off by default until you enable the menu bar command in Raycast
- It only shows active tasks (`Open` and `In Progress`)
- Clicking the current task or a task in the `Next 5 Tasks` section opens that task
- You can complete the current task directly from the menu bar dropdown

To enable it:

1. Open Raycast and run `Refresh Menu Bar`
2. Activate the command in Raycast's built-in menu bar controls if prompted

To disable it:

1. Open Raycast settings for `Refresh Menu Bar`
2. Use Raycast's built-in `Deactivate` control for that menu bar command

### Window Flow

Raylog revolves around three entry commands plus a shared storage/setup gate
before the list and add-task flows can render.

```mermaid
flowchart TD
    A["Raylog"] --> B["List Tasks"]
    A --> C["Add Task"]
    A --> M["Refresh Menu Bar"]

    B --> Z["Storage note valid"]
    C --> Z
    Z -->|"No"| X["Setup or reset state"]
    Z -->|"Yes"| B

    B -->|"Enter"| E["View Task"]
    B -->|"Cmd+L"| I["Log Work Form"]
    B -->|"Cmd+N"| F["Add Task Form"]
    B -->|"Cmd+E"| G["Edit Task"]
    B -->|"Cmd+Shift+C"| H["Complete Task"]

    E -->|"Default action: Log Work"| I
    E -->|"Cmd+E"| G
    E -->|"Cmd+Shift+C"| J["Complete Task"]
    E -->|"Archive or Delete"| K["Lifecycle Action"]

    I -->|"Save Log"| E
    G -->|"Save"| E
    F -->|"Save"| B
    H --> B
    J --> E
    K --> E

    M -->|"Click current or next task"| E
    M -->|"Open Task List"| B
    M -->|"Complete Current Task"| J
    M -->|"No storage note"| X
```

## Storage Model

Raylog manages a JSON block inside your configured markdown note.

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

Markdown outside the managed block is preserved. The managed block is intended to
be written by Raylog, not edited manually.

If the storage block is malformed or from an old schema, Raylog will prompt you
to reset the note to a fresh v1 document.

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
