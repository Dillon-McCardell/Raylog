import { format } from "date-fns";

export function toCanonicalDateString(value?: Date | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  );
  return normalized.toISOString();
}

export function fromCanonicalDateString(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatTaskDate(value?: string | null): string {
  const parsed = fromCanonicalDateString(value);
  return parsed ? format(parsed, "MMM d, yyyy") : "Not set";
}
