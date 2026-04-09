import { toCanonicalDateString } from "./date";
import type { RaylogRepository } from "./storage";
import { validateTaskInput, validateWorkLogInput } from "./tasks";
import type {
  TaskLogStatusBehavior,
  TaskRecord,
  TaskStatus,
  TaskWorkLogRecord,
} from "./types";

export interface TaskFormValues {
  header: string;
  body: string;
  status: TaskStatus;
  dueDate: Date | null;
  startDate: Date | null;
  workLogs: TaskWorkLogRecord[];
}

export interface SubmitTaskFormOptions {
  repository: RaylogRepository;
  task?: TaskRecord;
  values: TaskFormValues;
  newWorkLogEntry: string;
  statusBehavior: TaskLogStatusBehavior;
  onDidSave?: () => Promise<void> | void;
  pop: () => void;
  popToRoot: (options: { clearSearchBar: boolean }) => Promise<void>;
  showToastImpl: (options: {
    style: "success" | "failure";
    title: string;
    message?: string;
  }) => Promise<unknown>;
  confirmAlertImpl?: (options: {
    title: string;
    message: string;
    primaryAction: { title: string; style: string };
  }) => Promise<boolean>;
}

export async function submitTaskForm({
  repository,
  task,
  values,
  newWorkLogEntry,
  statusBehavior,
  onDidSave,
  pop,
  popToRoot,
  showToastImpl,
  confirmAlertImpl,
}: SubmitTaskFormOptions): Promise<
  "missing_header" | "validation_failed" | "saved"
> {
  const trimmedNewWorkLogEntry = newWorkLogEntry.trim();
  const payload = {
    header: values.header,
    body: values.body,
    status: values.status,
    dueDate: toCanonicalDateString(values.dueDate),
    startDate: toCanonicalDateString(values.startDate),
    workLogs: task ? buildUpdatedWorkLogs(task.workLogs, values.workLogs) : [],
  };

  if (!values.header.trim()) {
    return "missing_header";
  }

  const emptyWorkLog = values.workLogs.find((workLog) => !workLog.body.trim());
  if (emptyWorkLog) {
    await showToastImpl({
      style: "failure",
      title: "Unable to save task",
      message: "Work log entries cannot be empty.",
    });
    return "validation_failed";
  }

  if (trimmedNewWorkLogEntry) {
    const workLogValidationMessage = validateWorkLogInput({
      body: trimmedNewWorkLogEntry,
    });
    if (workLogValidationMessage) {
      await showToastImpl({
        style: "failure",
        title: "Unable to save task",
        message: workLogValidationMessage,
      });
      return "validation_failed";
    }
  }

  const validationMessage = validateTaskInput(payload);
  if (validationMessage) {
    await showToastImpl({
      style: "failure",
      title: "Unable to save task",
      message: validationMessage,
    });
    return "validation_failed";
  }

  const savedTask = task
    ? await repository.updateTask(task.id, payload)
    : await repository.createTask(payload);

  if (trimmedNewWorkLogEntry) {
    await repository.createWorkLog(savedTask.id, {
      body: trimmedNewWorkLogEntry,
    });
    await maybeAdvanceTaskStatus(
      savedTask.id,
      payload.status,
      statusBehavior,
      repository,
      confirmAlertImpl,
    );
  }

  await showToastImpl({
    style: "success",
    title: task ? "Task updated" : "Task created",
  });

  if (onDidSave) {
    await onDidSave();
  }

  try {
    pop();
  } catch {
    await popToRoot({ clearSearchBar: true });
  }

  return "saved";
}

async function maybeAdvanceTaskStatus(
  taskId: string,
  taskStatus: TaskStatus,
  statusBehavior: TaskLogStatusBehavior,
  repository: RaylogRepository,
  confirmAlertImpl?: SubmitTaskFormOptions["confirmAlertImpl"],
) {
  if (taskStatus !== "open") {
    return;
  }

  if (statusBehavior === "keep_status") {
    return;
  }

  if (statusBehavior === "prompt") {
    const confirmed = confirmAlertImpl
      ? await confirmAlertImpl({
          title: "Move task to In Progress?",
          message: "Logging work on an open task can also start the task.",
          primaryAction: {
            title: "Start Task",
            style: "default",
          },
        })
      : false;

    if (!confirmed) {
      return;
    }
  }

  await repository.startTask(taskId);
}

function buildUpdatedWorkLogs(
  originalWorkLogs: TaskWorkLogRecord[],
  nextWorkLogs: TaskWorkLogRecord[],
): TaskWorkLogRecord[] {
  const originalWorkLogMap = new Map(
    originalWorkLogs.map((workLog) => [workLog.id, workLog]),
  );
  const now = new Date().toISOString();

  return nextWorkLogs.map((workLog) => {
    const original = originalWorkLogMap.get(workLog.id);
    if (!original) {
      return workLog;
    }

    if (original.body === workLog.body) {
      return original;
    }

    return {
      ...original,
      body: workLog.body.trim(),
      updatedAt: now,
    };
  });
}
