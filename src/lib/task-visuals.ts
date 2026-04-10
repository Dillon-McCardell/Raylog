import { Color, Icon, type Image } from "@raycast/api";
import type { TaskStatus, TaskViewFilter } from "./types";

export type TaskVisualTone =
  | "critical"
  | "warning"
  | "scheduled"
  | "inactive"
  | "success"
  | "info";

export type TaskIndicatorKind = "due" | "start" | "completed";

export interface TaskIconVisual {
  source: Icon | string;
  tintColor?: Color.ColorLike;
}

export function getTaskStatusIcon(status: TaskStatus): Image.ImageLike {
  switch (status) {
    case "open":
      return withTint(Icon.Circle, Color.Purple);
    case "in_progress":
      return withTint(Icon.Play, Color.Blue);
    case "done":
      return withTint(Icon.CheckCircle, Color.Green);
    case "archived":
      return withTint(Icon.Box, Color.SecondaryText);
  }
}

export function getTaskStatusTint(status: TaskStatus): Color.ColorLike {
  switch (status) {
    case "open":
      return Color.Purple;
    case "in_progress":
      return Color.Blue;
    case "done":
      return Color.Green;
    case "archived":
      return Color.SecondaryText;
  }
}

export function getTaskFilterIcon(filter: TaskViewFilter): Image.ImageLike {
  switch (filter) {
    case "all":
      return Icon.List;
    case "open":
      return withTint(Icon.Circle, Color.Purple);
    case "in_progress":
      return withTint(Icon.Play, Color.Blue);
    case "due_soon":
      return withTint(Icon.Calendar, Color.Orange);
    case "done":
      return withTint(Icon.CheckCircle, Color.Green);
    case "archived":
      return withTint(Icon.Box, Color.SecondaryText);
  }
}

export function getTaskIndicatorIcon(
  kind: TaskIndicatorKind,
  tone: TaskVisualTone,
): Image.ImageLike {
  if (kind === "start") {
    return withTint(Icon.Play, getTaskToneColor(tone));
  }

  if (kind === "completed") {
    return withTint(Icon.CheckCircle, getTaskToneColor(tone));
  }

  if (tone === "critical") {
    return withTint(Icon.Alarm, Color.Red);
  }

  return withTint(Icon.Calendar, getTaskToneColor(tone));
}

export function getTaskToneColor(tone: TaskVisualTone): Color.ColorLike {
  switch (tone) {
    case "critical":
      return Color.Red;
    case "warning":
      return Color.Orange;
    case "scheduled":
      return Color.Blue;
    case "inactive":
      return Color.SecondaryText;
    case "success":
      return Color.Green;
    case "info":
      return Color.Purple;
  }
}

export function getTaskActionIcon(title: string): Image.ImageLike | undefined {
  switch (title) {
    case "Open Task":
      return Icon.Eye;
    case "Log Work":
      return withTint(Icon.Pencil, Color.Blue);
    case "Edit Task":
      return Icon.Pencil;
    case "Add Task":
    case "Create Task":
      return withTint(Icon.Plus, Color.Blue);
    case "Complete Task":
    case "Show Done Tasks":
      return withTint(Icon.CheckCircle, Color.Green);
    case "Start Task":
    case "Show In Progress":
      return withTint(Icon.Play, Color.Blue);
    case "Reopen Task":
      return withTint(Icon.ArrowCounterClockwise, Color.Orange);
    case "Archive Task":
    case "Show Archived Tasks":
      return withTint(Icon.Box, Color.SecondaryText);
    case "Delete Task":
      return withTint(Icon.Trash, Color.Red);
    case "Show All Tasks":
      return Icon.List;
    case "Show Open":
      return withTint(Icon.Circle, Color.Purple);
    case "Show Due Soon":
      return withTint(Icon.Calendar, Color.Orange);
    case "Reload Task":
    case "Reload Tasks":
      return Icon.ArrowClockwise;
    case "Open Extension Preferences":
      return Icon.Gear;
    case "Save Task":
      return withTint(Icon.SaveDocument, Color.Blue);
    default:
      return undefined;
  }
}

function withTint(
  source: Icon | string,
  tintColor: Color.ColorLike,
): TaskIconVisual {
  return {
    source,
    tintColor,
  };
}
