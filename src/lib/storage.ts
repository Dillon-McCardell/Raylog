import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import {
  RAYLOG_END_MARKER,
  RAYLOG_SCHEMA_VERSION,
  RAYLOG_START_MARKER,
} from "./constants";
import type { RaylogDocument, TaskInput, TaskRecord } from "./types";

export class RaylogStorageError extends Error {}
export class RaylogConfigurationError extends RaylogStorageError {}
export class RaylogParseError extends RaylogStorageError {}
export class RaylogTaskNotFoundError extends RaylogStorageError {}

const BLOCK_PATTERN = new RegExp(
  `${escapeForRegExp(RAYLOG_START_MARKER)}\\s*${escapeForRegExp("```json")}\\s*([\\s\\S]*?)\\s*${escapeForRegExp("```")}\\s*${escapeForRegExp(RAYLOG_END_MARKER)}`,
  "m",
);

export function createEmptyDocument(): RaylogDocument {
  return {
    schemaVersion: RAYLOG_SCHEMA_VERSION,
    tasks: [],
  };
}

export function createManagedBlock(document: RaylogDocument): string {
  return `${RAYLOG_START_MARKER}
\`\`\`json
${JSON.stringify(document, null, 2)}
\`\`\`
${RAYLOG_END_MARKER}`;
}

export function parseRaylogMarkdown(markdown: string): {
  document: RaylogDocument;
  hasManagedBlock: boolean;
} {
  const match = markdown.match(BLOCK_PATTERN);
  if (!match) {
    return {
      document: createEmptyDocument(),
      hasManagedBlock: false,
    };
  }

  try {
    const parsed = JSON.parse(match[1]) as Partial<RaylogDocument>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.schemaVersion !== "number" ||
      !Array.isArray(parsed.tasks)
    ) {
      throw new Error("Missing required Raylog document properties.");
    }

    return {
      document: {
        schemaVersion: parsed.schemaVersion,
        tasks: parsed.tasks.map(normalizeTaskRecord),
      },
      hasManagedBlock: true,
    };
  } catch (error) {
    throw new RaylogParseError(
      error instanceof Error
        ? error.message
        : "Unable to parse Raylog JSON payload.",
    );
  }
}

export function mergeRaylogMarkdown(
  markdown: string,
  document: RaylogDocument,
): string {
  const block = createManagedBlock(document);
  if (BLOCK_PATTERN.test(markdown)) {
    return markdown.replace(BLOCK_PATTERN, block);
  }

  const trimmed = markdown.trimEnd();
  if (!trimmed) {
    return `${block}\n`;
  }

  return `${trimmed}\n\n${block}\n`;
}

export async function ensureStorageNote(notePath: string): Promise<void> {
  await validateStorageNotePath(notePath);
  const markdown = await fs.promises.readFile(notePath, "utf8");
  const { document, hasManagedBlock } = parseRaylogMarkdown(markdown);

  if (!hasManagedBlock || markdown.trim().length === 0) {
    await writeMarkdownAtomically(
      notePath,
      mergeRaylogMarkdown(markdown, document),
    );
  }
}

export async function validateStorageNotePath(
  notePath?: string,
): Promise<void> {
  if (!notePath) {
    throw new RaylogConfigurationError(
      "Select a markdown note to store Raylog data.",
    );
  }

  if (path.extname(notePath).toLowerCase() !== ".md") {
    throw new RaylogConfigurationError(
      "Raylog storage must point to a markdown file.",
    );
  }

  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(notePath);
  } catch {
    throw new RaylogConfigurationError(
      "The configured Raylog storage note does not exist.",
    );
  }

  if (!stats.isFile()) {
    throw new RaylogConfigurationError(
      "The configured Raylog storage path is not a file.",
    );
  }
}

export class RaylogRepository {
  constructor(private readonly notePath: string) {}

  async listTasks(): Promise<TaskRecord[]> {
    const document = await this.readDocument();
    return [...document.tasks].sort((left, right) => {
      if (left.completed !== right.completed) {
        return left.completed ? 1 : -1;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }

  async getTask(taskId: string): Promise<TaskRecord> {
    const document = await this.readDocument();
    const task = document.tasks.find((candidate) => candidate.id === taskId);

    if (!task) {
      throw new RaylogTaskNotFoundError(
        "The selected task could not be found.",
      );
    }

    return task;
  }

  async createTask(input: TaskInput): Promise<TaskRecord> {
    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: nanoid(),
      header: input.header.trim(),
      body: input.body?.trim() ?? "",
      dueDate: input.dueDate ?? null,
      startDate: input.startDate ?? null,
      finishDate: input.finishDate ?? null,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.updateDocument((document) => ({
      ...document,
      tasks: [task, ...document.tasks],
    }));

    return task;
  }

  async updateTask(taskId: string, input: TaskInput): Promise<TaskRecord> {
    let updatedTask: TaskRecord | undefined;
    const now = new Date().toISOString();

    await this.updateDocument((document) => {
      const tasks = document.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        updatedTask = {
          ...task,
          header: input.header.trim(),
          body: input.body?.trim() ?? "",
          dueDate: input.dueDate ?? null,
          startDate: input.startDate ?? null,
          finishDate: input.finishDate ?? null,
          updatedAt: now,
        };

        return updatedTask;
      });

      if (!updatedTask) {
        throw new RaylogTaskNotFoundError(
          "The selected task could not be found.",
        );
      }

      return { ...document, tasks };
    });

    return updatedTask!;
  }

  async completeTask(taskId: string): Promise<TaskRecord> {
    let completedTask: TaskRecord | undefined;
    const now = new Date().toISOString();

    await this.updateDocument((document) => {
      const tasks = document.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        completedTask = {
          ...task,
          completed: true,
          finishDate: task.finishDate ?? now,
          updatedAt: now,
        };

        return completedTask;
      });

      if (!completedTask) {
        throw new RaylogTaskNotFoundError(
          "The selected task could not be found.",
        );
      }

      return { ...document, tasks };
    });

    return completedTask!;
  }

  private async readDocument(): Promise<RaylogDocument> {
    await ensureStorageNote(this.notePath);
    const markdown = await fs.promises.readFile(this.notePath, "utf8");
    return parseRaylogMarkdown(markdown).document;
  }

  private async updateDocument(
    transform: (document: RaylogDocument) => RaylogDocument,
  ): Promise<void> {
    await ensureStorageNote(this.notePath);
    const markdown = await fs.promises.readFile(this.notePath, "utf8");
    const { document } = parseRaylogMarkdown(markdown);
    const updatedDocument = transform(document);
    await writeMarkdownAtomically(
      this.notePath,
      mergeRaylogMarkdown(markdown, updatedDocument),
    );
  }
}

async function writeMarkdownAtomically(
  notePath: string,
  markdown: string,
): Promise<void> {
  const tempPath = `${notePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tempPath, markdown, "utf8");
  await fs.promises.rename(tempPath, notePath);
}

function normalizeTaskRecord(task: unknown): TaskRecord {
  if (typeof task !== "object" || task === null) {
    throw new Error("Invalid task record.");
  }

  const candidate = task as Partial<TaskRecord>;
  const normalized: TaskRecord = {
    id: requireString(candidate.id, "Task id"),
    header: requireString(candidate.header, "Task header"),
    body: typeof candidate.body === "string" ? candidate.body : "",
    dueDate: normalizeNullableString(candidate.dueDate),
    startDate: normalizeNullableString(candidate.startDate),
    finishDate: normalizeNullableString(candidate.finishDate),
    completed: Boolean(candidate.completed),
    createdAt: requireString(candidate.createdAt, "Task createdAt"),
    updatedAt: requireString(candidate.updatedAt, "Task updatedAt"),
  };

  return normalized;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is invalid.`);
  }

  return value;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
