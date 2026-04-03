import { differenceInCalendarDays } from "date-fns";
import type {
  TaskInput,
  TaskRecord,
  TaskStatus,
  TaskViewFilter,
} from "./types";

export type TaskListIndicatorColor = "red" | "blue";

export interface EnabledListMetadata {
  dueDate: boolean;
  startDate: boolean;
}

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
  archived: "Archived",
};

const TASK_FILTER_LABELS: Record<TaskViewFilter, string> = {
  all: "All",
  open: "Inbox / Open",
  in_progress: "In Progress",
  due_soon: "Due Soon",
  done: "Done",
  archived: "Archived",
};

const OPEN_STATUS_PRIORITY: Record<TaskStatus, number> = {
  open: 0,
  in_progress: 1,
  done: 2,
  archived: 3,
};

export function getTaskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

export function getTaskFilterLabel(filter: TaskViewFilter): string {
  return TASK_FILTER_LABELS[filter];
}

export function isTaskViewFilter(value: unknown): value is TaskViewFilter {
  return (
    value === "all" ||
    value === "open" ||
    value === "in_progress" ||
    value === "due_soon" ||
    value === "done" ||
    value === "archived"
  );
}

export function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((left, right) => compareTasks(left, right));
}

export function filterTasks(
  tasks: TaskRecord[],
  filter: TaskViewFilter,
  searchText: string,
  dueSoonDays = 7,
): TaskRecord[] {
  const normalizedSearch = searchText.trim().toLowerCase();

  return sortTasks(tasks).filter((task) => {
    if (!matchesTaskFilter(task, filter, dueSoonDays)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return (
      task.header.toLowerCase().includes(normalizedSearch) ||
      task.body.toLowerCase().includes(normalizedSearch)
    );
  });
}

export function matchesTaskFilter(
  task: TaskRecord,
  filter: TaskViewFilter,
  dueSoonDays = 7,
): boolean {
  switch (filter) {
    case "all":
      return task.status !== "archived";
    case "open":
      return task.status === "open";
    case "in_progress":
      return task.status === "in_progress";
    case "due_soon":
      return isDueSoon(task, dueSoonDays);
    case "done":
      return task.status === "done";
    case "archived":
      return task.status === "archived";
  }
}

export function validateTaskInput(input: TaskInput): string | undefined {
  const header = input.header?.trim();
  if (!header) {
    return "Header is required";
  }

  const startDate = parseTaskDate(input.startDate);
  const dueDate = parseTaskDate(input.dueDate);

  if (startDate && dueDate && startDate.getTime() > dueDate.getTime()) {
    return "Start Date cannot be after Due Date";
  }

  return undefined;
}

export function isActiveTaskStatus(status: TaskStatus): boolean {
  return status === "open" || status === "in_progress";
}

export function getRelativeDueLabel(value?: string | null): string | null {
  const dueDate = parseTaskDate(value);
  if (!dueDate) {
    return null;
  }

  const daysUntilDue = differenceInCalendarDays(dueDate, startOfToday());
  if (daysUntilDue < 0) {
    return `Overdue ${Math.abs(daysUntilDue)}d`;
  }

  if (daysUntilDue === 0) {
    return "Due Today";
  }

  if (daysUntilDue === 1) {
    return "Due Tomorrow";
  }

  return `Due in ${daysUntilDue}d`;
}

export function getTaskListIndicators(
  task: TaskRecord,
  enabledMetadata: EnabledListMetadata,
): Array<{
  color: TaskListIndicatorColor;
  text: string;
  tooltip: string;
}> {
  const indicators: Array<{
    color: TaskListIndicatorColor;
    text: string;
    tooltip: string;
  }> = [];

  const dueIndicator = enabledMetadata.dueDate
    ? getDueDateIndicator(task.dueDate)
    : null;
  if (dueIndicator !== null) {
    indicators.push(dueIndicator);
  }

  const startIndicator = enabledMetadata.startDate
    ? getStartDateIndicator(task.startDate)
    : null;
  if (startIndicator !== null) {
    indicators.push(startIndicator);
  }

  return indicators;
}

function compareTasks(left: TaskRecord, right: TaskRecord): number {
  if (left.status !== right.status) {
    return (
      OPEN_STATUS_PRIORITY[left.status] - OPEN_STATUS_PRIORITY[right.status]
    );
  }

  if (isActiveTaskStatus(left.status)) {
    const urgencyComparison = compareOpenTaskUrgency(left, right);
    if (urgencyComparison !== 0) {
      return urgencyComparison;
    }
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function compareOpenTaskUrgency(left: TaskRecord, right: TaskRecord): number {
  const leftBucket = getUrgencyBucket(left);
  const rightBucket = getUrgencyBucket(right);

  if (leftBucket !== rightBucket) {
    return leftBucket - rightBucket;
  }

  if (left.dueDate && right.dueDate) {
    return left.dueDate.localeCompare(right.dueDate);
  }

  return 0;
}

function getUrgencyBucket(task: TaskRecord): number {
  const dueDate = parseTaskDate(task.dueDate);
  if (!dueDate) {
    return 3;
  }

  const daysUntilDue = differenceInCalendarDays(dueDate, startOfToday());
  if (daysUntilDue < 0) {
    return 0;
  }

  if (daysUntilDue <= 7) {
    return 1;
  }

  return 2;
}

function isDueSoon(task: TaskRecord, dueSoonDays: number): boolean {
  if (!isActiveTaskStatus(task.status)) {
    return false;
  }

  const dueDate = parseTaskDate(task.dueDate);
  if (!dueDate) {
    return false;
  }

  return differenceInCalendarDays(dueDate, startOfToday()) <= dueSoonDays;
}

function getDueDateIndicator(value?: string | null): {
  color: TaskListIndicatorColor;
  text: string;
  tooltip: string;
} | null {
  const dueDate = parseTaskDate(value);
  if (!dueDate) {
    return null;
  }

  const daysUntilDue = differenceInCalendarDays(dueDate, startOfToday());
  return {
    color: "red",
    text: formatCountdownDays(daysUntilDue),
    tooltip: buildCountdownTooltip("Due", daysUntilDue, dueDate),
  };
}

function getStartDateIndicator(value?: string | null): {
  color: TaskListIndicatorColor;
  text: string;
  tooltip: string;
} | null {
  const startDate = parseTaskDate(value);
  if (!startDate) {
    return null;
  }

  const daysUntilStart = differenceInCalendarDays(startDate, startOfToday());
  if (daysUntilStart < 0) {
    return null;
  }

  return {
    color: "blue",
    text: formatCountdownDays(daysUntilStart),
    tooltip: buildCountdownTooltip("Start", daysUntilStart, startDate),
  };
}

function formatCountdownDays(days: number): string {
  return `${days}d`;
}

function buildCountdownTooltip(
  label: string,
  days: number,
  date: Date,
): string {
  const formattedDate = date.toLocaleDateString();
  if (days < 0) {
    return `${label} ${Math.abs(days)}d ago (${formattedDate})`;
  }

  if (days === 0) {
    return `${label} today (${formattedDate})`;
  }

  return `${label} in ${days}d (${formattedDate})`;
}

function parseTaskDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfToday(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}
