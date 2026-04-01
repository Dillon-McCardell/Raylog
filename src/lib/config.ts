import { getPreferenceValues } from "@raycast/api";

interface SharedPreferences {
  storageNotePath?: string;
}

interface ListTasksPreferences extends SharedPreferences {
  dueSoonDays?: string;
  showDueDateIndicator?: boolean;
  showStartDateIndicator?: boolean;
}

export function getConfiguredStorageNotePath(): string | undefined {
  const preferences = getPreferenceValues<SharedPreferences>();
  const path = preferences.storageNotePath?.trim();
  return path ? path : undefined;
}

export function getEnabledListMetadata(): {
  dueDate: boolean;
  startDate: boolean;
} {
  const preferences = getPreferenceValues<ListTasksPreferences>();
  return {
    dueDate: preferences.showDueDateIndicator ?? true,
    startDate: preferences.showStartDateIndicator ?? true,
  };
}

export function getDueSoonDays(): number {
  const preferences = getPreferenceValues<ListTasksPreferences>();
  const parsed = Number.parseInt(preferences.dueSoonDays ?? "7", 10);

  if (Number.isNaN(parsed)) {
    return 7;
  }

  return Math.max(0, parsed);
}
