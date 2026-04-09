import { Action, Alert, Icon, confirmAlert } from "@raycast/api";
import type { ComponentProps } from "react";
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

type TaskDetailViewComponentProps = ComponentProps<typeof TaskDetailView>;
type TaskFormComponentProps = ComponentProps<typeof TaskForm>;

export interface TaskActionSpec {
  title: string;
  icon?: Icon;
  shortcut?: TaskFlowSpec["shortcut"];
  style?: Action.Style;
  target?: ComponentProps<typeof Action.Push>["target"];
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
      shortcut: spec.shortcut,
      targetType: spec.target.type,
      target: renderTarget(spec.target),
    };
  }

  return {
    title: spec.title,
    icon: getActionIcon(spec.title),
    shortcut: spec.shortcut,
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
): ComponentProps<typeof Action.Push>["target"] {
  switch (target.type) {
    case "TaskDetailView":
      return (
        <TaskDetailView
          {...(target.props as unknown as TaskDetailViewComponentProps)}
        />
      );
    case "TaskForm":
      return (
        <TaskForm {...(target.props as unknown as TaskFormComponentProps)} />
      );
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
