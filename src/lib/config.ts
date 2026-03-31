import { getPreferenceValues } from "@raycast/api";

interface ExtensionPreferences {
  storageNotePath?: string;
}

export function getConfiguredStorageNotePath(): string | undefined {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const path = preferences.storageNotePath?.trim();
  return path ? path : undefined;
}
