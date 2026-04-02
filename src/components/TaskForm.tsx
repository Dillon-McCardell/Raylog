import {
  Action,
  ActionPanel,
  Form,
  Icon,
  Toast,
  popToRoot,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useForm } from "@raycast/utils";
import { useEffect, useMemo, useState } from "react";
import { toCanonicalDateString, fromCanonicalDateString } from "../lib/date";
import { RaylogRepository } from "../lib/storage";
import {
  getTaskStatusLabel,
  isActiveTaskStatus,
  validateTaskInput,
} from "../lib/tasks";
import type { TaskRecord, TaskStatus } from "../lib/types";

interface TaskFormValues {
  header: string;
  body?: string;
  status: TaskStatus;
  dueDate?: Date | null;
  startDate?: Date | null;
  dependencyType?: DependencyType;
  dependencyTaskId?: string;
}

interface TaskFormProps {
  notePath: string;
  task?: TaskRecord;
  onDidSave?: () => Promise<void> | void;
}

type DependencyType = "blocked_by" | "blocks";

export default function TaskForm({ notePath, task, onDidSave }: TaskFormProps) {
  const { pop } = useNavigation();
  const repository = useMemo(() => new RaylogRepository(notePath), [notePath]);
  const isEditing = Boolean(task);
  const [allTasks, setAllTasks] = useState<TaskRecord[]>([]);
  const [openTasks, setOpenTasks] = useState<TaskRecord[]>([]);
  const [blockedByTaskIds, setBlockedByTaskIds] = useState<string[]>(
    task?.blockedByTaskIds ?? [],
  );
  const [blocksTaskIds, setBlocksTaskIds] = useState<string[]>(
    task?.blocksTaskIds ?? [],
  );

  useEffect(() => {
    let didCancel = false;

    async function loadOpenTasks() {
      try {
        const tasks = await repository.listTasks();
        if (didCancel) {
          return;
        }

        setAllTasks(tasks.filter((candidate) => candidate.id !== task?.id));
        setOpenTasks(
          tasks.filter(
            (candidate) =>
              candidate.id !== task?.id && isActiveTaskStatus(candidate.status),
          ),
        );
      } catch {
        if (!didCancel) {
          setOpenTasks([]);
        }
      }
    }

    void loadOpenTasks();

    return () => {
      didCancel = true;
    };
  }, [repository, task?.id]);

  const taskOptions = useMemo(
    () =>
      openTasks.map((candidate) => ({
        id: candidate.id,
        title: candidate.header,
      })),
    [openTasks],
  );

  const dependencyTaskMap = useMemo(
    () =>
      new Map(allTasks.map((candidate) => [candidate.id, candidate.header])),
    [allTasks],
  );

  const { handleSubmit, itemProps, setValue, values } = useForm<TaskFormValues>(
    {
      initialValues: {
        header: task?.header ?? "",
        body: task?.body ?? "",
        status: task?.status ?? "open",
        dueDate: fromCanonicalDateString(task?.dueDate),
        startDate: fromCanonicalDateString(task?.startDate),
        dependencyType: undefined,
        dependencyTaskId: undefined,
      },
      validation: {
        header: (value) => {
          if (!value || value.trim().length === 0) {
            return "Header is required";
          }
        },
        dependencyType: (value) => {
          if (
            (value && !values.dependencyTaskId) ||
            (!value && values.dependencyTaskId)
          ) {
            return "Dependencies require both a type and task";
          }
        },
        dependencyTaskId: (value) => {
          if (
            (value && !values.dependencyType) ||
            (!value && values.dependencyType)
          ) {
            return "Dependencies require both a type and task";
          }
        },
      },
      async onSubmit(values) {
        const dependencyState = buildDependencyState({
          blockedByTaskIds,
          blocksTaskIds,
          dependencyType: values.dependencyType,
          dependencyTaskId: values.dependencyTaskId,
        });

        if (typeof dependencyState === "string") {
          await showToast({
            style: Toast.Style.Failure,
            title: "Unable to save task",
            message: dependencyState,
          });
          return;
        }

        const payload = {
          header: values.header,
          body: values.body ?? "",
          status: values.status,
          blockedByTaskIds: dependencyState.blockedByTaskIds,
          blocksTaskIds: dependencyState.blocksTaskIds,
          dueDate: toCanonicalDateString(values.dueDate),
          startDate: toCanonicalDateString(values.startDate),
        };

        try {
          const validationMessage = validateTaskInput(payload);
          if (validationMessage) {
            await showToast({
              style: Toast.Style.Failure,
              title: "Unable to save task",
              message: validationMessage,
            });
            return;
          }

          if (task) {
            await repository.updateTask(task.id, payload);
          } else {
            await repository.createTask(payload);
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
            title: isEditing
              ? "Unable to update task"
              : "Unable to create task",
            message: error instanceof Error ? error.message : undefined,
          });
        }
      },
    },
  );

  const addDependency = async () => {
    const dependencyType = values.dependencyType;
    const dependencyTaskId = values.dependencyTaskId;

    if (!dependencyType || !dependencyTaskId) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to add dependency",
        message: "Select both a dependency type and task",
      });
      return;
    }

    if (dependencyType === "blocked_by") {
      if (blockedByTaskIds.includes(dependencyTaskId)) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Unable to add dependency",
          message: "That Blocked By dependency already exists",
        });
        return;
      }

      setBlockedByTaskIds((current) => [...current, dependencyTaskId]);
    } else {
      if (blocksTaskIds.includes(dependencyTaskId)) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Unable to add dependency",
          message: "That Blocks dependency already exists",
        });
        return;
      }

      setBlocksTaskIds((current) => [...current, dependencyTaskId]);
    }

    setValue("dependencyType", undefined);
    setValue("dependencyTaskId", undefined);
  };

  const removeDependency = (
    dependencyType: DependencyType,
    dependencyTaskId: string,
  ) => {
    if (dependencyType === "blocked_by") {
      setBlockedByTaskIds((current) =>
        current.filter((id) => id !== dependencyTaskId),
      );
      return;
    }

    setBlocksTaskIds((current) =>
      current.filter((id) => id !== dependencyTaskId),
    );
  };

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
            <Action
              title="Add Dependency"
              icon={Icon.Link}
              onAction={() => void addDependency()}
              shortcut={{ modifiers: ["cmd"], key: "l" }}
            />
          </ActionPanel.Section>
          {blockedByTaskIds.length > 0 && (
            <ActionPanel.Section title="Remove Blocked By">
              {blockedByTaskIds.map((dependencyTaskId) => (
                <Action
                  key={`blocked-by-${dependencyTaskId}`}
                  title={
                    dependencyTaskMap.get(dependencyTaskId) ?? dependencyTaskId
                  }
                  icon={Icon.XMarkCircle}
                  onAction={() =>
                    removeDependency("blocked_by", dependencyTaskId)
                  }
                />
              ))}
            </ActionPanel.Section>
          )}
          {blocksTaskIds.length > 0 && (
            <ActionPanel.Section title="Remove Blocks">
              {blocksTaskIds.map((dependencyTaskId) => (
                <Action
                  key={`blocks-${dependencyTaskId}`}
                  title={
                    dependencyTaskMap.get(dependencyTaskId) ?? dependencyTaskId
                  }
                  icon={Icon.XMarkCircle}
                  onAction={() => removeDependency("blocks", dependencyTaskId)}
                />
              ))}
            </ActionPanel.Section>
          )}
        </ActionPanel>
      }
    >
      <Form.TextField
        title="Header"
        placeholder="Task header"
        {...itemProps.header}
      />
      <Form.TextArea
        title="Body"
        placeholder="Optional markdown body"
        {...itemProps.body}
      />
      <Form.Dropdown
        id={itemProps.status.id}
        title="Status"
        value={itemProps.status.value}
        onChange={(value) => itemProps.status.onChange?.(value as TaskStatus)}
        error={itemProps.status.error}
      >
        <Form.Dropdown.Item
          value="blocked"
          title={getTaskStatusLabel("blocked")}
        />
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
      <Form.DatePicker title="Due Date" {...itemProps.dueDate} />
      <Form.DatePicker title="Start Date" {...itemProps.startDate} />
      <Form.Separator />
      <Form.Description
        title="Dependencies"
        text={formatDependencySummary({
          blockedByTaskIds,
          blocksTaskIds,
          dependencyTaskMap,
        })}
      />
      <Form.Dropdown
        id={itemProps.dependencyType.id}
        title="Dependency Type"
        value={itemProps.dependencyType.value}
        onChange={(value) =>
          itemProps.dependencyType.onChange?.(value as DependencyType)
        }
        error={itemProps.dependencyType.error}
      >
        <Form.Dropdown.Item value="" title="None" />
        <Form.Dropdown.Item value="blocked_by" title="Blocked By" />
        <Form.Dropdown.Item value="blocks" title="Blocks" />
      </Form.Dropdown>
      <Form.Dropdown
        id={itemProps.dependencyTaskId.id}
        title="Dependency Task"
        placeholder="Search open tasks"
        filtering
        storeValue={false}
        value={itemProps.dependencyTaskId.value}
        onChange={itemProps.dependencyTaskId.onChange}
        error={itemProps.dependencyTaskId.error}
      >
        <Form.Dropdown.Item value="" title="None" />
        {taskOptions.map((candidate) => (
          <Form.Dropdown.Item
            key={candidate.id}
            value={candidate.id}
            title={candidate.title}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

function formatDependencySummary({
  blockedByTaskIds,
  blocksTaskIds,
  dependencyTaskMap,
}: {
  blockedByTaskIds: string[];
  blocksTaskIds: string[];
  dependencyTaskMap: Map<string, string>;
}): string {
  return [
    `← Blocked By: ${formatDependencySnippet(blockedByTaskIds, dependencyTaskMap)}`,
    `→ Blocks: ${formatDependencySnippet(blocksTaskIds, dependencyTaskMap)}`,
  ].join("   ·   ");
}

function formatDependencySnippet(
  dependencyTaskIds: string[],
  dependencyTaskMap: Map<string, string>,
): string {
  if (dependencyTaskIds.length === 0) {
    return "None";
  }

  const names = dependencyTaskIds.map(
    (taskId) => dependencyTaskMap.get(taskId) ?? taskId,
  );

  if (names.length === 1) {
    return names[0];
  }

  return `${names[0]} +${names.length - 1}`;
}

function buildDependencyState({
  blockedByTaskIds,
  blocksTaskIds,
  dependencyType,
  dependencyTaskId,
}: {
  blockedByTaskIds: string[];
  blocksTaskIds: string[];
  dependencyType?: DependencyType;
  dependencyTaskId?: string;
}): { blockedByTaskIds: string[]; blocksTaskIds: string[] } | string {
  if (!dependencyType && !dependencyTaskId) {
    return { blockedByTaskIds, blocksTaskIds };
  }

  if (!dependencyType || !dependencyTaskId) {
    return "Dependencies require both a type and task";
  }

  if (dependencyType === "blocked_by") {
    return {
      blockedByTaskIds: blockedByTaskIds.includes(dependencyTaskId)
        ? blockedByTaskIds
        : [...blockedByTaskIds, dependencyTaskId],
      blocksTaskIds,
    };
  }

  return {
    blockedByTaskIds,
    blocksTaskIds: blocksTaskIds.includes(dependencyTaskId)
      ? blocksTaskIds
      : [...blocksTaskIds, dependencyTaskId],
  };
}
