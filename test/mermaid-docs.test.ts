import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const workspaceRoot = path.resolve(__dirname, "..");

test("development docs include the complete validated command flow", async () => {
  const markdown = await readWorkspaceFile("docs/DEVELOPMENT.md");
  const diagram = extractSingleMermaidBlock(markdown, "docs/DEVELOPMENT.md");
  const parsed = parseMermaidFlow(diagram);

  assertEdge(parsed, "Raylog", "", "List Tasks command");
  assertEdge(parsed, "Raylog", "", "Add Task command");
  assertEdge(parsed, "Raylog", "", "Refresh Menu Bar command");
  assertEdge(parsed, "List Tasks command", "", "Storage note configured and valid?");
  assertEdge(parsed, "Add Task command", "", "Storage note configured and valid?");
  assertEdge(parsed, "Storage note configured and valid?", "No", "Setup / reset empty state");
  assertEdge(parsed, "Setup / reset empty state", "Open Extension Preferences", "Storage note configured and valid?");
  assertEdge(parsed, "Setup / reset empty state", "Generate New Task Database", "Storage note configured and valid?");
  assertEdge(parsed, "Setup / reset empty state", "Reset Storage Note", "Storage note configured and valid?");

  assertEdge(parsed, "Storage note configured and valid?", "Yes, launch List Tasks", "Task list with detail pane");
  assertEdge(parsed, "Storage note configured and valid?", "Yes, launch Add Task", "Standalone Add Task form");
  assertEdge(parsed, "Task list with detail pane", "Enter", "View Task window");
  assertEdge(parsed, "Task list with detail pane", "Cmd+L", "Log Work form");
  assertEdge(parsed, "Task list with detail pane", "Cmd+Shift+C", "Complete selected task");
  assertEdge(parsed, "Task list with detail pane", "Cmd+N", "Add Task form");
  assertEdge(parsed, "Task list with detail pane", "Cmd+E", "Edit Task form");
  assertEdge(parsed, "Full-window task detail", "Default action: Log Work", "Log Work form");
  assertEdge(parsed, "Full-window task detail", "Cmd+Shift+C", "Complete task");
  assertEdge(parsed, "Log Work form", "Save Log", "Full-window task detail");
  assertEdge(parsed, "Full-window task detail", "Delete Task", "Delete task");
  assertEdge(parsed, "Current task in menu bar", "Click current task", "Full-window task detail");
  assertEdge(parsed, "Current task in menu bar", "Click task in Next 5 Tasks", "Full-window task detail");
  assertEdge(parsed, "Current task in menu bar", "Open Task List", "Task list with detail pane");
  assertEdge(parsed, "Current task in menu bar", "Complete Current Task", "Complete current task");
  assertEdge(parsed, "Refresh Menu Bar command", "No storage note", "Set Up Raylog menu bar state");
  assertEdge(parsed, "Set Up Raylog menu bar state", "Open Extension Preferences", "Storage note configured and valid?");

  assert.ok(!diagram.includes("Cmd+Shift+O"));
  assert.ok(!diagram.includes("Log Task command"));
  assert.ok(!diagram.includes("Task Metadata window"));
});

test("readme includes the simplified user-facing window flow", async () => {
  const markdown = await readWorkspaceFile("README.md");
  const diagram = extractSingleMermaidBlock(markdown, "README.md", "### Window Flow");
  const parsed = parseMermaidFlow(diagram);

  assertEdge(parsed, "Raylog", "", "List Tasks");
  assertEdge(parsed, "Raylog", "", "Add Task");
  assertEdge(parsed, "Raylog", "", "Refresh Menu Bar");
  assertEdge(parsed, "List Tasks", "", "Storage note valid");
  assertEdge(parsed, "Add Task", "", "Storage note valid");
  assertEdge(parsed, "Storage note valid", "No", "Setup or reset state");
  assertEdge(parsed, "Storage note valid", "Yes", "List Tasks");

  assertEdge(parsed, "List Tasks", "Enter", "View Task");
  assertEdge(parsed, "List Tasks", "Cmd+L", "Log Work Form");
  assertEdge(parsed, "View Task", "Default action: Log Work", "Log Work Form");
  assertEdge(parsed, "View Task", "Cmd+Shift+C", "Complete Task");
  assertEdge(parsed, "Refresh Menu Bar", "Click current or next task", "View Task");
  assertEdge(parsed, "Refresh Menu Bar", "Open Task List", "List Tasks");
  assertEdge(parsed, "Refresh Menu Bar", "Complete Current Task", "Complete Task");
  assertEdge(parsed, "Refresh Menu Bar", "No storage note", "Setup or reset state");

  assert.ok(!diagram.includes("Cmd+Shift+O"));
  assert.ok(!diagram.includes("Log Task"));
});

test("implementation still matches the documented key shortcuts", async () => {
  const listScreen = await readWorkspaceFile("src/components/TaskListScreen.tsx");
  const taskDetailView = await readWorkspaceFile(
    "src/components/TaskDetailView.tsx",
  );
  const readme = await readWorkspaceFile("README.md");

  assert.match(listScreen, /title="Open Task"/);
  assert.match(
    listScreen,
    /title="Log Work"[\s\S]*shortcut=\{\{ modifiers: \["cmd"\], key: "l" \}\}/,
  );
  assert.match(
    listScreen,
    /title="Complete Task"[\s\S]*shortcut=\{\{ modifiers: \["cmd", "shift"\], key: "c" \}\}/,
  );

  assert.match(taskDetailView, /title="Log Work"/);
  assert.match(
    taskDetailView,
    /title="Complete Task"[\s\S]*shortcut=\{\{ modifiers: \["cmd", "shift"\], key: "c" \}\}/,
  );

  assert.match(readme, /"schemaVersion": 1/);
});

async function readWorkspaceFile(relativePath: string): Promise<string> {
  return fs.promises.readFile(path.join(workspaceRoot, relativePath), "utf8");
}

function extractSingleMermaidBlock(
  markdown: string,
  fileLabel: string,
  anchor?: string,
): string {
  const scopedMarkdown = anchor
    ? markdown.slice(markdown.indexOf(anchor))
    : markdown;
  const matches = [...scopedMarkdown.matchAll(/```mermaid\n([\s\S]*?)```/g)];

  assert.equal(
    matches.length,
    1,
    `${fileLabel} should contain exactly one Mermaid block in the targeted section.`,
  );

  return matches[0][1].trim();
}

function parseMermaidFlow(diagram: string): {
  labelsById: Map<string, string>;
  edges: Array<{ from: string; action: string; to: string }>;
} {
  const labelsById = new Map<string, string>();
  for (const match of diagram.matchAll(/([A-Za-z0-9_]+)\["([^"]+)"\]/g)) {
    labelsById.set(match[1], match[2]);
  }

  const edges: Array<{ from: string; action: string; to: string }> = [];
  for (const rawLine of diagram.split("\n")) {
    const line = rawLine
      .trim()
      .replace(/([A-Za-z0-9_]+)\["[^"]+"\]/g, "$1");
    const match = line.match(
      /^([A-Za-z0-9_]+)\s*-->\s*(?:\|"([^"]+)"\||\|([^|]+)\|)?\s*([A-Za-z0-9_]+)/,
    );

    if (!match) {
      continue;
    }

    edges.push({
      from: labelsById.get(match[1]) ?? match[1],
      action: (match[2] ?? match[3] ?? "").trim(),
      to: labelsById.get(match[4]) ?? match[4],
    });
  }

  return { labelsById, edges };
}

function assertEdge(
  parsed: {
    edges: Array<{ from: string; action: string; to: string }>;
  },
  from: string,
  action: string,
  to: string,
) {
  assert.ok(
    parsed.edges.some(
      (edge) =>
        edge.from === from && edge.action === action && edge.to === to,
    ),
    `Missing Mermaid edge: ${from} --${action || "(unlabeled)"}--> ${to}`,
  );
}
