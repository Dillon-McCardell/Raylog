import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  Toast,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import fs from "fs";
import { ReactNode, useEffect, useState } from "react";
import { getConfiguredStorageNotePath } from "../lib/config";
import { RAYLOG_SCHEMA_VERSION } from "../lib/constants";
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
  const [isSchemaError, setIsSchemaError] = useState(false);
  const [currentSchemaVersion, setCurrentSchemaVersion] = useState<
    number | undefined
  >();

  useEffect(() => {
    void loadConfiguredNote();
  }, []);

  async function loadConfiguredNote() {
    const configuredNotePath = getConfiguredStorageNotePath();
    setIsLoading(true);
    setCanReset(false);
    setIsSchemaError(false);
    setCurrentSchemaVersion(undefined);

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
      setIsSchemaError(error instanceof RaylogSchemaError);
      if (error instanceof RaylogSchemaError) {
        setCurrentSchemaVersion(
          await readSchemaVersionFromNote(configuredNotePath),
        );
      }
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
    return <List isLoading />;
  }

  if (!notePath) {
    return (
      <List>
        <List.EmptyView
          icon={
            isSchemaError
              ? { source: Icon.Warning, tintColor: Color.Orange }
              : { source: Icon.Document, tintColor: Color.SecondaryText }
          }
          title={
            isSchemaError
              ? `Schema v${currentSchemaVersion ?? "?"} -> v${RAYLOG_SCHEMA_VERSION} Required`
              : "Set Up Raylog Storage"
          }
          description={buildEmptyStateDescription({
            message:
              message ??
              "Configure a storage note in Raycast Settings to use Raylog.",
            isSchemaError,
            currentSchemaVersion,
          })}
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
      </List>
    );
  }

  return <>{children(notePath)}</>;
}

function buildEmptyStateDescription({
  message,
  isSchemaError,
  currentSchemaVersion,
}: {
  message: string;
  isSchemaError: boolean;
  currentSchemaVersion?: number;
}): string {
  if (!isSchemaError) {
    return message;
  }

  return `Current Raylog requires data schema v${RAYLOG_SCHEMA_VERSION}, but this note is on v${currentSchemaVersion ?? "?"}. Reset the storage note to continue.`;
}

async function readSchemaVersionFromNote(
  notePath: string,
): Promise<number | undefined> {
  try {
    const markdown = await fs.promises.readFile(notePath, "utf8");
    const match = markdown.match(/"schemaVersion"\s*:\s*(\d+)/);
    if (!match) {
      return undefined;
    }

    const parsed = Number.parseInt(match[1], 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  } catch {
    return undefined;
  }
}
