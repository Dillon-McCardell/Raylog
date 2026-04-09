import { Action, Alert, Icon, confirmAlert } from "@raycast/api";
import type { ReactElement } from "react";
import {
  buildTaskDetailActionSpecs as buildTaskDetailFlowSpecs,
  buildTaskFilterActionSpecs as buildTaskFilterFlowSpecs,
  buildTaskListActionSpecs as buildTaskListFlowSpecs,
  type TaskActionSpec as TaskFlowSpec,
} from "../lib/task-flow";
import { runTaskMutationAction } from "../lib/task-actions";
import type { RaylogRepository } from "../lib/storage";
import type {
  TaskLogStatusBehavior,
  TaskRecord,
  TaskViewFilter,
} from "../lib/types";
import TaskDetailView from "./TaskDetailView";
import TaskForm from "./TaskForm";

export interface TaskActionSpec {
  title: string;
  icon?: Icon;
  shortcut?: { modifiers: string[]; key: string };
  style?: Action.Style;
  target?: ReactElement;
  onAction?: () => Promise<void> | void;
  targetType?: string;
}

interface SharedTaskActionSpecOptions {
  notePath: string;
  repository: RaylogRepository;
  task: TaskRecord;
  taskLogStatusBehavior: TaskLogStatusBehavior;
  onReload: () => Promise<void>;
}

export function buildTaskFilterActionSpecs(
  onSelectFilter: (filter: TaskViewFilter) => Promise<void> | void,
): TaskActionSpec[] {
  return buildTaskFilterFlowSpecs(onSelectFilter).map(adaptFlowSpec);
}

export function buildTaskListActionSpecs(
  options: SharedTaskActionSpecOptions,
): TaskActionSpec[] {
  return buildTaskListFlowSpecs(options).map(adaptFlowSpec);
}

export function buildTaskDetailActionSpecs(
  options: SharedTaskActionSpecOptions & {
    onDidDelete: () => Promise<void> | void;
  },
): TaskActionSpec[] {
  return buildTaskDetailFlowSpecs(options).map(adaptFlowSpec);
}

function adaptFlowSpec(spec: TaskFlowSpec): TaskActionSpec {
  if (spec.kind === "target") {
    return {
      title: spec.title,
      icon: getActionIcon(spec.title),
      shortcut: spec.shortcut as TaskActionSpec["shortcut"],
      targetType: spec.target.type,
      target: renderTarget(spec.target),
    };
  }

  return {
    title: spec.title,
    icon: getActionIcon(spec.title),
    shortcut: spec.shortcut as TaskActionSpec["shortcut"],
    style: spec.destructive ? Action.Style.Destructive : undefined,
    onAction: buildMutationAction(spec),
  };
}

function getActionIcon(title: string): Icon | undefined {
  switch (title) {
    case "Open Task":
      return Icon.Eye;
    case "Log Work":
    case "Edit Task":
      return Icon.Pencil;
    case "Add Task":
      return Icon.Plus;
    case "Complete Task":
    case "Show Done Tasks":
      return Icon.CheckCircle;
    case "Start Task":
    case "Show in Progress":
      return Icon.Play;
    case "Reopen Task":
      return Icon.ArrowCounterClockwise;
    case "Archive Task":
    case "Show Archived Tasks":
      return Icon.Box;
    case "Delete Task":
      return Icon.Trash;
    case "Show All Tasks":
      return Icon.List;
    case "Show Open Tasks":
      return Icon.Circle;
    case "Show Due Soon Tasks":
      return Icon.Alarm;
    default:
      return undefined;
  }
}

function renderTarget(
  target: Extract<TaskFlowSpec, { kind: "target" }>["target"],
): ReactElement {
  switch (target.type) {
    case "TaskDetailView":
      return <TaskDetailView {...(target.props as any)} />;
    case "TaskForm":
      return <TaskForm {...(target.props as any)} />;
  }
}

function buildMutationAction(
  spec: Extract<TaskFlowSpec, { kind: "mutation" }>,
): () => Promise<void> {
  switch (spec.mutation) {
    case "complete":
      return async () => {
        await runTaskMutationAction(spec.title, spec.run);
      };
    case "start":
      return async () => {
        await runTaskMutationAction(spec.title, spec.run);
      };
    case "reopen":
      return async () => {
        await runTaskMutationAction(spec.title, spec.run);
      };
    case "archive":
      return async () => {
        await runTaskMutationAction(spec.title, spec.run);
      };
    case "delete":
      return async () => {
        const confirmed = await confirmAlert({
          title: "Delete task?",
          message: "This permanently removes the task from the storage note.",
          primaryAction: {
            title: "Delete Task",
            style: Alert.ActionStyle.Destructive,
          },
        });

        if (!confirmed) {
          return;
        }

        await runTaskMutationAction(spec.title, spec.run);
      };
    case "custom":
      return spec.run;
  }
}
