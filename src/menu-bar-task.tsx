import {
  Cache,
  LaunchType,
  MenuBarExtra,
  Toast,
  environment,
  launchCommand,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import path from "path";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRelativeDueLabel, isActiveTaskStatus } from "./lib/tasks";
import { getTaskActionIcon, getTaskStatusIcon } from "./lib/task-visuals";
import { readMenuBarCache } from "./lib/menu-bar-cache";
import { refreshMenuBarState } from "./lib/menu-bar-state";
import { createMenuBarRepository } from "./lib/menu-bar-state-runtime";
import { getRaylogErrorMessage } from "./lib/storage";
import type { TaskRecord } from "./lib/types";

export default function Command() {
  const repository = useMemo(() => createMenuBarRepository(), []);
  const cacheStore = useMemo(() => new Cache(), []);
  const cachedState = useMemo(() => readMenuBarCache(cacheStore), [cacheStore]);
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
    const nextState = await refreshMenuBarState({
      repository,
      cacheStore,
    });
    setCurrentTask(nextState.currentTask);
    setMenuTasks(nextState.menuTasks);
    setTitle(nextState.title);
    setTooltip(nextState.tooltip);
    setIsLoading(false);
  }, [cacheStore, repository]);

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
      icon={{
        source: {
          light: path.join(environment.assetsPath, "menu-bar-icon-light.svg"),
          dark: path.join(environment.assetsPath, "menu-bar-icon-dark.svg"),
        },
      }}
      isLoading={isLoading}
      title={title}
      tooltip={tooltip}
    >
      <MenuBarExtra.Section title="Current Task">
        <MenuBarExtra.Item
          title={title}
          subtitle={currentTask ? buildTaskSubtitle(currentTask) : undefined}
          icon={currentTask ? getTaskStatusIcon(currentTask.status) : undefined}
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
            icon={getTaskActionIcon("Complete Task")}
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
                icon={getTaskStatusIcon(task.status)}
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
          icon={getTaskActionIcon("Open Task")}
          onAction={() =>
            launchCommand({
              name: "list-tasks",
              type: LaunchType.UserInitiated,
            })
          }
        />
        <MenuBarExtra.Item
          title="Open Extension Preferences"
          icon={getTaskActionIcon("Open Extension Preferences")}
          onAction={openExtensionPreferences}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

function buildTaskSubtitle(task: TaskRecord): string | undefined {
  const relativeDueLabel = getRelativeDueLabel(task.dueDate);
  return relativeDueLabel ? `- ${relativeDueLabel}` : undefined;
}
