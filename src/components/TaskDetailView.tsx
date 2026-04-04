import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  Icon,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTaskDate } from "../lib/date";
import {
  getTaskStatusLabel,
  isActiveTaskStatus,
} from "../lib/tasks";
import { RaylogRepository } from "../lib/storage";
import type { TaskLogStatusBehavior, TaskRecord } from "../lib/types";
import TaskForm from "./TaskForm";
import TaskLogForm from "./TaskLogForm";

interface TaskDetailViewProps {
  notePath: string;
  taskId: string;
  statusBehavior: TaskLogStatusBehavior;
  onDidChangeTask?: () => Promise<void> | void;
}

export default function TaskDetailView({
  notePath,
  taskId,
  statusBehavior,
  onDidChangeTask,
}: TaskDetailViewProps) {
  const { pop } = useNavigation();
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);
  const [isLoading, setIsLoading] = useState(true);
  const [task, setTask] = useState<TaskRecord>();
  const [loadError, setLoadError] = useState<string>();

  const loadTask = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextTask = await repository.getTask(taskId);
      setTask(nextTask);
      setLoadError(undefined);
    } catch (error) {
      setTask(undefined);
      setLoadError(
        error instanceof Error ? error.message : "Unable to load task.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [repository, taskId]);

  useEffect(() => {
    void loadTask();
  }, [loadTask]);

  const runTaskAction = useCallback(
    async (title: string, action: () => Promise<unknown>) => {
      try {
        await action();
        if (onDidChangeTask) {
          await onDidChangeTask();
        }
        await showToast({
          style: Toast.Style.Success,
          title,
        });
        await loadTask();
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: `Unable to ${title.toLowerCase()}`,
          message: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [loadTask, onDidChangeTask],
  );

  const handleDelete = useCallback(async () => {
    if (!task) {
      return;
    }

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

    try {
      await repository.deleteTask(task.id);
      if (onDidChangeTask) {
        await onDidChangeTask();
      }
      await showToast({
        style: Toast.Style.Success,
        title: "Task deleted",
      });
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to delete task",
        message: error instanceof Error ? error.message : undefined,
      });
    }
  }, [onDidChangeTask, pop, repository, task]);

  if (!task) {
    return (
      <Detail
        isLoading={isLoading}
        navigationTitle="View Task"
        markdown={loadError ?? "The selected task could not be loaded."}
        actions={
          <ActionPanel>
            <Action
              title="Reload Task"
              icon={Icon.ArrowClockwise}
              onAction={loadTask}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle="View Task"
      markdown={buildTaskDetailMarkdown(task)}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Status"
            text={getTaskStatusLabel(task.status)}
          />
          <Detail.Metadata.Label
            title="Due Date"
            text={formatTaskDate(task.dueDate)}
          />
          <Detail.Metadata.Label
            title="Start Date"
            text={formatTaskDate(task.startDate)}
          />
          <Detail.Metadata.Label
            title="Completed"
            text={formatTaskDate(task.completedAt)}
          />
          <Detail.Metadata.Label
            title="Work Logs"
            text={String(task.workLogs.length)}
          />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Created"
            text={new Date(task.createdAt).toLocaleString()}
          />
          <Detail.Metadata.Label
            title="Updated"
            text={new Date(task.updatedAt).toLocaleString()}
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push
              title="Log Work"
              icon={Icon.Pencil}
              target={
                <TaskLogForm
                  notePath={notePath}
                  task={task}
                  statusBehavior={statusBehavior}
                  onDidSave={loadTask}
                  onDidChangeTask={onDidChangeTask}
                />
              }
            />
            <Action.Push
              title="Edit Task"
              icon={Icon.Pencil}
              shortcut={{ modifiers: ["cmd"], key: "e" }}
              target={
                <TaskForm
                  notePath={notePath}
                  task={task}
                  onDidSave={async () => {
                    await loadTask();
                    if (onDidChangeTask) {
                      await onDidChangeTask();
                    }
                  }}
                />
              }
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            {isActiveTaskStatus(task.status) && (
              <Action
                title="Complete Task"
                icon={Icon.CheckCircle}
                shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                onAction={() =>
                  runTaskAction("Task completed", async () => {
                    await repository.completeTask(task.id);
                  })
                }
              />
            )}
            {task.status === "open" && (
              <Action
                title="Start Task"
                icon={Icon.Play}
                onAction={() =>
                  runTaskAction("Task started", async () => {
                    await repository.startTask(task.id);
                  })
                }
              />
            )}
            {task.status !== "open" && (
              <Action
                title="Reopen Task"
                icon={Icon.ArrowCounterClockwise}
                onAction={() =>
                  runTaskAction("Task reopened", async () => {
                    await repository.reopenTask(task.id);
                  })
                }
              />
            )}
            {task.status !== "archived" && (
              <Action
                title="Archive Task"
                icon={Icon.Box}
                onAction={() =>
                  runTaskAction("Task archived", async () => {
                    await repository.archiveTask(task.id);
                  })
                }
              />
            )}
            <Action
              title="Delete Task"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              onAction={handleDelete}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Reload Task"
              icon={Icon.ArrowClockwise}
              onAction={loadTask}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function buildTaskDetailMarkdown(task: TaskRecord): string {
  const safeHeader = escapeMarkdown(task.header);
  const body = task.body.trim() ? task.body : "_No body_";
  const workLogSections = task.workLogs
    .map((workLog, index) => {
      const createdLabel = `◷ Logged ${escapeMarkdown(
        formatCompactDateTime(workLog.createdAt),
      )}`;
      const wasEdited =
        workLog.updatedAt !== null &&
        new Date(workLog.updatedAt).getTime() >
          new Date(workLog.createdAt).getTime();
      const workLogTimeline = wasEdited
        ? `\`${createdLabel} -> ✎ Edited ${escapeMarkdown(
            formatCompactDateTime(workLog.updatedAt as string),
          )}\``
        : `\`${createdLabel}\``;

      return `🗂 **Work Log ${index + 1}**\n\n${workLogTimeline}\n\n${workLog.body}`;
    })
    .join("\n\n---\n\n");

  if (!workLogSections) {
    return `# ${safeHeader}\n\n---\n\n${body}`;
  }

  return `# ${safeHeader}\n\n---\n\n${body}\n\n---\n\n${workLogSections}`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

function formatCompactDateTime(value: string): string {
  return new Date(value).toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  });
}
