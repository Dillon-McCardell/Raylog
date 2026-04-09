import type { Keyboard } from "@raycast/api";
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
  shortcut?: Keyboard.Shortcut;
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
    createFilterActionSpec("Show All Tasks", createShortcut(["cmd"], "1"), () =>
      onSelectFilter("all"),
    ),
    createFilterActionSpec(
      "Show Open Tasks",
      createShortcut(["cmd"], "2"),
      () => onSelectFilter("open"),
    ),
    createFilterActionSpec(
      "Show in Progress",
      createShortcut(["cmd"], "3"),
      () => onSelectFilter("in_progress"),
    ),
    createFilterActionSpec(
      "Show Due Soon Tasks",
      createShortcut(["cmd"], "4"),
      () => onSelectFilter("due_soon"),
    ),
    createFilterActionSpec(
      "Show Done Tasks",
      createShortcut(["cmd"], "5"),
      () => onSelectFilter("done"),
    ),
    createFilterActionSpec(
      "Show Archived Tasks",
      createShortcut(["cmd"], "6"),
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
      shortcut: createShortcut(["cmd"], "l"),
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
      shortcut: createShortcut(["cmd"], "e"),
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
      shortcut: createShortcut(["cmd"], "n"),
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
      shortcut: createShortcut(["cmd", "shift"], "c"),
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
      shortcut: createShortcut(["cmd"], "s"),
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
      shortcut: createShortcut(["cmd"], "r"),
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
      shortcut: createShortcut(["cmd", "shift"], "a"),
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
    shortcut: createShortcut(["ctrl"], "x"),
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
  shortcut: Keyboard.Shortcut,
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

function createShortcut(
  modifiers: Keyboard.KeyModifier[],
  key: Keyboard.KeyEquivalent,
): Keyboard.Shortcut {
  return { modifiers, key };
}
