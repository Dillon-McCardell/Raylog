import {
  Action,
  ActionPanel,
  Alert,
  Form,
  Icon,
  List,
  Toast,
  confirmAlert,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import fs from "fs";
import path from "path";
import { ReactNode, useEffect, useState } from "react";
import {
  getConfiguredStorageNotePath,
  setConfiguredStorageNotePath,
} from "../lib/config";
import { RAYLOG_SCHEMA_VERSION } from "../lib/constants";
import { getTaskActionIcon } from "../lib/task-visuals";
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
      setMessage("Choose a markdown file for Raylog storage.");
      setIsLoading(false);
      return;
    }

    try {
      await ensureStorageNote(configuredNotePath);
      setNotePath(configuredNotePath);
      setMessage(undefined);
    } catch (error) {
      let resolvedError = error;

      if (
        error instanceof RaylogInitializationRequiredError &&
        (await isMarkdownFileEmpty(configuredNotePath))
      ) {
        try {
          await resetStorageNote(configuredNotePath);
          await ensureStorageNote(configuredNotePath);
          setNotePath(configuredNotePath);
          setMessage(undefined);
          return;
        } catch (initializationError) {
          resolvedError = initializationError;
        }
      }

      setNotePath(undefined);
      setMessage(
        getRaylogErrorMessage(resolvedError, "Unable to load Raylog storage."),
      );
      setCanGenerateDatabase(
        resolvedError instanceof RaylogInitializationRequiredError,
      );
      setCanReset(
        resolvedError instanceof RaylogParseError ||
          resolvedError instanceof RaylogSchemaError,
      );
      setIsSchemaError(resolvedError instanceof RaylogSchemaError);
      setIsCorruptedStorage(isRaylogCorruptionError(resolvedError));
      if (resolvedError instanceof RaylogSchemaError) {
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
      title: "Create Raylog Database?",
      message: `Create a Raylog database in "${path.basename(configuredNotePath)}"? Existing markdown outside the Raylog block will be preserved.`,
      primaryAction: {
        title: "Create Database",
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
        title: "Raylog database created",
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

  async function handleConfigureStorage(notePath: string) {
    setConfiguredStorageNotePath(notePath);
    await loadConfiguredNote();
  }

  if (isLoading) {
    return <List isLoading />;
  }

  if (!notePath) {
    if (
      !canGenerateDatabase &&
      !canReset &&
      !isSchemaError &&
      !isCorruptedStorage
    ) {
      return (
        <StorageNoteSetupForm
          message={
            message ?? "Choose the markdown file Raylog should use for storage."
          }
          onSubmit={handleConfigureStorage}
        />
      );
    }

    return (
      <List>
        <List.EmptyView
          icon={
            isCorruptedStorage || isSchemaError ? Icon.Warning : Icon.Document
          }
          title={
            isSchemaError
              ? `Schema v${currentSchemaVersion ?? "?"} -> v${RAYLOG_SCHEMA_VERSION} Required`
              : isCorruptedStorage
                ? "Corrupted Raylog Database"
                : "Set Up Raylog Storage"
          }
          description={buildEmptyStateDescription({
            message: message ?? "Choose a markdown file for Raylog storage.",
            configuredNotePath: getConfiguredStorageNotePath(),
            canGenerateDatabase,
            isSchemaError,
            currentSchemaVersion,
          })}
          actions={
            <ActionPanel>
              {canGenerateDatabase && (
                <Action
                  title="Create Raylog Database"
                  icon={getTaskActionIcon("Add Task")}
                  onAction={handleGenerateStorage}
                />
              )}
              {canReset && (
                <Action
                  title="Reset Storage Note"
                  icon={Icon.ArrowCounterClockwise}
                  onAction={handleResetStorage}
                />
              )}
              <Action
                title="Open Extension Preferences"
                icon={getTaskActionIcon("Open Extension Preferences")}
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

function StorageNoteSetupForm({
  message,
  onSubmit,
}: {
  message: string;
  onSubmit: (notePath: string) => Promise<void>;
}) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  async function handleSubmit() {
    const selectedPath = selectedPaths[0]?.trim();
    if (!selectedPath) {
      setError("Choose a markdown file to continue.");
      return;
    }

    setError(undefined);

    try {
      await onSubmit(selectedPath);
    } catch (submitError) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to use storage note",
        message: getRaylogErrorMessage(
          submitError,
          "Unable to use the selected storage note.",
        ),
      });
    }
  }

  return (
    <Form
      navigationTitle="Set Up Raylog Storage"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Use File"
            icon={getTaskActionIcon("Add Task")}
            onSubmit={handleSubmit}
          />
          <Action
            title="Open Extension Preferences"
            icon={getTaskActionIcon("Open Extension Preferences")}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="Storage" text={message} />
      <Form.FilePicker
        id="storageNotePath"
        title="Storage Note"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        value={selectedPaths}
        error={error}
        onChange={(paths) => {
          setSelectedPaths(paths);
          if (error && paths[0]?.trim()) {
            setError(undefined);
          }
        }}
      />
    </Form>
  );
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
    return `"${path.basename(configuredNotePath ?? "note.md")}" does not have a Raylog database yet. Create one to continue.`;
  }

  if (!isSchemaError) {
    return message;
  }

  return `"${path.basename(configuredNotePath ?? "note.md")}" uses schema v${currentSchemaVersion ?? "?"}. Raylog needs v${RAYLOG_SCHEMA_VERSION}. Reset the file to continue.`;
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

async function isMarkdownFileEmpty(notePath: string): Promise<boolean> {
  try {
    const markdown = await fs.promises.readFile(notePath, "utf8");
    return markdown.trim().length === 0;
  } catch {
    return false;
  }
}
