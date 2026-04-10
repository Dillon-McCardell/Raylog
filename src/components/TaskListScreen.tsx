import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  Toast,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildTaskFilterActionSpecs,
  buildTaskListActionSpecs,
  type TaskActionSpec,
} from "./task-action-specs";
import { getDueSoonDays, getEnabledListMetadata } from "../lib/config";
import {
  getRaylogErrorMessage,
  isRaylogCorruptionError,
  RaylogRepository,
} from "../lib/storage";
import {
  filterTasks,
  getTaskFilterDescription,
  getTaskFilterLabel,
  getTaskListIndicators,
  sortTasks,
} from "../lib/tasks";
import {
  buildTaskDetailMarkdown,
  matchesTaskSearch,
} from "../lib/task-presentation";
import type {
  TaskLogStatusBehavior,
  TaskRecord,
  TaskStatus,
  TaskViewFilter,
} from "../lib/types";
import TaskForm from "./TaskForm";

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
  const pageSize = 200;
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);
  const dueSoonDays = getDueSoonDays();
  const enabledListMetadata = getEnabledListMetadata();
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<TaskViewFilter>("all");
  const [selectedListItemId, setSelectedListItemId] = useState<string>();
  const [visibleItemCount, setVisibleItemCount] = useState(pageSize);
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

  useEffect(() => {
    if (selectedTaskId) {
      setSelectedListItemId(selectedTaskId);
    }
  }, [selectedTaskId]);

  useEffect(() => {
    setVisibleItemCount(pageSize);
  }, [pageSize, searchText, effectiveSelectedFilter, taskIds, tasks]);

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
  const currentFilterDescription = getTaskFilterDescription(
    effectiveSelectedFilter,
  );
  const visibleTasks = filteredTasks.slice(0, visibleItemCount);
  const hasMoreVisibleTasks = visibleTasks.length < filteredTasks.length;

  useEffect(() => {
    setSelectedListItemId((currentSelection) => {
      if (!currentSelection) {
        return currentSelection;
      }

      return filteredTasks.some((task) => task.id === currentSelection)
        ? currentSelection
        : undefined;
    });
  }, [filteredTasks]);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={filteredTasks.length > 0}
      selectedItemId={selectedTaskId}
      navigationTitle={navigationTitle}
      searchBarPlaceholder="Search tasks by header or body"
      onSearchTextChange={setSearchText}
      onSelectionChange={(id) => setSelectedListItemId(id ?? undefined)}
      filtering={false}
      pagination={{
        pageSize,
        hasMore: hasMoreVisibleTasks,
        onLoadMore: () =>
          setVisibleItemCount((currentCount) => currentCount + pageSize),
      }}
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
              ? `${currentFilterDescription} Try another view or search, or create a new task.`
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
                    <TaskForm
                      notePath={notePath}
                      onDidSave={loadTasks}
                      resetOnSave
                    />
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
        visibleTasks.map((task) => (
          <TaskItem
            key={task.id}
            enabledListMetadata={enabledListMetadata}
            notePath={notePath}
            task={task}
            onReload={loadTasks}
            hideFilters={hideFilters}
            taskLogStatusBehavior={taskLogStatusBehavior}
            onSelectFilter={handleSelectFilter}
            isSelected={task.id === (selectedTaskId ?? selectedListItemId)}
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
  isSelected: boolean;
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
      tooltip={getTaskFilterDescription(selectedFilter)}
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
      {buildTaskFilterActionSpecs(onSelectFilter).map((spec) => (
        <RenderedAction key={spec.title} spec={spec} />
      ))}
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
  isSelected,
}: TaskItemProps) {
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);
  const indicators = getTaskListIndicators(task, enabledListMetadata);
  const actionSpecs = buildTaskListActionSpecs({
    notePath,
    repository,
    onReload,
    task,
    taskLogStatusBehavior,
  });

  return (
    <List.Item
      id={task.id}
      icon={getTaskIcon(task.status)}
      title={buildTaskTitle(task.header, indicators)}
      accessories={
        indicators.length > 0
          ? indicators.map((indicator) => ({
              tag: {
                value: indicator.text,
                color: getIndicatorColor(indicator.color),
              },
              tooltip: indicator.tooltip,
            }))
          : undefined
      }
      detail={
        isSelected ? (
          <List.Item.Detail
            markdown={buildTaskDetailMarkdown(task, { includeTopSpacer: true })}
          />
        ) : undefined
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {actionSpecs.map((spec) => (
              <RenderedAction key={spec.title} spec={spec} />
            ))}
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

function getIndicatorColor(color: "red" | "blue"): Color.ColorLike {
  return color === "red" ? Color.Red : Color.Blue;
}

function buildTaskTitle(
  header: string,
  indicators: ReturnType<typeof getTaskListIndicators>,
): { value: string; tooltip: string } {
  const maxTitleLength = getMaxTaskTitleLength(indicators);

  if (header.length <= maxTitleLength) {
    return {
      value: header,
      tooltip: header,
    };
  }

  return {
    value: `${header.slice(0, maxTitleLength - 3)}...`,
    tooltip: header,
  };
}

function getMaxTaskTitleLength(
  indicators: ReturnType<typeof getTaskListIndicators>,
): number {
  if (indicators.length === 0) {
    return 72;
  }

  const indicatorTextWidth = indicators.reduce(
    (width, indicator) => width + indicator.text.length,
    0,
  );

  if (indicators.length >= 2) {
    return Math.max(11, 22 - indicatorTextWidth);
  }

  return Math.max(17, 32 - indicatorTextWidth);
}

function RenderedAction({ spec }: { spec: TaskActionSpec }) {
  if (spec.target) {
    return (
      <Action.Push
        title={spec.title}
        icon={spec.icon}
        shortcut={spec.shortcut}
        target={spec.target}
      />
    );
  }

  return (
    <Action
      title={spec.title}
      icon={spec.icon}
      shortcut={spec.shortcut}
      style={spec.style}
      onAction={spec.onAction}
    />
  );
}
