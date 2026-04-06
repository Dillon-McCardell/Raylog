import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import {
  RAYLOG_END_MARKER,
  RAYLOG_SCHEMA_VERSION,
  RAYLOG_START_MARKER,
} from "./constants";
import type {
  RaylogDocument,
  TaskInput,
  TaskRecord,
  TaskStatus,
  TaskViewFilter,
  TaskWorkLogInput,
  TaskWorkLogRecord,
} from "./types";
import { isTaskViewFilter } from "./tasks";

export class RaylogStorageError extends Error {}
export class RaylogConfigurationError extends RaylogStorageError {}
export class RaylogInitializationRequiredError extends RaylogStorageError {}
export class RaylogParseError extends RaylogStorageError {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(formatStorageErrorMessage(message, detail));
    this.name = "RaylogParseError";
  }
}
export class RaylogTaskNotFoundError extends RaylogStorageError {}
export class RaylogWorkLogNotFoundError extends RaylogStorageError {}
export class RaylogSchemaError extends RaylogStorageError {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(formatStorageErrorMessage(message, detail));
    this.name = "RaylogSchemaError";
  }
}

const BLOCK_PATTERN = new RegExp(
  `${escapeForRegExp(RAYLOG_START_MARKER)}\\s*${escapeForRegExp("```json")}\\s*([\\s\\S]*?)\\s*${escapeForRegExp("```")}\\s*${escapeForRegExp(RAYLOG_END_MARKER)}`,
  "m",
);

export function createEmptyDocument(): RaylogDocument {
  return {
    schemaVersion: RAYLOG_SCHEMA_VERSION,
    tasks: [],
    viewState: {
      hasSelectedListTasksFilter: false,
      listTasksFilter: "all",
    },
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
    if (typeof parsed !== "object" || parsed === null) {
      throw new RaylogSchemaError(
        "The Raylog database is corrupted.",
        "The managed JSON block must contain an object.",
      );
    }

    if (parsed.schemaVersion !== RAYLOG_SCHEMA_VERSION) {
      throw new RaylogSchemaError(
        "The Raylog database uses an unsupported schema version.",
        `Expected schema v${RAYLOG_SCHEMA_VERSION}, found ${formatSchemaVersion(parsed.schemaVersion)}.`,
      );
    }

    if (!Array.isArray(parsed.tasks)) {
      throw new RaylogSchemaError(
        "The Raylog database is corrupted.",
        'The managed JSON block is missing the required "tasks" array.',
      );
    }

    return {
      document: {
        schemaVersion: parsed.schemaVersion,
        tasks: parsed.tasks.map(normalizeTaskRecord),
        viewState: normalizeViewState(parsed.viewState),
      },
      hasManagedBlock: true,
    };
  } catch (error) {
    if (error instanceof RaylogSchemaError) {
      throw error;
    }

    throw new RaylogParseError(
      "The Raylog database is corrupted.",
      describeParseFailure(match[1], error),
    );
  }
}

export function isRaylogCorruptionError(
  error: unknown,
): error is RaylogParseError | RaylogSchemaError {
  return (
    error instanceof RaylogParseError || error instanceof RaylogSchemaError
  );
}

export function getRaylogErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error ? error.message : fallback;
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
  const { hasManagedBlock } = parseRaylogMarkdown(markdown);

  if (!hasManagedBlock || markdown.trim().length === 0) {
    throw new RaylogInitializationRequiredError(
      "The configured task storage note does not contain a valid Raylog database.",
    );
  }
}

export async function resetStorageNote(notePath: string): Promise<void> {
  await validateStorageNotePath(notePath);
  const markdown = await fs.promises.readFile(notePath, "utf8");
  await writeMarkdownAtomically(
    notePath,
    mergeRaylogMarkdown(markdown, createEmptyDocument()),
  );
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
    return (await this.readDocument()).tasks;
  }

  async getListTasksFilter(): Promise<TaskViewFilter> {
    const { viewState } = await this.readDocument();
    return viewState.hasSelectedListTasksFilter
      ? viewState.listTasksFilter
      : "all";
  }

  async setListTasksFilter(filter: TaskViewFilter): Promise<void> {
    await this.updateDocument((document) => ({
      ...document,
      viewState: {
        ...document.viewState,
        hasSelectedListTasksFilter: true,
        listTasksFilter: filter,
      },
    }));
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
    let createdTask: TaskRecord | undefined;

    await this.updateDocument((document) => {
      const now = new Date().toISOString();
      const status = input.status ?? "open";
      const task: TaskRecord = {
        id: nanoid(),
        header: input.header.trim(),
        body: input.body?.trim() ?? "",
        workLogs: [],
        status,
        dueDate: input.dueDate ?? null,
        startDate: input.startDate ?? null,
        completedAt: status === "done" ? now : null,
        createdAt: now,
        updatedAt: now,
      };

      createdTask = task;
      return { ...document, tasks: [...document.tasks, task] };
    });

    return createdTask!;
  }

  async updateTask(taskId: string, input: TaskInput): Promise<TaskRecord> {
    let updatedTask: TaskRecord | undefined;

    await this.updateDocument((document) => {
      const now = new Date().toISOString();
      const tasksWithTaskUpdate = document.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        updatedTask = {
          ...task,
          header: input.header.trim(),
          body: input.body?.trim() ?? "",
          workLogs: input.workLogs ?? task.workLogs,
          status: input.status ?? task.status,
          dueDate: input.dueDate ?? null,
          startDate: input.startDate ?? null,
          completedAt: deriveCompletedAt(
            task,
            input.status ?? task.status,
            now,
          ),
          updatedAt: now,
        };

        return updatedTask;
      });

      if (!updatedTask) {
        throw new RaylogTaskNotFoundError(
          "The selected task could not be found.",
        );
      }

      return { ...document, tasks: tasksWithTaskUpdate };
    });

    return updatedTask!;
  }

  async completeTask(taskId: string): Promise<TaskRecord> {
    return this.updateTaskStatus(taskId, "done");
  }

  async startTask(taskId: string): Promise<TaskRecord> {
    return this.updateTaskStatus(taskId, "in_progress");
  }

  async reopenTask(taskId: string): Promise<TaskRecord> {
    return this.updateTaskStatus(taskId, "open");
  }

  async archiveTask(taskId: string): Promise<TaskRecord> {
    return this.updateTaskStatus(taskId, "archived");
  }

  async deleteTask(taskId: string): Promise<void> {
    let didDelete = false;

    await this.updateDocument((document) => {
      const tasks = document.tasks.filter((task) => {
        if (task.id !== taskId) {
          return true;
        }

        didDelete = true;
        return false;
      });

      if (!didDelete) {
        throw new RaylogTaskNotFoundError(
          "The selected task could not be found.",
        );
      }

      return { ...document, tasks };
    });
  }

  async createWorkLog(
    taskId: string,
    input: TaskWorkLogInput,
  ): Promise<TaskWorkLogRecord> {
    let createdWorkLog: TaskWorkLogRecord | undefined;

    await this.updateDocument((document) => {
      const now = new Date().toISOString();
      const tasks = document.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        createdWorkLog = {
          id: nanoid(),
          body: input.body.trim(),
          createdAt: now,
          updatedAt: null,
        };

        return {
          ...task,
          workLogs: [...task.workLogs, createdWorkLog],
          updatedAt: now,
        };
      });

      if (!createdWorkLog) {
        throw new RaylogTaskNotFoundError(
          "The selected task could not be found.",
        );
      }

      return { ...document, tasks };
    });

    return createdWorkLog!;
  }

  async updateWorkLog(
    taskId: string,
    workLogId: string,
    input: TaskWorkLogInput,
  ): Promise<TaskWorkLogRecord> {
    let updatedWorkLog: TaskWorkLogRecord | undefined;

    await this.updateDocument((document) => {
      const now = new Date().toISOString();
      let didFindTask = false;
      const tasks = document.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        didFindTask = true;
        const workLogs = task.workLogs.map((workLog) => {
          if (workLog.id !== workLogId) {
            return workLog;
          }

          updatedWorkLog = {
            ...workLog,
            body: input.body.trim(),
            updatedAt: now,
          };

          return updatedWorkLog;
        });

        if (!updatedWorkLog) {
          return task;
        }

        return {
          ...task,
          workLogs,
          updatedAt: now,
        };
      });

      if (!didFindTask) {
        throw new RaylogTaskNotFoundError(
          "The selected task could not be found.",
        );
      }

      if (!updatedWorkLog) {
        throw new RaylogWorkLogNotFoundError(
          "The selected work log could not be found.",
        );
      }

      return { ...document, tasks };
    });

    return updatedWorkLog!;
  }

  async deleteWorkLog(taskId: string, workLogId: string): Promise<void> {
    await this.updateDocument((document) => {
      const now = new Date().toISOString();
      let didFindTask = false;
      let didDeleteWorkLog = false;
      const tasks = document.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        didFindTask = true;
        const workLogs = task.workLogs.filter((workLog) => {
          if (workLog.id !== workLogId) {
            return true;
          }

          didDeleteWorkLog = true;
          return false;
        });

        if (!didDeleteWorkLog) {
          return task;
        }

        return {
          ...task,
          workLogs,
          updatedAt: now,
        };
      });

      if (!didFindTask) {
        throw new RaylogTaskNotFoundError(
          "The selected task could not be found.",
        );
      }

      if (!didDeleteWorkLog) {
        throw new RaylogWorkLogNotFoundError(
          "The selected work log could not be found.",
        );
      }

      return { ...document, tasks };
    });
  }

  private async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
  ): Promise<TaskRecord> {
    let completedTask: TaskRecord | undefined;
    const now = new Date().toISOString();

    await this.updateDocument((document) => {
      const tasks = document.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        completedTask = {
          ...task,
          status,
          completedAt: deriveCompletedAt(task, status, now),
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
  const directory = path.dirname(notePath);
  const basename = path.basename(notePath);
  const tempPath = path.join(
    directory,
    `.${basename}.${process.pid}.${Date.now()}.tmp`,
  );

  await fs.promises.mkdir(directory, { recursive: true });
  await fs.promises.writeFile(tempPath, markdown, "utf8");

  try {
    await fs.promises.rename(tempPath, notePath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true });

    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await fs.promises.writeFile(notePath, markdown, "utf8");
      return;
    }

    throw error;
  }
}

function normalizeTaskRecord(task: unknown): TaskRecord {
  if (typeof task !== "object" || task === null) {
    throw new Error("Invalid task record.");
  }

  const candidate = task as Partial<TaskRecord>;
  if ("blockedByTaskIds" in candidate || "blocksTaskIds" in candidate) {
    throw new Error("Task dependencies are no longer supported.");
  }

  const normalized: TaskRecord = {
    id: requireString(candidate.id, "Task id"),
    header: requireString(candidate.header, "Task header"),
    body: typeof candidate.body === "string" ? candidate.body : "",
    workLogs: normalizeWorkLogs(candidate.workLogs),
    status: normalizeTaskStatus(candidate.status),
    dueDate: normalizeNullableString(candidate.dueDate),
    startDate: normalizeNullableString(candidate.startDate),
    completedAt: normalizeNullableString(candidate.completedAt),
    createdAt: requireString(candidate.createdAt, "Task createdAt"),
    updatedAt: requireString(candidate.updatedAt, "Task updatedAt"),
  };

  return normalized;
}

function normalizeViewState(value: unknown): RaylogDocument["viewState"] {
  if (typeof value !== "object" || value === null) {
    return createEmptyDocument().viewState;
  }

  const candidate = value as Partial<RaylogDocument["viewState"]>;
  return {
    hasSelectedListTasksFilter:
      typeof candidate.hasSelectedListTasksFilter === "boolean"
        ? candidate.hasSelectedListTasksFilter
        : false,
    listTasksFilter: isTaskViewFilter(candidate.listTasksFilter)
      ? candidate.listTasksFilter
      : "all",
  };
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

function normalizeWorkLogs(value: unknown): TaskWorkLogRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Task workLogs are invalid.");
  }

  return value.map((workLog) => normalizeWorkLogRecord(workLog));
}

function normalizeWorkLogRecord(value: unknown): TaskWorkLogRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid work log record.");
  }

  const candidate = value as Partial<TaskWorkLogRecord>;
  return {
    id: requireString(candidate.id, "Work log id"),
    body: requireString(candidate.body, "Work log body"),
    createdAt: requireString(candidate.createdAt, "Work log createdAt"),
    updatedAt: normalizeNullableString(candidate.updatedAt),
  };
}

function normalizeTaskStatus(value: unknown): TaskStatus {
  if (
    value === "open" ||
    value === "in_progress" ||
    value === "done" ||
    value === "archived"
  ) {
    return value;
  }

  throw new Error("Task status is invalid.");
}

function deriveCompletedAt(
  task: TaskRecord,
  status: TaskStatus,
  now: string,
): string | null {
  if (status === "done") {
    return task.completedAt ?? now;
  }

  if (status === "archived") {
    return task.completedAt;
  }

  return null;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatStorageErrorMessage(message: string, detail?: string): string {
  return detail ? `${message} ${detail}` : message;
}

function formatSchemaVersion(value: unknown): string {
  return typeof value === "number" ? `schema v${value}` : "an unknown schema";
}

function describeParseFailure(payload: string, error: unknown): string {
  if (!(error instanceof Error)) {
    return "The managed JSON block could not be parsed.";
  }

  const jsonSyntaxDetail = describeJsonSyntaxError(payload, error.message);
  if (jsonSyntaxDetail) {
    return jsonSyntaxDetail;
  }

  return describeValidationFailure(error.message);
}

function describeJsonSyntaxError(
  payload: string,
  message: string,
): string | undefined {
  const match = message.match(
    /^(.*?) at position (\d+)(?: \(line (\d+) column (\d+)\))?$/i,
  );

  if (!match) {
    return undefined;
  }

  const [, reason, positionText, lineText, columnText] = match;
  const position = Number.parseInt(positionText, 10);
  const { line, column } =
    lineText && columnText
      ? {
          line: Number.parseInt(lineText, 10),
          column: Number.parseInt(columnText, 10),
        }
      : getLineAndColumnFromPosition(payload, position);

  return `Malformed JSON near line ${line}, column ${column}: ${lowercaseFirst(trimTrailingPeriod(reason))}.`;
}

function describeValidationFailure(message: string): string {
  if (message.startsWith("Task ")) {
    return `Malformed task data: ${lowercaseFirst(trimTrailingPeriod(message))}.`;
  }

  if (message.startsWith("Work log ")) {
    return `Malformed work log data: ${lowercaseFirst(trimTrailingPeriod(message))}.`;
  }

  if (
    message === "Invalid task record." ||
    message === "Task workLogs are invalid." ||
    message === "Invalid work log record." ||
    message === "Task status is invalid."
  ) {
    return `${trimTrailingPeriod(message)}.`;
  }

  return `Malformed Raylog data: ${lowercaseFirst(trimTrailingPeriod(message))}.`;
}

function trimTrailingPeriod(value: string): string {
  return value.replace(/\.+$/, "");
}

function lowercaseFirst(value: string): string {
  return value.length > 0
    ? `${value.charAt(0).toLowerCase()}${value.slice(1)}`
    : value;
}

function getLineAndColumnFromPosition(
  payload: string,
  position: number,
): { line: number; column: number } {
  const clampedPosition = Number.isNaN(position)
    ? payload.length
    : Math.min(Math.max(position, 0), payload.length);
  const preceding = payload.slice(0, clampedPosition);
  const lines = preceding.split("\n");

  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}
