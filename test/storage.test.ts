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
  RaylogParseError,
  RaylogRepository,
  RaylogSchemaError,
  resetStorageNote,
} from "../src/lib/storage";

test("bootstraps an empty markdown note", async () => {
  const notePath = await createTempMarkdownFile("");
  await ensureStorageNote(notePath);
  const markdown = await fs.promises.readFile(notePath, "utf8");

  assert.match(markdown, /raylog:start/);
  assert.deepEqual(parseRaylogMarkdown(markdown).document, createEmptyDocument());
});

test("parses a valid v2 markdown note with a Raylog block", () => {
  const markdown = mergeRaylogMarkdown("# Notes\n", {
    schemaVersion: 2,
    tasks: [
      {
        id: "task-1",
        header: "Header",
        body: "Body",
        status: "open",
        dueDate: null,
        startDate: null,
        completedAt: null,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
      },
    ],
  });

  const parsed = parseRaylogMarkdown(markdown);
  assert.equal(parsed.hasManagedBlock, true);
  assert.equal(parsed.document.tasks[0].status, "open");
});

test("throws on invalid JSON inside the Raylog block", () => {
  assert.throws(
    () =>
      parseRaylogMarkdown(
        "<!-- raylog:start -->\n```json\n{not-json}\n```\n<!-- raylog:end -->\n",
      ),
    RaylogParseError,
  );
});

test("throws on an outdated schema", () => {
  const markdown = mergeRaylogMarkdown("", {
    schemaVersion: 1,
    tasks: [],
  });

  assert.throws(() => parseRaylogMarkdown(markdown), RaylogSchemaError);
});

test("initializes a missing block while preserving markdown content", async () => {
  const originalMarkdown = "# Existing Note\n\nKeep this text.";
  const notePath = await createTempMarkdownFile(originalMarkdown);

  await ensureStorageNote(notePath);

  const updatedMarkdown = await fs.promises.readFile(notePath, "utf8");
  assert.match(updatedMarkdown, /# Existing Note/);
  assert.match(updatedMarkdown, /Keep this text\./);
  assert.match(updatedMarkdown, /raylog:start/);
});

test("supports the new task lifecycle without clobbering surrounding markdown", async () => {
  const notePath = await createTempMarkdownFile("# Header\n\nContext above.\n");
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

test("resets malformed storage to a fresh v2 document", async () => {
  const notePath = await createTempMarkdownFile(
    "<!-- raylog:start -->\n```json\n{bad-json}\n```\n<!-- raylog:end -->\n",
  );

  await resetStorageNote(notePath);
  const markdown = await fs.promises.readFile(notePath, "utf8");
  const parsed = parseRaylogMarkdown(markdown);

  assert.equal(parsed.document.schemaVersion, 2);
  assert.deepEqual(parsed.document.tasks, []);
});

test("throws when mutating a missing task", async () => {
  const notePath = await createTempMarkdownFile("");
  const repository = new RaylogRepository(notePath);

  await assert.rejects(() => repository.completeTask("missing"));
  await assert.rejects(() => repository.deleteTask("missing"));
});

async function createTempMarkdownFile(contents: string): Promise<string> {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "raylog-"));
  const notePath = path.join(directory, "tasks.md");
  await fs.promises.writeFile(notePath, contents, "utf8");
  return notePath;
}
