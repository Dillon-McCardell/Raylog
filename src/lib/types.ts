export type TaskStatus = "open" | "in_progress" | "done" | "archived";

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
}

export interface TaskInput {
  header: string;
  body?: string;
  status?: TaskStatus;
  dueDate?: string | null;
  startDate?: string | null;
}
