import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskDetailActionSpecs,
  buildTaskListActionSpecs,
} from "../src/lib/task-flow";
import {
  submitTaskForm,
  type TaskFormValues,
} from "../src/lib/task-form-submit";
import type { TaskRecord } from "../src/lib/types";

test("TaskListScreen Enter opens TaskDetailView for the selected task", () => {
  const specs = buildTaskListActionSpecs({
    notePath: "/tmp/raylog-test.md",
    repository: createRepositoryStub(),
    onReload: async () => undefined,
    task: createTask(),
    taskLogStatusBehavior: "auto_start",
  });

  const openTask = specs.find((spec) => spec.title === "Open Task");
  assert.ok(openTask?.kind === "target");
  assert.equal(openTask?.target.type, "TaskDetailView");
  assert.equal(openTask.target.props.taskId, "task-id");
});

test("TaskListScreen Cmd+L opens TaskForm focused on the new log field", () => {
  const specs = buildTaskListActionSpecs({
    notePath: "/tmp/raylog-test.md",
    repository: createRepositoryStub(),
    onReload: async () => undefined,
    task: createTask(),
    taskLogStatusBehavior: "auto_start",
  });

  const logWork = specs.find((spec) => spec.title === "Log Work");
  assert.deepEqual(logWork?.shortcut, { modifiers: ["cmd"], key: "l" });
  assert.ok(logWork?.kind === "target");
  assert.equal(logWork?.target.type, "TaskForm");
  assert.equal(logWork?.target.props.initialFocus, "new_work_log");
});

test("TaskListScreen Cmd+E opens TaskForm for the selected task", () => {
  const specs = buildTaskListActionSpecs({
    notePath: "/tmp/raylog-test.md",
    repository: createRepositoryStub(),
    onReload: async () => undefined,
    task: createTask(),
    taskLogStatusBehavior: "auto_start",
  });

  const editTask = specs.find((spec) => spec.title === "Edit Task");
  assert.deepEqual(editTask?.shortcut, { modifiers: ["cmd"], key: "e" });
  assert.ok(editTask?.kind === "target");
  assert.equal(editTask?.target.type, "TaskForm");
  assert.equal((editTask?.target.props as any).task.id, "task-id");
});

test("TaskDetailView default action opens TaskForm focused on the new log field", () => {
  const specs = buildTaskDetailActionSpecs({
    notePath: "/tmp/raylog-test.md",
    repository: createRepositoryStub(),
    task: createTask(),
    taskLogStatusBehavior: "auto_start",
    onReload: async () => undefined,
    onDidDelete: async () => undefined,
  });

  assert.equal(specs[0]?.title, "Log Work");
  assert.ok(specs[0]?.kind === "target");
  assert.equal(specs[0]?.target.type, "TaskForm");
  assert.equal(specs[0]?.target.props.initialFocus, "new_work_log");
});

test("TaskDetailView Cmd+Shift+C completes the task and reloads in place", async () => {
  const events: string[] = [];
  const specs = buildTaskDetailActionSpecs({
    notePath: "/tmp/raylog-test.md",
    repository: createRepositoryStub({
      completeTask: async (taskId) => {
        events.push(`complete:${taskId}`);
        return createTask({ status: "done" });
      },
    }),
    task: createTask({ status: "in_progress" }),
    taskLogStatusBehavior: "auto_start",
    onReload: async () => {
      events.push("reload");
    },
    onDidDelete: async () => undefined,
  });

  const completeTask = specs.find((spec) => spec.title === "Complete Task");
  assert.ok(completeTask?.kind === "mutation");
  assert.deepEqual(completeTask?.shortcut, {
    modifiers: ["cmd", "shift"],
    key: "c",
  });

  await completeTask?.run();
  assert.deepEqual(events, ["complete:task-id", "reload"]);
});

test("TaskForm save from log-focused entry triggers parent reload callbacks and returns to the previous screen", async () => {
  const events: string[] = [];

  const result = await submitTaskForm({
    repository: createRepositoryStub({
      updateTask: async () => createTask(),
      createWorkLog: async () => {
        events.push("create-log");
        return {
          id: "log-2",
          body: "Logged progress",
          createdAt: "2026-04-03T00:00:00.000Z",
          updatedAt: null,
        };
      },
      startTask: async () => {
        events.push("start-task");
        return createTask({ status: "in_progress" });
      },
    }),
    task: createTask(),
    values: createTaskFormValues(),
    newWorkLogEntry: "Logged progress",
    statusBehavior: "auto_start",
    onDidSave: async () => {
      events.push("reload");
    },
    pop: () => {
      events.push("pop");
    },
    popToRoot: async () => {
      events.push("pop-to-root");
    },
    showToastImpl: async () => undefined,
  });

  assert.equal(result, "saved");
  assert.deepEqual(events, ["create-log", "start-task", "reload", "pop"]);
});

test("TaskForm save returns to the originating screen after editing from List Tasks", async () => {
  const events: string[] = [];

  await submitTaskForm({
    repository: createRepositoryStub({
      updateTask: async () => createTask(),
    }),
    task: createTask(),
    values: createTaskFormValues(),
    newWorkLogEntry: "",
    statusBehavior: "auto_start",
    onDidSave: async () => {
      events.push("list-reload");
    },
    pop: () => {
      events.push("pop");
    },
    popToRoot: async () => {
      events.push("pop-to-root");
    },
    showToastImpl: async () => undefined,
  });

  assert.deepEqual(events, ["list-reload", "pop"]);
});

test("TaskForm save returns to TaskDetailView after editing from View Task", async () => {
  const events: string[] = [];

  await submitTaskForm({
    repository: createRepositoryStub({
      updateTask: async () => createTask(),
    }),
    task: createTask(),
    values: createTaskFormValues(),
    newWorkLogEntry: "",
    statusBehavior: "auto_start",
    onDidSave: async () => {
      events.push("detail-reload");
    },
    pop: () => {
      events.push("pop");
    },
    popToRoot: async () => {
      events.push("pop-to-root");
    },
    showToastImpl: async () => undefined,
  });

  assert.deepEqual(events, ["detail-reload", "pop"]);
});

function createRepositoryStub(
  overrides: Partial<{
    completeTask: (taskId: string) => Promise<TaskRecord>;
    updateTask: (taskId: string, values: unknown) => Promise<TaskRecord>;
    createTask: (values: unknown) => Promise<TaskRecord>;
    createWorkLog: (
      taskId: string,
      input: { body: string },
    ) => Promise<TaskRecord["workLogs"][number]>;
    startTask: (taskId: string) => Promise<TaskRecord>;
    reopenTask: (taskId: string) => Promise<TaskRecord>;
    archiveTask: (taskId: string) => Promise<TaskRecord>;
    deleteTask: (taskId: string) => Promise<void>;
  }> = {},
) {
  return {
    completeTask:
      overrides.completeTask ?? (async () => createTask({ status: "done" })),
    updateTask: overrides.updateTask ?? (async () => createTask()),
    createTask: overrides.createTask ?? (async () => createTask()),
    createWorkLog:
      overrides.createWorkLog ??
      (async () => ({
        id: "log-2",
        body: "Logged progress",
        createdAt: "2026-04-03T00:00:00.000Z",
        updatedAt: null,
      })),
    startTask:
      overrides.startTask ??
      (async () => createTask({ status: "in_progress" })),
    reopenTask: overrides.reopenTask ?? (async () => createTask()),
    archiveTask:
      overrides.archiveTask ?? (async () => createTask({ status: "archived" })),
    deleteTask: overrides.deleteTask ?? (async () => undefined),
  } as never;
}

function createTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: overrides.id ?? "task-id",
    header: overrides.header ?? "Task",
    body: overrides.body ?? "Task body",
    workLogs: overrides.workLogs ?? [],
    status: overrides.status ?? "open",
    dueDate: overrides.dueDate ?? null,
    startDate: overrides.startDate ?? null,
    completedAt: overrides.completedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-04-03T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-03T00:00:00.000Z",
  };
}

function createTaskFormValues(): TaskFormValues {
  return {
    header: "Task",
    body: "Task body",
    status: "open",
    dueDate: null,
    startDate: null,
    workLogs: [],
  };
}
