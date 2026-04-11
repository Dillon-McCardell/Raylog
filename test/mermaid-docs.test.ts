import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  buildTaskDetailActionSpecs,
  buildTaskListActionSpecs,
} from "../src/lib/task-flow";

const workspaceRoot = path.resolve(__dirname, "..");

test("development docs include the complete validated command flow", async () => {
  const markdown = await readWorkspaceFile("docs/DEVELOPMENT.md");
  const diagram = extractSingleMermaidBlock(markdown, "docs/DEVELOPMENT.md");
  const parsed = parseMermaidFlow(diagram);

  assertEdge(parsed, "Raylog", "", "List Tasks command");
  assertEdge(parsed, "Raylog", "", "Add Task command");
  assertEdge(parsed, "Raylog", "", "Refresh Menu Bar command");
  assertEdge(
    parsed,
    "List Tasks command",
    "",
    "Storage note configured and valid?",
  );
  assertEdge(
    parsed,
    "Add Task command",
    "",
    "Storage note configured and valid?",
  );
  assertEdge(
    parsed,
    "Storage note configured and valid?",
    "No",
    "Setup / reset empty state",
  );
  assertEdge(
    parsed,
    "Setup / reset empty state",
    "Open Extension Preferences",
    "Storage note configured and valid?",
  );
  assertEdge(
    parsed,
    "Setup / reset empty state",
    "Generate New Task Database",
    "Storage note configured and valid?",
  );
  assertEdge(
    parsed,
    "Setup / reset empty state",
    "Reset Storage Note",
    "Storage note configured and valid?",
  );

  assertEdge(
    parsed,
    "Storage note configured and valid?",
    "Yes, launch last used list layout",
    "Task summary with detail pane",
  );
  assertEdge(
    parsed,
    "Storage note configured and valid?",
    "Yes, launch last used list layout",
    "Task list without detail pane",
  );
  assertEdge(
    parsed,
    "Storage note configured and valid?",
    "Yes, launch Add Task",
    "Standalone Add Task form",
  );
  assertEdge(
    parsed,
    "Task summary with detail pane",
    "Enter",
    "View Task window",
  );
  assertEdge(
    parsed,
    "Task summary with detail pane",
    "Cmd+F",
    "Task list without detail pane",
  );
  assertEdge(
    parsed,
    "Task summary with detail pane",
    "Cmd+L",
    "Edit Task form (new log focused)",
  );
  assertEdge(
    parsed,
    "Task summary with detail pane",
    "Cmd+Shift+C",
    "Complete selected task",
  );
  assertEdge(
    parsed,
    "Task summary with detail pane",
    "Cmd+N",
    "Add Task form",
  );
  assertEdge(
    parsed,
    "Task summary with detail pane",
    "Cmd+E",
    "Edit Task form",
  );
  assertEdge(
    parsed,
    "Task list without detail pane",
    "Enter",
    "View Task window",
  );
  assertEdge(
    parsed,
    "Task list without detail pane",
    "Cmd+F",
    "Task summary with detail pane",
  );
  assertEdge(
    parsed,
    "Full-window task detail",
    "Default action: Log Work",
    "Edit Task form (new log focused)",
  );
  assertEdge(parsed, "Full-window task detail", "Cmd+Shift+C", "Complete task");
  assertEdge(
    parsed,
    "Edit Task form (new log focused)",
    "Save",
    "Full-window task detail",
  );
  assertEdge(parsed, "Full-window task detail", "Delete Task", "Delete task");
  assertEdge(
    parsed,
    "Current task in menu bar",
    "Click current task",
    "Menu bar task submenu",
  );
  assertEdge(
    parsed,
    "Current task in menu bar",
    "Click task in Next 5 Tasks",
    "Menu bar task submenu",
  );
  assertEdge(
    parsed,
    "Menu bar task submenu",
    "Open Task",
    "Full-window task detail",
  );
  assertEdge(
    parsed,
    "Menu bar task submenu",
    "Start Task",
    "Start task",
  );
  assertEdge(
    parsed,
    "Menu bar task submenu",
    "Complete Task",
    "Complete task",
  );
  assertEdge(
    parsed,
    "Menu bar task submenu",
    "Archive Task",
    "Archive task",
  );
  assertEdge(
    parsed,
    "Current task in menu bar",
    "Open Task List",
    "Task summary with detail pane",
  );
  assertEdge(
    parsed,
    "Current task in menu bar",
    "Open Task List",
    "Task list without detail pane",
  );
  assertEdge(
    parsed,
    "Refresh Menu Bar command",
    "No storage note",
    "Set Up Raylog menu bar state",
  );
  assertEdge(
    parsed,
    "Set Up Raylog menu bar state",
    "Open Extension Preferences",
    "Storage note configured and valid?",
  );

  assert.ok(!diagram.includes("Cmd+Shift+O"));
  assert.ok(!diagram.includes("Log Task command"));
  assert.ok(!diagram.includes("Task Metadata window"));
});

test("readme includes the simplified user-facing window flow", async () => {
  const markdown = await readWorkspaceFile("README.md");
  const diagram = extractSingleMermaidBlock(
    markdown,
    "README.md",
    "### Window Flow",
  );
  const parsed = parseMermaidFlow(diagram);

  assertEdge(parsed, "Raylog", "", "List Tasks");
  assertEdge(parsed, "Raylog", "", "Add Task");
  assertEdge(parsed, "Raylog", "", "Refresh Menu Bar");
  assertEdge(parsed, "List Tasks", "", "Storage note valid");
  assertEdge(parsed, "Add Task", "", "Storage note valid");
  assertEdge(parsed, "Storage note valid", "No", "Setup or reset state");
  assertEdge(parsed, "List Tasks", "Open last used view", "Task Summary");
  assertEdge(parsed, "List Tasks", "Open last used view", "Task List");

  assertEdge(parsed, "Task Summary", "Enter", "View Task");
  assertEdge(parsed, "Task Summary", "Cmd+F", "Task List");
  assertEdge(
    parsed,
    "Task Summary",
    "Cmd+L",
    "Edit Task Form (new log focused)",
  );
  assertEdge(parsed, "Task List", "Enter", "View Task");
  assertEdge(parsed, "Task List", "Cmd+F", "Task Summary");
  assertEdge(
    parsed,
    "View Task",
    "Default action: Log Work",
    "Edit Task Form (new log focused)",
  );
  assertEdge(parsed, "View Task", "Cmd+Shift+C", "Complete Task");
  assertEdge(
    parsed,
    "Refresh Menu Bar",
    "Click current or next task",
    "Task Submenu",
  );
  assertEdge(
    parsed,
    "Task Submenu",
    "Open Task",
    "View Task",
  );
  assertEdge(
    parsed,
    "Task Submenu",
    "Start or Complete",
    "Lifecycle Action",
  );
  assertEdge(parsed, "Refresh Menu Bar", "Open Task List", "List Tasks");
  assertEdge(parsed, "Task Submenu", "Archive Task", "Lifecycle Action");
  assertEdge(
    parsed,
    "Refresh Menu Bar",
    "No storage note",
    "Setup or reset state",
  );

  assert.ok(!diagram.includes("Cmd+Shift+O"));
  assert.ok(!diagram.includes("Log Task"));
});

test("implementation still matches the documented key shortcuts", async () => {
  const readme = await readWorkspaceFile("README.md");
  const task = createTask();
  const listSpecs = buildTaskListActionSpecs({
    notePath: "/tmp/raylog-test.md",
    repository: createRepositoryStub(),
    onReload: async () => undefined,
    task,
    taskLogStatusBehavior: "auto_start",
  });
  const detailSpecs = buildTaskDetailActionSpecs({
    notePath: "/tmp/raylog-test.md",
    repository: createRepositoryStub(),
    task,
    taskLogStatusBehavior: "auto_start",
    onReload: async () => undefined,
    onDidDelete: async () => undefined,
  });

  assert.ok(listSpecs.some((spec) => spec.title === "Open Task"));
  assert.deepEqual(
    listSpecs.find((spec) => spec.title === "Log Work")?.shortcut,
    { modifiers: ["cmd"], key: "l" },
  );
  assert.deepEqual(
    listSpecs.find((spec) => spec.title === "Complete Task")?.shortcut,
    { modifiers: ["cmd", "shift"], key: "c" },
  );
  assert.equal(detailSpecs[0]?.title, "Log Work");
  assert.deepEqual(
    detailSpecs.find((spec) => spec.title === "Complete Task")?.shortcut,
    { modifiers: ["cmd", "shift"], key: "c" },
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
    const line = rawLine.trim().replace(/([A-Za-z0-9_]+)\["[^"]+"\]/g, "$1");
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
      (edge) => edge.from === from && edge.action === action && edge.to === to,
    ),
    `Missing Mermaid edge: ${from} --${action || "(unlabeled)"}--> ${to}`,
  );
}

function createRepositoryStub() {
  return {
    completeTask: async () => createTask({ status: "done" }),
    updateTask: async () => createTask(),
    createTask: async () => createTask(),
    createWorkLog: async () => ({
      id: "log-2",
      body: "Logged progress",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: null,
    }),
    startTask: async () => createTask({ status: "in_progress" }),
    reopenTask: async () => createTask(),
    archiveTask: async () => createTask({ status: "archived" }),
    deleteTask: async () => undefined,
  } as never;
}

function createTask(
  overrides: Partial<{
    id: string;
    header: string;
    body: string;
    workLogs: never[];
    status: "open" | "in_progress" | "done" | "archived";
    dueDate: null;
    startDate: null;
    completedAt: null;
    createdAt: string;
    updatedAt: string;
  }> = {},
) {
  return {
    id: "task-id",
    header: "Task",
    body: "Task body",
    workLogs: [],
    status: "open" as const,
    dueDate: null,
    startDate: null,
    completedAt: null,
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}
