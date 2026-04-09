import { Action, ActionPanel, Detail, Icon, useNavigation } from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildTaskDetailActionSpecs,
  type TaskActionSpec,
} from "./task-action-specs";
import { formatTaskDate } from "../lib/date";
import { getTaskStatusLabel } from "../lib/tasks";
import { buildTaskDetailMarkdown } from "../lib/task-presentation";
import { getRaylogErrorMessage, RaylogRepository } from "../lib/storage";
import type { TaskLogStatusBehavior, TaskRecord } from "../lib/types";

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
      setLoadError(getRaylogErrorMessage(error, "Unable to load task."));
    } finally {
      setIsLoading(false);
    }
  }, [repository, taskId]);

  useEffect(() => {
    void loadTask();
  }, [loadTask]);

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

  const actionSpecs = buildTaskDetailActionSpecs({
    notePath,
    repository,
    task,
    taskLogStatusBehavior: statusBehavior,
    onReload: async () => {
      await loadTask();
      if (onDidChangeTask) {
        await onDidChangeTask();
      }
    },
    onDidDelete: async () => {
      if (onDidChangeTask) {
        await onDidChangeTask();
      }
      pop();
    },
  });

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle="View Task"
      markdown={buildTaskDetailMarkdown(task, {
        emptyBodyFallback: "_No body_",
      })}
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
            {actionSpecs.map((spec) => (
              <RenderedAction key={spec.title} spec={spec} />
            ))}
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

function RenderedAction({ spec }: { spec: TaskActionSpec }) {
  if (spec.target) {
    return (
        <Action.Push
          title={spec.title}
          icon={spec.icon}
          shortcut={spec.shortcut as any}
          target={spec.target as any}
        />
    );
  }

  return (
    <Action
      title={spec.title}
      icon={spec.icon}
      shortcut={spec.shortcut as any}
      style={spec.style}
      onAction={spec.onAction}
    />
  );
}
