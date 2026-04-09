import { format } from "date-fns";

export function toCanonicalDateString(value?: Date | null): string | null {
  if (!value) {
    return null;
  }

  return value.toISOString();
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
  if (!parsed) {
    return "Not set";
  }

  const hasTime =
    parsed.getHours() !== 0 ||
    parsed.getMinutes() !== 0 ||
    parsed.getSeconds() !== 0 ||
    parsed.getMilliseconds() !== 0;

  return format(parsed, hasTime ? "MMM d, yyyy h:mm a" : "MMM d, yyyy");
}
