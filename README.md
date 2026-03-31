# Raylog

Raylog is a standalone Raycast extension for local task capture and management.

It stores tasks in a single user-selected markdown note using a machine-readable JSON
payload embedded inside a fenced code block. The note is intended for reliable
round-trip editing by the extension rather than human-friendly markdown authoring.

## Features

- First-run setup that prompts for a markdown note
- Local markdown-backed task storage with no Obsidian dependency
- Add tasks and manage them from a single list view
- Required `Header` plus optional `Body`, `Due Date`, `Start Date`, and `Finish Date`
- Active and completed task sections in the main list
- Re-point storage to a different markdown file from inside the extension

## Storage Model

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

## Development

```bash
npm install
npm test
npm run lint
npm run build
```
