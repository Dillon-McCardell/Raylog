import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  openExtensionPreferences,
} from "@raycast/api";
import { ReactNode, useEffect, useState } from "react";
import { getConfiguredStorageNotePath } from "../lib/config";
import { ensureStorageNote } from "../lib/storage";

interface ConfiguredCommandProps {
  children: (notePath: string) => ReactNode;
}

export default function ConfiguredCommand({
  children,
}: ConfiguredCommandProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [notePath, setNotePath] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    const configuredNotePath = getConfiguredStorageNotePath();
    setIsLoading(true);

    if (!configuredNotePath) {
      setNotePath(undefined);
      setMessage("Configure a storage note in Raycast Settings to use Raylog.");
      setIsLoading(false);
      return;
    }

    ensureStorageNote(configuredNotePath)
      .then(() => {
        setNotePath(configuredNotePath);
        setMessage(undefined);
      })
      .catch((error) => {
        setNotePath(undefined);
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load Raylog storage.",
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

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
