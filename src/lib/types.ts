export type TaskStatus = "open" | "in_progress" | "done" | "archived";
export type TaskViewFilter =
  | "all"
  | "open"
  | "in_progress"
  | "due_soon"
  | "done"
  | "archived";

export interface RaylogViewState {
  hasSelectedListTasksFilter: boolean;
  listTasksFilter: TaskViewFilter;
}

export interface TaskRecord {
  id: string;
  header: string;
  body: string;
  status: TaskStatus;
  dueDate: string | null;
  startDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RaylogDocument {
  schemaVersion: number;
  tasks: TaskRecord[];
  viewState: RaylogViewState;
}

export interface TaskInput {
  header: string;
  body?: string;
  status?: TaskStatus;
  dueDate?: string | null;
  startDate?: string | null;
}
