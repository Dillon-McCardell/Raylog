import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createEmptyDocument,
  ensureStorageNote,
  mergeRaylogMarkdown,
  parseRaylogMarkdown,
  RaylogInitializationRequiredError,
  RaylogParseError,
  RaylogRepository,
  RaylogSchemaError,
  resetStorageNote,
} from "../src/lib/storage";
import type { TaskRecord } from "../src/lib/types";

test("flags an empty markdown note for initialization", async () => {
  const notePath = await createTempMarkdownFile("");
  await assert.rejects(
    () => ensureStorageNote(notePath),
    RaylogInitializationRequiredError,
  );
});

test("parses a valid v5 markdown note with a Raylog block", () => {
  const markdown = mergeRaylogMarkdown("# Notes\n", {
    schemaVersion: 5,
    tasks: [
      {
        id: "task-1",
        header: "Header",
        body: "Body",
        workLogs: [],
        status: "open",
        dueDate: null,
        startDate: null,
        completedAt: null,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
      },
    ],
    viewState: {
      hasSelectedListTasksFilter: true,
      listTasksFilter: "done",
    },
  });

  const parsed = parseRaylogMarkdown(markdown);
  assert.equal(parsed.hasManagedBlock, true);
  assert.equal(parsed.document.tasks[0].status, "open");
  assert.equal(parsed.document.tasks[0].dueDate, null);
  assert.equal(parsed.document.viewState.listTasksFilter, "done");
});

test("throws on invalid JSON inside the Raylog block", () => {
  assert.throws(
    () => {
      parseRaylogMarkdown(
        `<!-- raylog:start -->
\`\`\`json
{
  "schemaVersion": 5,
  nope,
  "tasks": []
}
\`\`\`
<!-- raylog:end -->
`,
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof RaylogParseError);
      assert.match(error.message, /Raylog database is corrupted/i);
      assert.match(error.message, /Malformed JSON near line 3, column 3/i);
      return true;
    },
  );
});

test("describes malformed task data inside the Raylog block", () => {
  assert.throws(
    () => {
      parseRaylogMarkdown(
        mergeRaylogMarkdown("", {
          schemaVersion: 5,
          tasks: [
            {
              id: "task-1",
              header: "",
              body: "",
              workLogs: [],
              status: "open",
              dueDate: null,
              startDate: null,
              completedAt: null,
              createdAt: "2026-03-31T00:00:00.000Z",
              updatedAt: "2026-03-31T00:00:00.000Z",
            } as unknown as TaskRecord,
          ],
          viewState: {
            hasSelectedListTasksFilter: false,
            listTasksFilter: "all",
          },
        }),
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof RaylogParseError);
      assert.match(error.message, /Raylog database is corrupted/i);
      assert.match(
        error.message,
        /Malformed task data: task header is invalid/i,
      );
      return true;
    },
  );
});

test("describes unsupported schema versions clearly", () => {
  const markdown = mergeRaylogMarkdown("", {
    schemaVersion: 4,
    tasks: [],
    viewState: {
      hasSelectedListTasksFilter: false,
      listTasksFilter: "all",
    },
  });

  assert.throws(
    () => parseRaylogMarkdown(markdown),
    (error: unknown) => {
      assert.ok(error instanceof RaylogSchemaError);
      assert.match(error.message, /unsupported schema version/i);
      assert.match(error.message, /Expected schema v5, found schema v4/i);
      return true;
    },
  );
});

test("throws on an outdated schema", () => {
  const markdown = mergeRaylogMarkdown("", {
    schemaVersion: 4,
    tasks: [],
    viewState: {
      hasSelectedListTasksFilter: false,
      listTasksFilter: "all",
    },
  });

  assert.throws(() => parseRaylogMarkdown(markdown), RaylogSchemaError);
});

test("flags a missing block while preserving markdown content", async () => {
  const originalMarkdown = "# Existing Note\n\nKeep this text.";
  const notePath = await createTempMarkdownFile(originalMarkdown);

  await assert.rejects(
    () => ensureStorageNote(notePath),
    RaylogInitializationRequiredError,
  );

  const unchangedMarkdown = await fs.promises.readFile(notePath, "utf8");
  assert.match(unchangedMarkdown, /# Existing Note/);
  assert.match(unchangedMarkdown, /Keep this text\./);
  assert.doesNotMatch(unchangedMarkdown, /raylog:start/);
});

test("supports the current task lifecycle without clobbering surrounding markdown", async () => {
  const notePath = await createTempMarkdownFile("# Header\n\nContext above.\n");
  await resetStorageNote(notePath);
  const repository = new RaylogRepository(notePath);

  const created = await repository.createTask({
    header: "Ship Raylog",
    body: "Implement storage",
  });

  const started = await repository.startTask(created.id);
  assert.equal(started.status, "in_progress");

  const updated = await repository.updateTask(created.id, {
    header: "Ship Raylog v2",
    body: "Implement storage and UI",
    workLogs: [],
    status: "in_progress",
    dueDate: "2026-04-03T00:00:00.000Z",
    startDate: "2026-03-30T00:00:00.000Z",
  });

  assert.equal(updated.header, "Ship Raylog v2");
  assert.equal(updated.startDate, "2026-03-30T00:00:00.000Z");

  const completed = await repository.completeTask(created.id);
  assert.equal(completed.status, "done");
  assert.ok(completed.completedAt);

  const reopened = await repository.reopenTask(created.id);
  assert.equal(reopened.status, "open");
  assert.equal(reopened.completedAt, null);

  const archived = await repository.archiveTask(created.id);
  assert.equal(archived.status, "archived");

  await repository.deleteTask(created.id);
  const finalMarkdown = await fs.promises.readFile(notePath, "utf8");
  assert.match(finalMarkdown, /Context above\./);
  assert.doesNotMatch(finalMarkdown, /Ship Raylog v2/);
});

test("creates, updates, and deletes work logs without clobbering markdown", async () => {
  const notePath = await createTempMarkdownFile("# Header\n\nContext above.\n");
  await resetStorageNote(notePath);
  const repository = new RaylogRepository(notePath);

  const createdTask = await repository.createTask({
    header: "Ship Raylog",
    body: "Implement storage",
  });

  const createdWorkLog = await repository.createWorkLog(createdTask.id, {
    body: "Implemented first pass",
  });
  assert.equal(createdWorkLog.updatedAt, null);

  const taskAfterCreate = await repository.getTask(createdTask.id);
  assert.equal(taskAfterCreate.workLogs.length, 1);
  assert.equal(taskAfterCreate.workLogs[0]?.body, "Implemented first pass");
  assert.ok(taskAfterCreate.updatedAt >= createdTask.updatedAt);

  const updatedWorkLog = await repository.updateWorkLog(
    createdTask.id,
    createdWorkLog.id,
    { body: "Implemented and tested first pass" },
  );
  assert.ok(updatedWorkLog.updatedAt);

  const taskAfterUpdate = await repository.getTask(createdTask.id);
  assert.equal(
    taskAfterUpdate.workLogs[0]?.body,
    "Implemented and tested first pass",
  );

  await repository.deleteWorkLog(createdTask.id, createdWorkLog.id);
  const taskAfterDelete = await repository.getTask(createdTask.id);
  assert.deepEqual(taskAfterDelete.workLogs, []);

  const finalMarkdown = await fs.promises.readFile(notePath, "utf8");
  assert.match(finalMarkdown, /Context above\./);
});

test("resets malformed storage to a fresh v5 document", async () => {
  const notePath = await createTempMarkdownFile(
    "<!-- raylog:start -->\n```json\n{bad-json}\n```\n<!-- raylog:end -->\n",
  );

  await resetStorageNote(notePath);
  const markdown = await fs.promises.readFile(notePath, "utf8");
  const parsed = parseRaylogMarkdown(markdown);

  assert.equal(parsed.document.schemaVersion, 5);
  assert.deepEqual(parsed.document.tasks, []);
});

test("creates a fresh database for an empty markdown note on reset", async () => {
  const notePath = await createTempMarkdownFile("");

  await resetStorageNote(notePath);
  const markdown = await fs.promises.readFile(notePath, "utf8");
  const parsed = parseRaylogMarkdown(markdown);

  assert.equal(parsed.document.schemaVersion, 5);
  assert.deepEqual(parsed.document.tasks, []);
});

test("throws when mutating a missing task", async () => {
  const notePath = await createTempMarkdownFile("");
  await resetStorageNote(notePath);
  const repository = new RaylogRepository(notePath);

  await assert.rejects(() => repository.completeTask("missing"));
  await assert.rejects(() => repository.deleteTask("missing"));
});

test("persists the selected list filter in the storage document", async () => {
  const notePath = await createTempMarkdownFile("");
  await resetStorageNote(notePath);
  const repository = new RaylogRepository(notePath);

  await repository.setListTasksFilter("archived");

  assert.equal(await repository.getListTasksFilter(), "archived");
  const markdown = await fs.promises.readFile(notePath, "utf8");
  assert.match(markdown, /"hasSelectedListTasksFilter": true/);
  assert.match(markdown, /"listTasksFilter": "archived"/);
});

test("defaults to all for current view state until a filter is explicitly selected", async () => {
  const notePath = await createTempMarkdownFile(
    `<!-- raylog:start -->
\`\`\`json
{
  "schemaVersion": 5,
  "tasks": [],
  "viewState": {
    "listTasksFilter": "open"
  }
}
\`\`\`
<!-- raylog:end -->
`,
  );
  const repository = new RaylogRepository(notePath);

  assert.equal(await repository.getListTasksFilter(), "all");
});

test("rejects v5 documents with blocked tasks", () => {
  const markdown = mergeRaylogMarkdown("", {
    schemaVersion: 5,
    tasks: [
      {
        id: "task-1",
        header: "Header",
        body: "",
        workLogs: [],
        status: "blocked",
        dueDate: null,
        startDate: null,
        completedAt: null,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
      } as unknown as TaskRecord,
    ],
    viewState: {
      hasSelectedListTasksFilter: false,
      listTasksFilter: "all",
    },
  });

  assert.throws(() => parseRaylogMarkdown(markdown), RaylogParseError);
});

test("rejects v5 documents with dependency fields", () => {
  const markdown = mergeRaylogMarkdown("", {
    schemaVersion: 5,
    tasks: [
      {
        id: "task-1",
        header: "Header",
        body: "",
        workLogs: [],
        status: "open",
        blockedByTaskIds: ["task-2"],
        dueDate: null,
        startDate: null,
        completedAt: null,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
      } as unknown as TaskRecord,
    ],
    viewState: {
      hasSelectedListTasksFilter: false,
      listTasksFilter: "all",
    },
  });

  assert.throws(() => parseRaylogMarkdown(markdown), RaylogParseError);
});

test("rejects v5 documents with malformed work logs", () => {
  const markdown = mergeRaylogMarkdown("", {
    schemaVersion: 5,
    tasks: [
      {
        id: "task-1",
        header: "Header",
        body: "",
        workLogs: [
          { id: "log-1", body: "", createdAt: "2026-03-31T00:00:00.000Z" },
        ],
        status: "open",
        dueDate: null,
        startDate: null,
        completedAt: null,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
      } as unknown as TaskRecord,
    ],
    viewState: {
      hasSelectedListTasksFilter: false,
      listTasksFilter: "all",
    },
  });

  assert.throws(() => parseRaylogMarkdown(markdown), RaylogParseError);
});

async function createTempMarkdownFile(contents: string): Promise<string> {
  const directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "raylog-"),
  );
  const notePath = path.join(directory, "tasks.md");
  await fs.promises.writeFile(notePath, contents, "utf8");
  return notePath;
}
