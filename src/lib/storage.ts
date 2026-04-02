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
} from "./types";
import { isTaskViewFilter } from "./tasks";

export class RaylogStorageError extends Error {}
export class RaylogConfigurationError extends RaylogStorageError {}
export class RaylogParseError extends RaylogStorageError {}
export class RaylogTaskNotFoundError extends RaylogStorageError {}
export class RaylogSchemaError extends RaylogStorageError {}

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
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      parsed.schemaVersion !== RAYLOG_SCHEMA_VERSION ||
      !Array.isArray(parsed.tasks)
    ) {
      throw new RaylogSchemaError(
        "The configured storage note does not use the current Raylog schema.",
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
      const dependencyInput = normalizeDependencyInput(input);
      const task: TaskRecord = {
        id: nanoid(),
        header: input.header.trim(),
        body: input.body?.trim() ?? "",
        status,
        blockedByTaskIds: dependencyInput.blockedByTaskIds,
        blocksTaskIds: dependencyInput.blocksTaskIds,
        dueDate: input.dueDate ?? null,
        startDate: input.startDate ?? null,
        completedAt: status === "done" ? now : null,
        createdAt: now,
        updatedAt: now,
      };

      const tasks = applyDependencies(
        [...document.tasks, task],
        task.id,
        input,
      );
      createdTask = tasks.find((candidate) => candidate.id === task.id);
      return { ...document, tasks };
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
          status: input.status ?? task.status,
          blockedByTaskIds:
            input.blockedByTaskIds !== undefined
              ? normalizeDependencyInput(input).blockedByTaskIds
              : task.blockedByTaskIds,
          blocksTaskIds:
            input.blocksTaskIds !== undefined
              ? normalizeDependencyInput(input).blocksTaskIds
              : task.blocksTaskIds,
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

      const tasks = applyDependencies(tasksWithTaskUpdate, taskId, input);
      updatedTask = tasks.find((task) => task.id === taskId);
      return { ...document, tasks };
    });

    return updatedTask!;
  }

  async completeTask(taskId: string): Promise<TaskRecord> {
    return this.updateTaskStatus(taskId, "done");
  }

  async startTask(taskId: string): Promise<TaskRecord> {
    return this.updateTaskStatus(taskId, "in_progress");
  }

  async blockTask(taskId: string): Promise<TaskRecord> {
    return this.updateTaskStatus(taskId, "blocked");
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
      const tasks = document.tasks
        .filter((task) => {
          if (task.id !== taskId) {
            return true;
          }

          didDelete = true;
          return false;
        })
        .map((task) => ({
          ...task,
          blockedByTaskIds: task.blockedByTaskIds.filter((id) => id !== taskId),
          blocksTaskIds: task.blocksTaskIds.filter((id) => id !== taskId),
        }));

      if (!didDelete) {
        throw new RaylogTaskNotFoundError(
          "The selected task could not be found.",
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
    status: normalizeTaskStatus(candidate.status),
    blockedByTaskIds: normalizeTaskIdList(
      candidate.blockedByTaskIds,
      "Task blockedByTaskIds",
    ),
    blocksTaskIds: normalizeTaskIdList(
      candidate.blocksTaskIds,
      "Task blocksTaskIds",
    ),
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

function normalizeTaskStatus(value: unknown): TaskStatus {
  if (
    value === "blocked" ||
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

function normalizeTaskIdList(value: unknown, label: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    !value.every((candidate) => typeof candidate === "string")
  ) {
    throw new Error(`${label} is invalid.`);
  }

  return Array.from(new Set(value));
}

function normalizeDependencyInput(
  input: TaskInput,
): Required<Pick<TaskInput, "blockedByTaskIds" | "blocksTaskIds">> {
  const blockedByTaskIds = normalizeTaskIdList(
    input.blockedByTaskIds,
    "Blocked By dependencies",
  );
  const blocksTaskIds = normalizeTaskIdList(
    input.blocksTaskIds,
    "Blocks dependencies",
  );

  return {
    blockedByTaskIds,
    blocksTaskIds,
  };
}

function applyDependencies(
  tasks: TaskRecord[],
  taskId: string,
  input: TaskInput,
): TaskRecord[] {
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index < 0) {
    throw new RaylogTaskNotFoundError("The selected task could not be found.");
  }

  const nextTasks = tasks.map((task) => ({
    ...task,
    blockedByTaskIds: [...task.blockedByTaskIds],
    blocksTaskIds: [...task.blocksTaskIds],
  }));
  const nextTask = nextTasks[index];
  const dependencyInput = normalizeDependencyInput({
    blockedByTaskIds: input.blockedByTaskIds ?? nextTask.blockedByTaskIds,
    blocksTaskIds: input.blocksTaskIds ?? nextTask.blocksTaskIds,
    header: "",
  });

  if (
    dependencyInput.blockedByTaskIds.includes(taskId) ||
    dependencyInput.blocksTaskIds.includes(taskId)
  ) {
    throw new RaylogStorageError("A task cannot depend on itself.");
  }

  for (const task of nextTasks) {
    if (task.id === taskId) {
      continue;
    }

    task.blockedByTaskIds = task.blockedByTaskIds.filter((id) => id !== taskId);
    task.blocksTaskIds = task.blocksTaskIds.filter((id) => id !== taskId);
  }

  nextTask.blockedByTaskIds = dependencyInput.blockedByTaskIds;
  nextTask.blocksTaskIds = dependencyInput.blocksTaskIds;

  for (const dependencyId of dependencyInput.blockedByTaskIds) {
    const dependency = nextTasks.find((task) => task.id === dependencyId);
    if (!dependency) {
      throw new RaylogStorageError("A selected dependency could not be found.");
    }

    dependency.blocksTaskIds = Array.from(
      new Set([...dependency.blocksTaskIds, taskId]),
    );
  }

  for (const dependencyId of dependencyInput.blocksTaskIds) {
    const dependency = nextTasks.find((task) => task.id === dependencyId);
    if (!dependency) {
      throw new RaylogStorageError("A selected dependency could not be found.");
    }

    dependency.blockedByTaskIds = Array.from(
      new Set([...dependency.blockedByTaskIds, taskId]),
    );
  }

  return nextTasks;
}
