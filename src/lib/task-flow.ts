import type { RaylogRepository } from "./storage";
import type {
  TaskLogStatusBehavior,
  TaskRecord,
  TaskViewFilter,
} from "./types";

export interface TaskActionTargetSpec {
  type: "TaskDetailView" | "TaskForm";
  props: Record<string, unknown>;
}

interface TaskActionBaseSpec {
  title: string;
  shortcut?: { modifiers: string[]; key: string };
}

export interface TaskTargetActionSpec extends TaskActionBaseSpec {
  kind: "target";
  target: TaskActionTargetSpec;
}

export interface TaskMutationActionSpec extends TaskActionBaseSpec {
  kind: "mutation";
  mutation: "complete" | "start" | "reopen" | "archive" | "delete" | "custom";
  run: () => Promise<void>;
  destructive?: boolean;
}

export type TaskActionSpec = TaskTargetActionSpec | TaskMutationActionSpec;

interface SharedTaskActionSpecOptions {
  notePath: string;
  repository: RaylogRepository;
  task: TaskRecord;
  taskLogStatusBehavior: TaskLogStatusBehavior;
  onReload: () => Promise<void>;
}

interface DetailTaskActionSpecOptions extends SharedTaskActionSpecOptions {
  onDidDelete: () => Promise<void> | void;
  showReopenAction: boolean;
  showArchiveAction: boolean;
}

export function buildTaskFilterActionSpecs(
  onSelectFilter: (filter: TaskViewFilter) => Promise<void> | void,
): TaskMutationActionSpec[] {
  return [
    createFilterActionSpec(
      "Show All Tasks",
      { modifiers: ["cmd"], key: "1" },
      () => onSelectFilter("all"),
    ),
    createFilterActionSpec(
      "Show Open Tasks",
      { modifiers: ["cmd"], key: "2" },
      () => onSelectFilter("open"),
    ),
    createFilterActionSpec(
      "Show in Progress",
      { modifiers: ["cmd"], key: "3" },
      () => onSelectFilter("in_progress"),
    ),
    createFilterActionSpec(
      "Show Due Soon Tasks",
      { modifiers: ["cmd"], key: "4" },
      () => onSelectFilter("due_soon"),
    ),
    createFilterActionSpec(
      "Show Done Tasks",
      { modifiers: ["cmd"], key: "5" },
      () => onSelectFilter("done"),
    ),
    createFilterActionSpec(
      "Show Archived Tasks",
      { modifiers: ["cmd"], key: "6" },
      () => onSelectFilter("archived"),
    ),
  ];
}

export function buildTaskListActionSpecs(
  options: SharedTaskActionSpecOptions,
): TaskActionSpec[] {
  return [
    {
      kind: "target",
      title: "Open Task",
      target: {
        type: "TaskDetailView",
        props: {
          notePath: options.notePath,
          taskId: options.task.id,
          statusBehavior: options.taskLogStatusBehavior,
          onDidChangeTask: options.onReload,
        },
      },
    },
    ...buildEditActionSpecs(options),
    ...buildLifecycleActionSpecs({
      ...options,
      onDidDelete: options.onReload,
      showReopenAction: options.task.status === "done",
      showArchiveAction: options.task.status === "in_progress",
    }),
  ];
}

export function buildTaskDetailActionSpecs(
  options: SharedTaskActionSpecOptions & {
    onDidDelete: () => Promise<void> | void;
  },
): TaskActionSpec[] {
  return [
    ...buildEditActionSpecs(options),
    ...buildLifecycleActionSpecs({
      ...options,
      onDidDelete: options.onDidDelete,
      showReopenAction: options.task.status !== "open",
      showArchiveAction: options.task.status !== "archived",
    }),
  ];
}

function buildEditActionSpecs(
  options: SharedTaskActionSpecOptions,
): TaskTargetActionSpec[] {
  return [
    {
      kind: "target",
      title: "Log Work",
      shortcut: { modifiers: ["cmd"], key: "l" },
      target: {
        type: "TaskForm",
        props: {
          notePath: options.notePath,
          task: options.task,
          initialFocus: "new_work_log",
          statusBehavior: options.taskLogStatusBehavior,
          onDidSave: options.onReload,
        },
      },
    },
    {
      kind: "target",
      title: "Edit Task",
      shortcut: { modifiers: ["cmd"], key: "e" },
      target: {
        type: "TaskForm",
        props: {
          notePath: options.notePath,
          task: options.task,
          statusBehavior: options.taskLogStatusBehavior,
          onDidSave: options.onReload,
        },
      },
    },
    {
      kind: "target",
      title: "Add Task",
      shortcut: { modifiers: ["cmd"], key: "n" },
      target: {
        type: "TaskForm",
        props: {
          notePath: options.notePath,
          statusBehavior: options.taskLogStatusBehavior,
          onDidSave: options.onReload,
        },
      },
    },
  ];
}

function buildLifecycleActionSpecs(
  options: DetailTaskActionSpecOptions,
): TaskMutationActionSpec[] {
  const specs: TaskMutationActionSpec[] = [];

  if (options.task.status === "open" || options.task.status === "in_progress") {
    specs.push({
      kind: "mutation",
      title: "Complete Task",
      mutation: "complete",
      shortcut: { modifiers: ["cmd", "shift"], key: "c" },
      run: async () => {
        await options.repository.completeTask(options.task.id);
        await options.onReload();
      },
    });
  }

  if (options.task.status === "open") {
    specs.push({
      kind: "mutation",
      title: "Start Task",
      mutation: "start",
      shortcut: { modifiers: ["cmd"], key: "s" },
      run: async () => {
        await options.repository.startTask(options.task.id);
        await options.onReload();
      },
    });
  }

  if (options.showReopenAction) {
    specs.push({
      kind: "mutation",
      title: "Reopen Task",
      mutation: "reopen",
      shortcut: { modifiers: ["cmd"], key: "r" },
      run: async () => {
        await options.repository.reopenTask(options.task.id);
        await options.onReload();
      },
    });
  }

  if (options.showArchiveAction) {
    specs.push({
      kind: "mutation",
      title: "Archive Task",
      mutation: "archive",
      shortcut: { modifiers: ["cmd", "shift"], key: "a" },
      run: async () => {
        await options.repository.archiveTask(options.task.id);
        await options.onReload();
      },
    });
  }

  specs.push({
    kind: "mutation",
    title: "Delete Task",
    mutation: "delete",
    shortcut: { modifiers: ["ctrl"], key: "x" },
    destructive: true,
    run: async () => {
      await options.repository.deleteTask(options.task.id);
      await options.onDidDelete();
    },
  });

  return specs;
}

function createFilterActionSpec(
  title: string,
  shortcut: { modifiers: string[]; key: string },
  run: () => Promise<void> | void,
): TaskMutationActionSpec {
  return {
    kind: "mutation",
    title,
    mutation: "custom",
    shortcut,
    run: async () => {
      await run();
    },
  };
}
