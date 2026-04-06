import {
  Action,
  ActionPanel,
  Alert,
  Icon,
  List,
  Toast,
  confirmAlert,
  environment,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import fs from "fs";
import path from "path";
import { ReactNode, useEffect, useState } from "react";
import { getConfiguredStorageNotePath } from "../lib/config";
import { RAYLOG_SCHEMA_VERSION } from "../lib/constants";
import {
  ensureStorageNote,
  getRaylogErrorMessage,
  isRaylogCorruptionError,
  RaylogInitializationRequiredError,
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
  const [canGenerateDatabase, setCanGenerateDatabase] = useState(false);
  const [isSchemaError, setIsSchemaError] = useState(false);
  const [isCorruptedStorage, setIsCorruptedStorage] = useState(false);
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
    setCanGenerateDatabase(false);
    setIsSchemaError(false);
    setIsCorruptedStorage(false);
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
        getRaylogErrorMessage(error, "Unable to load Raylog storage."),
      );
      setCanGenerateDatabase(
        error instanceof RaylogInitializationRequiredError,
      );
      setCanReset(
        error instanceof RaylogParseError || error instanceof RaylogSchemaError,
      );
      setIsSchemaError(error instanceof RaylogSchemaError);
      setIsCorruptedStorage(isRaylogCorruptionError(error));
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
        message: getRaylogErrorMessage(
          error,
          "Unable to reset the storage note.",
        ),
      });
    }
  }

  async function handleGenerateStorage() {
    const configuredNotePath = getConfiguredStorageNotePath();
    if (!configuredNotePath) {
      return;
    }

    const confirmed = await confirmAlert({
      title: "Generate New Task Database?",
      message: `Create a fresh empty Raylog database in "${path.basename(configuredNotePath)}". Markdown outside the Raylog-managed block will be preserved.`,
      primaryAction: {
        title: "Generate Database",
        style: Alert.ActionStyle.Default,
      },
    });

    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    try {
      await resetStorageNote(configuredNotePath);
      await showToast({
        style: Toast.Style.Success,
        title: "Task database created",
      });
      await loadConfiguredNote();
    } catch (error) {
      setIsLoading(false);
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to generate database",
        message: getRaylogErrorMessage(
          error,
          "Unable to generate the task database.",
        ),
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
            isCorruptedStorage || isSchemaError
              ? Icon.Warning
              : path.join(environment.assetsPath, "icon-empty-view.png")
          }
          title={
            isSchemaError
              ? `Schema v${currentSchemaVersion ?? "?"} -> v${RAYLOG_SCHEMA_VERSION} Required`
              : isCorruptedStorage
                ? "Corrupted Raylog Database"
                : "Set Up Raylog Storage"
          }
          description={buildEmptyStateDescription({
            message:
              message ??
              "Configure a storage note in Raycast Settings to use Raylog.",
            configuredNotePath: getConfiguredStorageNotePath(),
            canGenerateDatabase,
            isSchemaError,
            currentSchemaVersion,
          })}
          actions={
            <ActionPanel>
              {canGenerateDatabase && (
                <Action
                  title="Generate New Task Database"
                  onAction={handleGenerateStorage}
                />
              )}
              {canReset && (
                <Action
                  title="Reset Storage Note"
                  onAction={handleResetStorage}
                />
              )}
              <Action
                title="Open Extension Preferences"
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
  configuredNotePath,
  canGenerateDatabase,
  isSchemaError,
  currentSchemaVersion,
}: {
  message: string;
  configuredNotePath?: string;
  canGenerateDatabase: boolean;
  isSchemaError: boolean;
  currentSchemaVersion?: number;
}): string {
  if (canGenerateDatabase) {
    return `Your task storage note "${path.basename(configuredNotePath ?? "note.md")}" appears to not contain a valid database format. Would you like to generate a new task database?`;
  }

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
