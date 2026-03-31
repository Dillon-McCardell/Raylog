import ConfiguredCommand from "./components/ConfiguredCommand";
import TaskListScreen from "./components/TaskListScreen";

export default function Command() {
  return (
    <ConfiguredCommand>
      {(notePath) => <TaskListScreen notePath={notePath} />}
    </ConfiguredCommand>
  );
}
