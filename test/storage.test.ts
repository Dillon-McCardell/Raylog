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
  RaylogRepository,
  RaylogParseError,
} from "../src/lib/storage";

test("bootstraps an empty markdown note", async () => {
  const notePath = await createTempMarkdownFile("");
  await ensureStorageNote(notePath);
  const markdown = await fs.promises.readFile(notePath, "utf8");

  assert.match(markdown, /raylog:start/);
  assert.deepEqual(parseRaylogMarkdown(markdown).document, createEmptyDocument());
});

test("parses a valid markdown note with a Raylog block", () => {
  const markdown = mergeRaylogMarkdown("# Notes\n", {
    schemaVersion: 1,
    tasks: [
      {
        id: "task-1",
        header: "Header",
        body: "Body",
        dueDate: null,
        startDate: null,
        finishDate: null,
        completed: false,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
      },
    ],
  });

  const parsed = parseRaylogMarkdown(markdown);
  assert.equal(parsed.hasManagedBlock, true);
  assert.equal(parsed.document.tasks[0].header, "Header");
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

test("initializes a missing block while preserving markdown content", async () => {
  const originalMarkdown = "# Existing Note\n\nKeep this text.";
  const notePath = await createTempMarkdownFile(originalMarkdown);

  await ensureStorageNote(notePath);

  const updatedMarkdown = await fs.promises.readFile(notePath, "utf8");
  assert.match(updatedMarkdown, /# Existing Note/);
  assert.match(updatedMarkdown, /Keep this text\./);
  assert.match(updatedMarkdown, /raylog:start/);
});

test("creates, edits, and completes tasks without clobbering surrounding markdown", async () => {
  const notePath = await createTempMarkdownFile("# Header\n\nContext above.\n");
  const repository = new RaylogRepository(notePath);

  const created = await repository.createTask({
    header: "Ship Raylog",
    body: "Implement storage",
  });

  const updated = await repository.updateTask(created.id, {
    header: "Ship Raylog v1",
    body: "Implement storage and UI",
    dueDate: "2026-03-31T00:00:00.000Z",
    startDate: "2026-03-30T00:00:00.000Z",
    finishDate: null,
  });

  assert.equal(updated.header, "Ship Raylog v1");
  assert.equal(updated.startDate, "2026-03-30T00:00:00.000Z");

  const completed = await repository.completeTask(created.id);
  assert.equal(completed.completed, true);
  assert.ok(completed.finishDate);

  const finalMarkdown = await fs.promises.readFile(notePath, "utf8");
  assert.match(finalMarkdown, /Context above\./);
  assert.match(finalMarkdown, /Ship Raylog v1/);
});

async function createTempMarkdownFile(contents: string): Promise<string> {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "raylog-"));
  const notePath = path.join(directory, "tasks.md");
  await fs.promises.writeFile(notePath, contents, "utf8");
  return notePath;
}
