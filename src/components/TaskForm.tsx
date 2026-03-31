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
import type { TaskRecord } from "../lib/types";

interface TaskFormValues {
  header: string;
  body?: string;
  dueDate?: Date | null;
  startDate?: Date | null;
  finishDate?: Date | null;
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
      dueDate: fromCanonicalDateString(task?.dueDate),
      startDate: fromCanonicalDateString(task?.startDate),
      finishDate: fromCanonicalDateString(task?.finishDate),
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
        dueDate: toCanonicalDateString(values.dueDate),
        startDate: toCanonicalDateString(values.startDate),
        finishDate: toCanonicalDateString(values.finishDate),
      };

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
      <Form.DatePicker title="Due Date" {...itemProps.dueDate} />
      <Form.DatePicker title="Start Date" {...itemProps.startDate} />
      <Form.DatePicker title="Finish Date" {...itemProps.finishDate} />
    </Form>
  );
}
