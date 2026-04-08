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
import { getDueSoonDays, getEnabledListMetadata } from "../lib/config";
import {
  getRaylogErrorMessage,
  isRaylogCorruptionError,
  RaylogRepository,
} from "../lib/storage";
import {
  filterTasks,
  getTaskFilterLabel,
  getTaskListIndicators,
  isActiveTaskStatus,
  sortTasks,
} from "../lib/tasks";
import type {
  TaskLogStatusBehavior,
  TaskRecord,
  TaskStatus,
  TaskViewFilter,
} from "../lib/types";
import TaskDetailView from "./TaskDetailView";
import TaskForm from "./TaskForm";
import TaskLogForm from "./TaskLogForm";

interface TaskListScreenProps {
  notePath: string;
  taskIds?: string[];
  selectedTaskId?: string;
  navigationTitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  hideFilters?: boolean;
  taskLogStatusBehavior?: TaskLogStatusBehavior;
}

export default function TaskListScreen({
  notePath,
  taskIds,
  selectedTaskId,
  navigationTitle = "Raylog Tasks",
  emptyTitle,
  emptyDescription,
  hideFilters = false,
  taskLogStatusBehavior = "auto_start",
}: TaskListScreenProps) {
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);
  const dueSoonDays = getDueSoonDays();
  const enabledListMetadata = getEnabledListMetadata();
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<TaskViewFilter>("all");
  const [loadError, setLoadError] = useState<string>();
  const effectiveSelectedFilter = selectedTaskId ? "all" : selectedFilter;

  const loadTasks = useCallback(async () => {
    const nextTasks = await repository.listTasks();
    setTasks(nextTasks);
  }, [repository]);

  const loadInitialState = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextTasks, nextFilter] = await Promise.all([
        repository.listTasks(),
        selectedTaskId
          ? Promise.resolve<TaskViewFilter>("all")
          : repository.getListTasksFilter(),
      ]);
      setTasks(nextTasks);
      setSelectedFilter(nextFilter);
      setLoadError(undefined);
    } catch (error) {
      setTasks([]);
      setLoadError(getRaylogErrorMessage(error, "Unable to load tasks."));
    } finally {
      setIsLoading(false);
    }
  }, [repository, selectedTaskId]);

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

  const handleSelectFilter = useCallback(
    async (filter: TaskViewFilter) => {
      setSelectedFilter(filter);

      try {
        await repository.setListTasksFilter(filter);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: isRaylogCorruptionError(error)
            ? "Raylog database is corrupted"
            : "Unable to save task view",
          message: getRaylogErrorMessage(
            error,
            "Unable to save the selected task view.",
          ),
        });
      }
    },
    [repository],
  );

  const scopedTasks = useMemo(() => {
    if (!taskIds) {
      return tasks;
    }

    const taskIdSet = new Set(taskIds);
    return tasks.filter((task) => taskIdSet.has(task.id));
  }, [taskIds, tasks]);

  const filteredTasks = useMemo(() => {
    if (taskIds) {
      const normalizedSearch = searchText.trim().toLowerCase();
      return sortTasks(scopedTasks).filter((task) => {
        if (!normalizedSearch) {
          return true;
        }

        return matchesTaskSearch(task, normalizedSearch, false);
      });
    }

    return filterTasks(
      scopedTasks,
      effectiveSelectedFilter,
      searchText,
      dueSoonDays,
    );
  }, [dueSoonDays, effectiveSelectedFilter, scopedTasks, searchText, taskIds]);

  const hasAnyTasks = scopedTasks.length > 0;
  const hasSearchOrFilter = searchText.trim().length > 0 || hasAnyTasks;

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={filteredTasks.length > 0}
      selectedItemId={selectedTaskId}
      navigationTitle={navigationTitle}
      searchBarPlaceholder="Search tasks by header or body"
      onSearchTextChange={setSearchText}
      filtering={false}
      searchBarAccessory={
        hideFilters ? undefined : (
          <TaskFilterDropdown
            selectedFilter={effectiveSelectedFilter}
            onSelectFilter={handleSelectFilter}
          />
        )
      }
    >
      {filteredTasks.length === 0 ? (
        <List.EmptyView
          title={
            loadError
              ? "Unable to load tasks"
              : (emptyTitle ??
                (hasAnyTasks ? "No tasks in this view" : "No tasks yet"))
          }
          description={
            loadError ??
            emptyDescription ??
            (hasSearchOrFilter
              ? "Try another view or search, or create a new task."
              : "Create your first task or update the storage note in Raycast Settings.")
          }
          actions={
            <ActionPanel>
              {!hideFilters && (
                <TaskFilterActions onSelectFilter={handleSelectFilter} />
              )}

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
            onSelectFilter={handleSelectFilter}
            task={task}
            onReload={loadTasks}
            hideFilters={hideFilters}
            taskLogStatusBehavior={taskLogStatusBehavior}
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
  onSelectFilter: (filter: TaskViewFilter) => Promise<void> | void;
  task: TaskRecord;
  onReload: () => Promise<void>;
  hideFilters: boolean;
  taskLogStatusBehavior: TaskLogStatusBehavior;
}

function TaskFilterDropdown({
  selectedFilter,
  onSelectFilter,
}: {
  selectedFilter: TaskViewFilter;
  onSelectFilter: (filter: TaskViewFilter) => Promise<void> | void;
}) {
  return (
    <List.Dropdown
      tooltip="Task View"
      value={selectedFilter}
      onChange={(value) => void onSelectFilter(value as TaskViewFilter)}
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
  );
}

function TaskFilterActions({
  onSelectFilter,
}: {
  onSelectFilter: (filter: TaskViewFilter) => Promise<void> | void;
}) {
  return (
    <ActionPanel.Section>
      <Action
        title="Show All Tasks"
        icon={Icon.List}
        onAction={() => void onSelectFilter("all")}
        shortcut={{ modifiers: ["cmd"], key: "1" }}
      />
      <Action
        title="Show Open Tasks"
        icon={Icon.Circle}
        onAction={() => void onSelectFilter("open")}
        shortcut={{ modifiers: ["cmd"], key: "2" }}
      />
      <Action
        title="Show in Progress"
        icon={Icon.Play}
        onAction={() => void onSelectFilter("in_progress")}
        shortcut={{ modifiers: ["cmd"], key: "3" }}
      />
      <Action
        title="Show Due Soon Tasks"
        icon={Icon.Alarm}
        onAction={() => void onSelectFilter("due_soon")}
        shortcut={{ modifiers: ["cmd"], key: "4" }}
      />
      <Action
        title="Show Done Tasks"
        icon={Icon.CheckCircle}
        onAction={() => void onSelectFilter("done")}
        shortcut={{ modifiers: ["cmd"], key: "5" }}
      />
      <Action
        title="Show Archived Tasks"
        icon={Icon.Box}
        onAction={() => void onSelectFilter("archived")}
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
  hideFilters,
  taskLogStatusBehavior,
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
          title: isRaylogCorruptionError(error)
            ? "Raylog database is corrupted"
            : `Unable to ${title.toLowerCase()}`,
          message: getRaylogErrorMessage(
            error,
            `Unable to ${title.toLowerCase()}.`,
          ),
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

    try {
      await repository.deleteTask(task.id);
      await showToast({
        style: Toast.Style.Success,
        title: "Task deleted",
      });
      await onReload();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: isRaylogCorruptionError(error)
          ? "Raylog database is corrupted"
          : "Unable to delete task",
        message: getRaylogErrorMessage(error, "Unable to delete task."),
      });
    }
  }, [onReload, repository, task.id]);

  const taskView = (
    <TaskDetailView
      notePath={notePath}
      taskId={task.id}
      statusBehavior={taskLogStatusBehavior}
      onDidChangeTask={onReload}
    />
  );
  const taskLogForm = (
    <TaskLogForm
      notePath={notePath}
      task={task}
      statusBehavior={taskLogStatusBehavior}
      onDidSave={onReload}
      onDidChangeTask={onReload}
    />
  );

  return (
    <List.Item
      id={task.id}
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
      detail={<List.Item.Detail markdown={buildTaskDetailMarkdown(task)} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push title="Open Task" icon={Icon.Eye} target={taskView} />
            <Action.Push
              title="Log Work"
              icon={Icon.Pencil}
              shortcut={{ modifiers: ["cmd"], key: "l" }}
              target={taskLogForm}
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
                    await onReload();
                  }}
                />
              }
            />
            <Action.Push
              title="Add Task"
              icon={Icon.Plus}
              target={<TaskForm notePath={notePath} onDidSave={onReload} />}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
            />
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
                shortcut={{ modifiers: ["cmd"], key: "s" }}
              />
            )}
            {task.status === "done" && (
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
            {task.status === "in_progress" && (
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
          </ActionPanel.Section>
          {!hideFilters && (
            <TaskFilterActions onSelectFilter={onSelectFilter} />
          )}
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

function matchesTaskSearch(
  task: TaskRecord,
  normalizedSearch: string,
  includeWorkLogs: boolean,
): boolean {
  if (
    task.header.toLowerCase().includes(normalizedSearch) ||
    task.body.toLowerCase().includes(normalizedSearch)
  ) {
    return true;
  }

  if (!includeWorkLogs) {
    return false;
  }

  return task.workLogs.some((workLog) =>
    workLog.body.toLowerCase().includes(normalizedSearch),
  );
}

function buildTaskDetailMarkdown(task: TaskRecord): string {
  const safeHeader = escapeMarkdown(task.header);
  const body = task.body.trim();
  const createdLabel = `◷ Created ${escapeMarkdown(
    new Date(task.createdAt).toLocaleString(),
  )}`;
  const wasEdited =
    new Date(task.updatedAt).getTime() > new Date(task.createdAt).getTime();
  const taskTimeline = wasEdited
    ? `\`${createdLabel} -> ✎ Edited ${escapeMarkdown(
        new Date(task.updatedAt).toLocaleString(),
      )}\``
    : `\`${createdLabel}\``;
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
    if (!body) {
      return `\n${taskTimeline}\n# ${safeHeader}`;
    }

    return `\n${taskTimeline}\n# ${safeHeader}\n\n---\n\n${body}`;
  }

  if (!body) {
    return `\n${taskTimeline}\n# ${safeHeader}\n\n---\n\n${workLogSections}`;
  }

  return `\n${taskTimeline}\n# ${safeHeader}\n\n---\n\n${body}\n\n---\n\n${workLogSections}`;
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
