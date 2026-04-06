import {
  Action,
  ActionPanel,
  Alert,
  Form,
  Icon,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useMemo, useState } from "react";
import { validateWorkLogInput } from "../lib/tasks";
import { RaylogRepository } from "../lib/storage";
import type { TaskLogStatusBehavior, TaskRecord } from "../lib/types";
import TaskForm from "./TaskForm";

interface TaskLogFormProps {
  notePath: string;
  task: TaskRecord;
  statusBehavior: TaskLogStatusBehavior;
  onDidSave: () => Promise<void>;
  onDidChangeTask?: () => Promise<void> | void;
}

interface TaskLogFormValues {
  entry: string;
}

export default function TaskLogForm({
  notePath,
  task,
  statusBehavior,
  onDidSave,
  onDidChangeTask,
}: TaskLogFormProps) {
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);
  const { pop } = useNavigation();
  const [entry, setEntry] = useState("");

  async function handleSubmit(values: TaskLogFormValues) {
    const validationMessage = validateWorkLogInput({ body: values.entry });
    if (validationMessage) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to save work log",
        message: validationMessage,
      });
      return;
    }

    try {
      await repository.createWorkLog(task.id, { body: values.entry });
      await maybeAdvanceTaskStatus(task, statusBehavior, repository);
      await onDidSave();
      if (onDidChangeTask) {
        await onDidChangeTask();
      }
      await showToast({
        style: Toast.Style.Success,
        title: "Work log saved",
      });
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to save work log",
        message: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <Form
      navigationTitle="Log Work"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Log"
            icon={Icon.Check}
            onSubmit={handleSubmit}
          />
          <Action.Push
            title="Add Task"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            target={
              <TaskForm
                notePath={notePath}
                onDidSave={async () => {
                  if (onDidChangeTask) {
                    await onDidChangeTask();
                  }
                }}
              />
            }
          />
        </ActionPanel>
      }
    >
      <Form.Description title="✦ Task" text={task.header} />
      <Form.Description
        title="📝 Body"
        text={task.body.trim() ? task.body : "No body"}
      />
      {task.workLogs.length > 0 ? (
        task.workLogs.map((workLog, index) => (
          <Form.Description
            key={workLog.id}
            title={`🕒 Log ${index + 1}`}
            text={buildWorkLogDescription(workLog)}
          />
        ))
      ) : (
        <Form.Description title="🗂 Work Logs" text="No work logs yet." />
      )}
      <Form.TextArea
        id="entry"
        title="➕ New Log Entry"
        placeholder="Log the work you completed for this task"
        enableMarkdown
        autoFocus
        value={entry}
        onChange={setEntry}
      />
    </Form>
  );
}

async function maybeAdvanceTaskStatus(
  task: TaskRecord,
  statusBehavior: TaskLogStatusBehavior,
  repository: RaylogRepository,
) {
  if (task.status !== "open") {
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

  await repository.startTask(task.id);
}

function buildWorkLogDescription(workLog: TaskRecord["workLogs"][number]): string {
  const created = new Date(workLog.createdAt).toLocaleString();
  const edited = workLog.updatedAt
    ? `\n\nEdited: ${new Date(workLog.updatedAt).toLocaleString()}`
    : "";

  return `Logged: ${created}${edited}\n\n${workLog.body}`;
}
