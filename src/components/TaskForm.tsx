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
import { toCanonicalDateString, fromCanonicalDateString } from "../lib/date";
import { RaylogRepository } from "../lib/storage";
import { getTaskStatusLabel, validateTaskInput } from "../lib/tasks";
import type { TaskRecord, TaskStatus } from "../lib/types";

interface TaskFormValues {
  header: string;
  body?: string;
  status: TaskStatus;
  dueDate?: Date | null;
  startDate?: Date | null;
}

interface TaskFormProps {
  notePath: string;
  task?: TaskRecord;
  onDidSave?: () => Promise<void> | void;
}

export default function TaskForm({ notePath, task, onDidSave }: TaskFormProps) {
  const { pop } = useNavigation();
  const repository = new RaylogRepository(notePath);
  const isEditing = Boolean(task);

  const { handleSubmit, itemProps } = useForm<TaskFormValues>({
    initialValues: {
      header: task?.header ?? "",
      body: task?.body ?? "",
      status: task?.status ?? "open",
      dueDate: fromCanonicalDateString(task?.dueDate),
      startDate: fromCanonicalDateString(task?.startDate),
    },
    validation: {
      header: (value) => {
        if (!value || value.trim().length === 0) {
          return "Header is required";
        }
      },
    },
    async onSubmit(values) {
      const payload = {
        header: values.header,
        body: values.body ?? "",
        status: values.status,
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
          title: isEditing ? "Unable to update task" : "Unable to create task",
          message: error instanceof Error ? error.message : undefined,
        });
      }
    },
  });

  return (
    <Form
      navigationTitle={isEditing ? "Edit Task" : "Add Task"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={isEditing ? "Save Task" : "Create Task"}
            icon={isEditing ? Icon.SaveDocument : Icon.Plus}
            onSubmit={handleSubmit}
          />
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
    </Form>
  );
}
