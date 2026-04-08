import {
  Action,
  ActionPanel,
  Alert,
  Form,
  Icon,
  Toast,
  confirmAlert,
  popToRoot,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { fromCanonicalDateString, toCanonicalDateString } from "../lib/date";
import {
  getRaylogErrorMessage,
  isRaylogCorruptionError,
  RaylogRepository,
} from "../lib/storage";
import {
  getTaskStatusLabel,
  validateTaskInput,
  validateWorkLogInput,
} from "../lib/tasks";
import type {
  TaskLogStatusBehavior,
  TaskRecord,
  TaskStatus,
  TaskWorkLogRecord,
} from "../lib/types";

interface TaskFormValues {
  header: string;
  body: string;
  status: TaskStatus;
  dueDate: Date | null;
  startDate: Date | null;
  workLogs: TaskWorkLogRecord[];
}

type TaskFormInitialFocus = "header" | "new_work_log";

interface TaskFormProps {
  notePath: string;
  task?: TaskRecord;
  onDidSave?: () => Promise<void> | void;
  initialFocus?: TaskFormInitialFocus;
  statusBehavior?: TaskLogStatusBehavior;
}

export default function TaskForm({
  notePath,
  task,
  onDidSave,
  initialFocus = "header",
  statusBehavior = "auto_start",
}: TaskFormProps) {
  const { pop } = useNavigation();
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);
  const isEditing = Boolean(task);
  const [values, setValues] = useState<TaskFormValues>({
    header: task?.header ?? "",
    body: task?.body ?? "",
    status: task?.status ?? "open",
    dueDate: fromCanonicalDateString(task?.dueDate),
    startDate: fromCanonicalDateString(task?.startDate),
    workLogs: task?.workLogs ?? [],
  });
  const [headerError, setHeaderError] = useState<string>();
  const [newWorkLogEntry, setNewWorkLogEntry] = useState("");
  const [focusedWorkLogId, setFocusedWorkLogId] = useState<string>();
  const [pendingFocusWorkLogId, setPendingFocusWorkLogId] = useState<string>();
  const headerRef = useRef<Form.TextField | null>(null);
  const newWorkLogRef = useRef<Form.TextArea | null>(null);
  const workLogRefs = useRef<Record<string, Form.TextArea | null>>({});
  const hasAppliedInitialFocus = useRef(false);

  useEffect(() => {
    if (!pendingFocusWorkLogId) {
      return;
    }

    workLogRefs.current[pendingFocusWorkLogId]?.focus();
    setFocusedWorkLogId(pendingFocusWorkLogId);
    setPendingFocusWorkLogId(undefined);
  }, [pendingFocusWorkLogId, values.workLogs]);

  useEffect(() => {
    if (hasAppliedInitialFocus.current) {
      return;
    }

    const focusTarget =
      initialFocus === "new_work_log"
        ? newWorkLogRef.current
        : headerRef.current;

    if (!focusTarget) {
      return;
    }

    focusTarget.focus();
    hasAppliedInitialFocus.current = true;
  }, [initialFocus]);

  async function handleSubmit() {
    const trimmedNewWorkLogEntry = newWorkLogEntry.trim();
    const payload = {
      header: values.header,
      body: values.body,
      status: values.status,
      dueDate: toCanonicalDateString(values.dueDate),
      startDate: toCanonicalDateString(values.startDate),
      workLogs: isEditing
        ? buildUpdatedWorkLogs(task!.workLogs, values.workLogs)
        : [],
    };

    if (!values.header.trim()) {
      setHeaderError("Header is required");
      return;
    }

    const emptyWorkLog = values.workLogs.find(
      (workLog) => !workLog.body.trim(),
    );
    if (emptyWorkLog) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to save task",
        message: "Work log entries cannot be empty.",
      });
      return;
    }

    if (trimmedNewWorkLogEntry) {
      const workLogValidationMessage = validateWorkLogInput({
        body: trimmedNewWorkLogEntry,
      });
      if (workLogValidationMessage) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Unable to save task",
          message: workLogValidationMessage,
        });
        return;
      }
    }

    const validationMessage = validateTaskInput(payload);
    if (validationMessage) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to save task",
        message: validationMessage,
      });
      return;
    }

    try {
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
        );
      }

      await showToast({
        style: Toast.Style.Success,
        title: isEditing ? "Task updated" : "Task created",
      });

      if (onDidSave) {
        await onDidSave();
      }

      try {
        pop();
      } catch {
        await popToRoot({ clearSearchBar: true });
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: isRaylogCorruptionError(error)
          ? "Raylog database is corrupted"
          : isEditing
            ? "Unable to update task"
            : "Unable to create task",
        message: getRaylogErrorMessage(
          error,
          isEditing ? "Unable to update task." : "Unable to create task.",
        ),
      });
    }
  }

  async function handleDeleteFocusedWorkLog() {
    if (!focusedWorkLogId) {
      return;
    }

    const confirmed = await confirmAlert({
      title: "Delete work log?",
      message: "This removes the selected work log from the task.",
      primaryAction: {
        title: "Delete Work Log",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) {
      return;
    }

    setValues((currentValues) => {
      const deletedIndex = currentValues.workLogs.findIndex(
        (workLog) => workLog.id === focusedWorkLogId,
      );
      const workLogs = currentValues.workLogs.filter(
        (workLog) => workLog.id !== focusedWorkLogId,
      );
      const nextFocusedWorkLog =
        workLogs[deletedIndex] ?? workLogs[deletedIndex - 1];

      setPendingFocusWorkLogId(nextFocusedWorkLog?.id);

      return {
        ...currentValues,
        workLogs,
      };
    });
    setFocusedWorkLogId(undefined);
  }

  return (
    <Form
      navigationTitle={isEditing ? "Edit Task" : "Add Task"}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.SubmitForm
              title={isEditing ? "Save Task" : "Create Task"}
              icon={isEditing ? Icon.SaveDocument : Icon.Plus}
              onSubmit={handleSubmit}
            />
            {isEditing && focusedWorkLogId && (
              <Action
                title="Delete Work Log"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={handleDeleteFocusedWorkLog}
                shortcut={{ modifiers: ["cmd"], key: "d" }}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.TextField
        ref={headerRef}
        id="header"
        title="✦ Header"
        placeholder="Task header"
        value={values.header}
        error={headerError}
        onChange={(newValue) => {
          setValues((currentValues) => ({
            ...currentValues,
            header: newValue,
          }));
          if (headerError && newValue.trim()) {
            setHeaderError(undefined);
          }
        }}
      />
      <Form.TextArea
        id="body"
        title="📝 Body"
        placeholder="Optional markdown body"
        enableMarkdown
        value={values.body}
        onChange={(newValue) =>
          setValues((currentValues) => ({
            ...currentValues,
            body: newValue,
          }))
        }
      />
      <Form.Dropdown
        id="status"
        title="◉ Status"
        value={values.status}
        onChange={(value) =>
          setValues((currentValues) => ({
            ...currentValues,
            status: value as TaskStatus,
          }))
        }
      >
        <Form.Dropdown.Item value="open" title={getTaskStatusLabel("open")} />
        <Form.Dropdown.Item
          value="in_progress"
          title={getTaskStatusLabel("in_progress")}
        />
        <Form.Dropdown.Item value="done" title={getTaskStatusLabel("done")} />
        <Form.Dropdown.Item
          value="archived"
          title={getTaskStatusLabel("archived")}
        />
      </Form.Dropdown>
      <Form.DatePicker
        id="dueDate"
        title="⏰ Due Date"
        value={values.dueDate}
        onChange={(newValue) =>
          setValues((currentValues) => ({
            ...currentValues,
            dueDate: newValue,
          }))
        }
      />
      <Form.DatePicker
        id="startDate"
        title="▶ Start Date"
        value={values.startDate}
        onChange={(newValue) =>
          setValues((currentValues) => ({
            ...currentValues,
            startDate: newValue,
          }))
        }
      />
      {isEditing && (
        <>
          <Form.Description
            title="🗂 Work Logs"
            text={
              values.workLogs.length > 0
                ? "Edit existing work logs below. Focus a work log field to enable ⌘D deletion."
                : "No work logs yet."
            }
          />
          {values.workLogs.map((workLog, index) => (
            <Form.TextArea
              key={workLog.id}
              ref={(ref) => {
                workLogRefs.current[workLog.id] = ref;
              }}
              id={`workLog-${workLog.id}`}
              title={`🕒 Log ${index + 1}`}
              info={buildWorkLogInfo(workLog)}
              enableMarkdown
              value={workLog.body}
              onFocus={() => setFocusedWorkLogId(workLog.id)}
              onBlur={() =>
                setFocusedWorkLogId((currentValue) =>
                  currentValue === workLog.id ? undefined : currentValue,
                )
              }
              onChange={(newValue) =>
                setValues((currentValues) => ({
                  ...currentValues,
                  workLogs: currentValues.workLogs.map((candidate) =>
                    candidate.id === workLog.id
                      ? { ...candidate, body: newValue }
                      : candidate,
                  ),
                }))
              }
            />
          ))}
        </>
      )}
      <Form.TextArea
        ref={newWorkLogRef}
        id="newWorkLogEntry"
        title="➕ New Log Entry"
        placeholder="Log the work you completed for this task"
        enableMarkdown
        value={newWorkLogEntry}
        onChange={setNewWorkLogEntry}
      />
    </Form>
  );
}

async function maybeAdvanceTaskStatus(
  taskId: string,
  taskStatus: TaskStatus,
  statusBehavior: TaskLogStatusBehavior,
  repository: RaylogRepository,
) {
  if (taskStatus !== "open") {
    return;
  }

  if (statusBehavior === "keep_status") {
    return;
  }

  if (statusBehavior === "prompt") {
    const confirmed = await confirmAlert({
      title: "Move task to In Progress?",
      message: "Logging work on an open task can also start the task.",
      primaryAction: {
        title: "Start Task",
        style: Alert.ActionStyle.Default,
      },
    });

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

function buildWorkLogInfo(workLog: TaskWorkLogRecord): string {
  const created = new Date(workLog.createdAt).toLocaleString();
  if (!workLog.updatedAt) {
    return `Logged ${created}`;
  }

  return `Logged ${created}. Edited ${new Date(workLog.updatedAt).toLocaleString()}`;
}
