import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  Toast,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import { ReactNode, useEffect, useState } from "react";
import { getConfiguredStorageNotePath } from "../lib/config";
import {
  ensureStorageNote,
  RaylogParseError,
  RaylogSchemaError,
  resetStorageNote,
} from "../lib/storage";

interface ConfiguredCommandProps {
  children: (notePath: string) => ReactNode;
}

export default function ConfiguredCommand({
  children,
}: ConfiguredCommandProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [notePath, setNotePath] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [canReset, setCanReset] = useState(false);

  useEffect(() => {
    void loadConfiguredNote();
  }, []);

  async function loadConfiguredNote() {
    const configuredNotePath = getConfiguredStorageNotePath();
    setIsLoading(true);
    setCanReset(false);

    if (!configuredNotePath) {
      setNotePath(undefined);
      setMessage("Configure a storage note in Raycast Settings to use Raylog.");
      setIsLoading(false);
      return;
    }

    try {
      await ensureStorageNote(configuredNotePath);
      setNotePath(configuredNotePath);
      setMessage(undefined);
    } catch (error) {
      setNotePath(undefined);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load Raylog storage.",
      );
      setCanReset(
        error instanceof RaylogParseError || error instanceof RaylogSchemaError,
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetStorage() {
    const configuredNotePath = getConfiguredStorageNotePath();
    if (!configuredNotePath) {
      return;
    }

    setIsLoading(true);
    try {
      await resetStorageNote(configuredNotePath);
      await showToast({
        style: Toast.Style.Success,
        title: "Storage note reset",
      });
      await loadConfiguredNote();
    } catch (error) {
      setIsLoading(false);
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to reset storage",
        message: error instanceof Error ? error.message : undefined,
      });
    }
  }

  if (isLoading) {
    return <Detail isLoading markdown="Loading Raylog…" />;
  }

  if (!notePath) {
    return (
      <Detail
        markdown={
          message ??
          "Configure a storage note in Raycast Settings to use Raylog."
        }
        actions={
          <ActionPanel>
            {canReset && (
              <Action
                title="Reset Storage Note"
                icon={Icon.ArrowClockwise}
                onAction={handleResetStorage}
              />
            )}
            <Action
              title="Open Extension Preferences"
              icon={Icon.Gear}
              onAction={openExtensionPreferences}
            />
          </ActionPanel>
        }
      />
    );
  }

  return <>{children(notePath)}</>;
}
