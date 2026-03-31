export interface TaskRecord {
  id: string;
  header: string;
  body: string;
  dueDate: string | null;
  startDate: string | null;
  finishDate: string | null;
  completed: boolean;
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
  dueDate?: string | null;
  startDate?: string | null;
  finishDate?: string | null;
}
