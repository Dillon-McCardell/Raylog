import { popToRoot } from "@raycast/api";
import ConfiguredCommand from "./components/ConfiguredCommand";
import TaskForm from "./components/TaskForm";

export default function Command() {
  return (
    <ConfiguredCommand>
      {(notePath) => (
        <TaskForm
          notePath={notePath}
          onDidSave={async () => {
            await popToRoot({ clearSearchBar: true });
          }}
        />
      )}
    </ConfiguredCommand>
  );
}
