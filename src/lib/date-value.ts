export function dateKey(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    }
    const seconds = candidate.seconds ?? candidate._seconds;
    if (typeof seconds === "number") return new Date(seconds * 1000).toISOString().slice(0, 10);
  }
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}
