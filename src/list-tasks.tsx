import ConfiguredCommand from "./components/ConfiguredCommand";
import TaskListScreen from "./components/TaskListScreen";
import { getTaskLogStatusBehavior } from "./lib/config";

export default function Command() {
  const taskLogStatusBehavior = getTaskLogStatusBehavior();

  return (
    <ConfiguredCommand>
      {(notePath) => (
        <TaskListScreen
          notePath={notePath}
          taskLogStatusBehavior={taskLogStatusBehavior}
        />
      )}
    </ConfiguredCommand>
  );
}
