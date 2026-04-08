import {
  Cache,
  Icon,
  LaunchType,
  MenuBarExtra,
  Toast,
  launchCommand,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getConfiguredStorageNotePath } from "./lib/config";
import {
  getMenuBarTask,
  getMenuBarTasks,
  getRelativeDueLabel,
  isActiveTaskStatus,
} from "./lib/tasks";
import { getRaylogErrorMessage, RaylogRepository } from "./lib/storage";
import type { TaskRecord } from "./lib/types";

const MENU_BAR_CACHE_KEY = "menu-bar-state";
const cache = new Cache();

interface MenuBarCacheState {
  currentTask?: TaskRecord;
  menuTasks: TaskRecord[];
  title: string;
  tooltip: string;
}

export default function Command() {
  const notePath = getConfiguredStorageNotePath();
  const repository = useMemo(
    () => (notePath ? new RaylogRepository(notePath) : undefined),
    [notePath],
  );
  const cachedState = useMemo(() => readMenuBarCache(), []);
  const [isLoading, setIsLoading] = useState(!repository && !cachedState);
  const [currentTask, setCurrentTask] = useState<TaskRecord | undefined>(
    cachedState?.currentTask,
  );
  const [menuTasks, setMenuTasks] = useState<TaskRecord[]>(
    cachedState?.menuTasks ?? [],
  );
  const [title, setTitle] = useState(cachedState?.title ?? "Raylog");
  const [tooltip, setTooltip] = useState(
    cachedState?.tooltip ?? "Raylog task menu bar",
  );

  const loadMenuBarTasks = useCallback(async () => {
    if (!repository) {
      setCurrentTask(undefined);
      setMenuTasks([]);
      setTitle("Set Up Raylog");
      setTooltip("Configure a Raylog storage note in extension preferences.");
      setIsLoading(false);
      return;
    }

    try {
      const tasks = await repository.listTasks();
      const nextCurrentTask = getMenuBarTask(tasks);
      const nextMenuTasks = getMenuBarTasks(tasks, 5);
      const nextState = buildMenuBarState(nextCurrentTask, nextMenuTasks);

      setCurrentTask(nextState.currentTask);
      setMenuTasks(nextState.menuTasks);
      setTitle(nextState.title);
      setTooltip(nextState.tooltip);
      writeMenuBarCache(nextState);
    } catch (error) {
      setCurrentTask(undefined);
      setMenuTasks([]);
      setTitle("Raylog Error");
      setTooltip(getRaylogErrorMessage(error, "Unable to load Raylog tasks."));
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void loadMenuBarTasks();
  }, [loadMenuBarTasks]);

  const handleCompleteCurrentTask = useCallback(async () => {
    if (
      !repository ||
      !currentTask ||
      !isActiveTaskStatus(currentTask.status)
    ) {
      return;
    }

    try {
      await repository.completeTask(currentTask.id);
      await showToast({
        style: Toast.Style.Success,
        title: "Task completed",
      });
      await loadMenuBarTasks();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to complete task",
        message: getRaylogErrorMessage(error, "Unable to complete task."),
      });
    }
  }, [currentTask, loadMenuBarTasks, repository]);

  return (
    <MenuBarExtra
      icon={Icon.List}
      isLoading={isLoading}
      title={title}
      tooltip={tooltip}
    >
      <MenuBarExtra.Section title="Current Task">
        <MenuBarExtra.Item
          title={title}
          subtitle={currentTask ? buildTaskSubtitle(currentTask) : undefined}
          onAction={
            currentTask
              ? () =>
                  launchCommand({
                    name: "list-tasks",
                    type: LaunchType.UserInitiated,
                    context: { selectedTaskId: currentTask.id },
                  })
              : undefined
          }
        />
        {currentTask && isActiveTaskStatus(currentTask.status) && (
          <MenuBarExtra.Item
            title="Complete Current Task"
            icon={Icon.CheckCircle}
            onAction={handleCompleteCurrentTask}
          />
        )}
      </MenuBarExtra.Section>
      {menuTasks.length > 0 && (
        <MenuBarExtra.Section title="Next 5 Tasks">
          {menuTasks
            .filter((task) => task.id !== currentTask?.id)
            .map((task) => (
              <MenuBarExtra.Item
                key={task.id}
                title={task.header}
                subtitle={buildTaskSubtitle(task)}
                onAction={() =>
                  launchCommand({
                    name: "list-tasks",
                    type: LaunchType.UserInitiated,
                    context: { selectedTaskId: task.id },
                  })
                }
              />
            ))}
        </MenuBarExtra.Section>
      )}
      <MenuBarExtra.Section title="Actions">
        <MenuBarExtra.Item
          title="Open Task List"
          icon={Icon.Eye}
          onAction={() =>
            launchCommand({
              name: "list-tasks",
              type: LaunchType.UserInitiated,
            })
          }
        />
        <MenuBarExtra.Item
          title="Open Extension Preferences"
          icon={Icon.Gear}
          onAction={openExtensionPreferences}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

function buildMenuBarState(
  task: TaskRecord | undefined,
  menuTasks: TaskRecord[],
): MenuBarCacheState {
  if (!task) {
    return {
      currentTask: undefined,
      menuTasks,
      title: "No Tasks",
      tooltip: "No non-archived Raylog tasks are available.",
    };
  }

  return {
    currentTask: task,
    menuTasks,
    title: task.header,
    tooltip: task.dueDate
      ? `Next due task: ${task.header}`
      : `First task: ${task.header}`,
  };
}

function buildTaskSubtitle(task: TaskRecord): string | undefined {
  const relativeDueLabel = getRelativeDueLabel(task.dueDate);
  return relativeDueLabel ? `- ${relativeDueLabel}` : undefined;
}

function readMenuBarCache(): MenuBarCacheState | undefined {
  const cachedValue = cache.get(MENU_BAR_CACHE_KEY);
  if (!cachedValue) {
    return undefined;
  }

  try {
    return JSON.parse(cachedValue) as MenuBarCacheState;
  } catch {
    cache.remove(MENU_BAR_CACHE_KEY);
    return undefined;
  }
}

function writeMenuBarCache(state: MenuBarCacheState): void {
  cache.set(MENU_BAR_CACHE_KEY, JSON.stringify(state));
}
