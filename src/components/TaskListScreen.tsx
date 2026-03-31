import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { formatTaskDate } from "../lib/date";
import { RaylogRepository } from "../lib/storage";
import type { TaskRecord } from "../lib/types";
import TaskForm from "./TaskForm";

interface TaskListScreenProps {
  notePath: string;
}

export default function TaskListScreen({ notePath }: TaskListScreenProps) {
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [searchText, setSearchText] = useState("");

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      setTasks(await repository.listTasks());
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    if (!normalizedSearch) {
      return tasks;
    }

    return tasks.filter((task) => {
      return (
        task.header.toLowerCase().includes(normalizedSearch) ||
        task.body.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [searchText, tasks]);

  const openTasks = filteredTasks.filter((task) => !task.completed);
  const completedTasks = filteredTasks.filter((task) => task.completed);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={filteredTasks.length > 0}
      navigationTitle="Raylog Tasks"
      searchBarPlaceholder="Search tasks by header or body"
      onSearchTextChange={setSearchText}
      filtering={false}
    >
      {filteredTasks.length === 0 ? (
        <List.EmptyView
          title="No tasks yet"
          description="Create a task or update the storage note in Raycast Settings."
          actions={
            <ActionPanel>
              <Action.Push
                title="Add Task"
                icon={Icon.Plus}
                target={<TaskForm notePath={notePath} onDidSave={loadTasks} />}
              />
              <Action
                title="Open Extension Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
      ) : (
        <>
          {openTasks.length > 0 && (
            <List.Section title="Open Tasks">
              {openTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  notePath={notePath}
                  task={task}
                  onReload={loadTasks}
                />
              ))}
            </List.Section>
          )}
          {completedTasks.length > 0 && (
            <List.Section title="Completed Tasks">
              {completedTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  notePath={notePath}
                  task={task}
                  onReload={loadTasks}
                />
              ))}
            </List.Section>
          )}
        </>
      )}
    </List>
  );
}

interface TaskItemProps {
  notePath: string;
  task: TaskRecord;
  onReload: () => Promise<void>;
}

function TaskItem({ notePath, task, onReload }: TaskItemProps) {
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);

  const handleComplete = useCallback(async () => {
    await repository.completeTask(task.id);
    await showToast({
      style: Toast.Style.Success,
      title: "Task completed",
    });
    await onReload();
  }, [onReload, repository, task.id]);

  return (
    <List.Item
      icon={task.completed ? Icon.CheckCircle : Icon.Circle}
      title={task.header}
      accessories={[
        task.dueDate ? { tag: `Due ${formatTaskDate(task.dueDate)}` } : {},
        { text: `${formatDistanceToNowStrict(new Date(task.updatedAt))} ago` },
      ]}
      detail={
        <List.Item.Detail
          markdown={buildTaskDetailMarkdown(task)}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label
                title="Status"
                text={task.completed ? "Completed" : "Open"}
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
                title="Finish Date"
                text={formatTaskDate(task.finishDate)}
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
            {!task.completed && (
              <Action
                title="Complete Task"
                icon={Icon.CheckCircle}
                onAction={handleComplete}
                shortcut={{ modifiers: ["cmd"], key: "enter" }}
              />
            )}
            <Action.Push
              title="Add Task"
              icon={Icon.Plus}
              target={<TaskForm notePath={notePath} onDidSave={onReload} />}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
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
