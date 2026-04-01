import {
  Action,
  ActionPanel,
  Alert,
  Icon,
  List,
  Toast,
  confirmAlert,
  environment,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import path from "path";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTaskDate } from "../lib/date";
import { getDueSoonDays, getEnabledListMetadata } from "../lib/config";
import { RaylogRepository } from "../lib/storage";
import {
  filterTasks,
  getTaskFilterLabel,
  getTaskListIndicators,
  getTaskStatusLabel,
} from "../lib/tasks";
import type { TaskRecord, TaskStatus } from "../lib/types";
import TaskForm from "./TaskForm";

interface TaskListScreenProps {
  notePath: string;
}

export default function TaskListScreen({ notePath }: TaskListScreenProps) {
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);
  const dueSoonDays = getDueSoonDays();
  const enabledListMetadata = getEnabledListMetadata();
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<
    "all" | "open" | "in_progress" | "due_soon" | "done" | "archived"
  >("all");
  const [loadError, setLoadError] = useState<string>();

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      setTasks(await repository.listTasks());
      setLoadError(undefined);
    } catch (error) {
      setTasks([]);
      setLoadError(
        error instanceof Error ? error.message : "Unable to load tasks.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const filteredTasks = useMemo(
    () => filterTasks(tasks, selectedFilter, searchText, dueSoonDays),
    [dueSoonDays, searchText, selectedFilter, tasks],
  );
  const hasAnyTasks = tasks.length > 0;
  const hasSearchOrFilter = searchText.trim().length > 0 || hasAnyTasks;

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={filteredTasks.length > 0}
      navigationTitle="Raylog Tasks"
      searchBarPlaceholder="Search tasks by header or body"
      onSearchTextChange={setSearchText}
      filtering={false}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Task View"
          value={selectedFilter}
          onChange={(value) =>
            setSelectedFilter(value as typeof selectedFilter)
          }
        >
          <List.Dropdown.Item value="all" title={getTaskFilterLabel("all")} />
          <List.Dropdown.Item value="open" title={getTaskFilterLabel("open")} />
          <List.Dropdown.Item
            value="in_progress"
            title={getTaskFilterLabel("in_progress")}
          />
          <List.Dropdown.Item
            value="due_soon"
            title={getTaskFilterLabel("due_soon")}
          />
          <List.Dropdown.Item value="done" title={getTaskFilterLabel("done")} />
          <List.Dropdown.Item
            value="archived"
            title={getTaskFilterLabel("archived")}
          />
        </List.Dropdown>
      }
    >
      {filteredTasks.length === 0 ? (
        <List.EmptyView
          title={
            loadError
              ? "Unable to load tasks"
              : hasAnyTasks
                ? "No tasks in this view"
                : "No tasks yet"
          }
          description={
            loadError ??
            (hasSearchOrFilter
              ? "Try another view or search, or create a new task."
              : "Create your first task or update the storage note in Raycast Settings.")
          }
          actions={
            <ActionPanel>
              <TaskFilterActions onSelectFilter={setSelectedFilter} />
              <ActionPanel.Section>
                <Action.Push
                  title="Add Task"
                  icon={Icon.Plus}
                  target={
                    <TaskForm notePath={notePath} onDidSave={loadTasks} />
                  }
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                />
                <Action
                  title="Reload Tasks"
                  icon={Icon.ArrowClockwise}
                  onAction={loadTasks}
                />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action
                  title="Open Extension Preferences"
                  icon={Icon.Gear}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ) : (
        filteredTasks.map((task) => (
          <TaskItem
            key={task.id}
            enabledListMetadata={enabledListMetadata}
            notePath={notePath}
            onSelectFilter={setSelectedFilter}
            task={task}
            onReload={loadTasks}
          />
        ))
      )}
    </List>
  );
}

interface TaskItemProps {
  enabledListMetadata: {
    dueDate: boolean;
    startDate: boolean;
  };
  notePath: string;
  onSelectFilter: (
    filter: "all" | "open" | "in_progress" | "due_soon" | "done" | "archived",
  ) => void;
  task: TaskRecord;
  onReload: () => Promise<void>;
}

function TaskFilterActions({
  onSelectFilter,
}: {
  onSelectFilter: (
    filter: "all" | "open" | "in_progress" | "due_soon" | "done" | "archived",
  ) => void;
}) {
  return (
    <ActionPanel.Section>
      <Action
        title="Show All Tasks"
        icon={Icon.List}
        onAction={() => onSelectFilter("all")}
        shortcut={{ modifiers: ["cmd"], key: "1" }}
      />
      <Action
        title="Show Open Tasks"
        icon={Icon.Circle}
        onAction={() => onSelectFilter("open")}
        shortcut={{ modifiers: ["cmd"], key: "2" }}
      />
      <Action
        title="Show in Progress"
        icon={Icon.Play}
        onAction={() => onSelectFilter("in_progress")}
        shortcut={{ modifiers: ["cmd"], key: "3" }}
      />
      <Action
        title="Show Due Soon Tasks"
        icon={Icon.Alarm}
        onAction={() => onSelectFilter("due_soon")}
        shortcut={{ modifiers: ["cmd"], key: "4" }}
      />
      <Action
        title="Show Done Tasks"
        icon={Icon.CheckCircle}
        onAction={() => onSelectFilter("done")}
        shortcut={{ modifiers: ["cmd"], key: "5" }}
      />
      <Action
        title="Show Archived Tasks"
        icon={Icon.Box}
        onAction={() => onSelectFilter("archived")}
        shortcut={{ modifiers: ["cmd"], key: "6" }}
      />
    </ActionPanel.Section>
  );
}

function TaskItem({
  enabledListMetadata,
  notePath,
  onSelectFilter,
  task,
  onReload,
}: TaskItemProps) {
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);
  const indicators = getTaskListIndicators(task, enabledListMetadata);

  const runTaskAction = useCallback(
    async (title: string, action: () => Promise<unknown>) => {
      try {
        await action();
        await showToast({
          style: Toast.Style.Success,
          title,
        });
        await onReload();
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: `Unable to ${title.toLowerCase()}`,
          message: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [onReload],
  );

  const handleDelete = useCallback(async () => {
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

    await runTaskAction("Task deleted", async () => {
      await repository.deleteTask(task.id);
    });
  }, [repository, runTaskAction, task.id]);

  return (
    <List.Item
      icon={getTaskIcon(task.status)}
      title={task.header}
      accessories={
        indicators.length > 0
          ? indicators.map((indicator) => ({
              icon: getIndicatorIcon(indicator.color),
              text: indicator.text,
              tooltip: indicator.tooltip,
            }))
          : undefined
      }
      detail={
        <List.Item.Detail
          markdown={buildTaskDetailMarkdown(task)}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label
                title="Status"
                text={getTaskStatusLabel(task.status)}
              />
              <List.Item.Detail.Metadata.Label
                title="Header"
                text={task.header}
              />
              <List.Item.Detail.Metadata.Label
                title="Due Date"
                text={formatTaskDate(task.dueDate)}
              />
              <List.Item.Detail.Metadata.Label
                title="Start Date"
                text={formatTaskDate(task.startDate)}
              />
              <List.Item.Detail.Metadata.Label
                title="Completed"
                text={formatTaskDate(task.completedAt)}
              />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label
                title="Created"
                text={new Date(task.createdAt).toLocaleString()}
              />
              <List.Item.Detail.Metadata.Label
                title="Updated"
                text={new Date(task.updatedAt).toLocaleString()}
              />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push
              title="Edit Task"
              icon={Icon.Pencil}
              shortcut={{ modifiers: ["cmd"], key: "e" }}
              target={
                <TaskForm
                  notePath={notePath}
                  task={task}
                  onDidSave={async () => {
                    await onReload();
                  }}
                />
              }
            />
            {task.status === "open" && (
              <Action
                title="Start Task"
                icon={Icon.Play}
                onAction={() =>
                  runTaskAction("Task started", async () => {
                    await repository.startTask(task.id);
                  })
                }
                shortcut={{ modifiers: ["cmd"], key: "s" }}
              />
            )}
            {(task.status === "open" || task.status === "in_progress") && (
              <Action
                title="Complete Task"
                icon={Icon.CheckCircle}
                onAction={() =>
                  runTaskAction("Task completed", async () => {
                    await repository.completeTask(task.id);
                  })
                }
                shortcut={{ modifiers: ["cmd"], key: "enter" }}
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
                shortcut={{ modifiers: ["cmd"], key: "r" }}
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
                shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
              />
            )}
            <Action
              title="Delete Task"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              onAction={handleDelete}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
            />
            <Action.Push
              title="Add Task"
              icon={Icon.Plus}
              target={<TaskForm notePath={notePath} onDidSave={onReload} />}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
            />
          </ActionPanel.Section>
          <TaskFilterActions onSelectFilter={onSelectFilter} />
          <ActionPanel.Section>
            <Action
              title="Open Extension Preferences"
              icon={Icon.Gear}
              onAction={openExtensionPreferences}
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
  return `# ${safeHeader}\n\n---\n\n${body}`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

function getTaskIcon(status: TaskStatus): Icon {
  switch (status) {
    case "open":
      return Icon.Circle;
    case "in_progress":
      return Icon.Play;
    case "done":
      return Icon.CheckCircle;
    case "archived":
      return Icon.Box;
  }
}

function getIndicatorIcon(color: "red" | "blue"): string {
  return path.join(
    environment.assetsPath,
    color === "red" ? "due-indicator.svg" : "start-indicator.svg",
  );
}
