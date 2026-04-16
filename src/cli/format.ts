import type { Event, Task } from "../domain/index.js";
import { truncate } from "../utils/text.js";

export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, columnIndex) => {
    const rowWidth = rows.reduce((max, row) => {
      const value = row[columnIndex] ?? "";
      return Math.max(max, value.length);
    }, 0);

    return Math.max(header.length, rowWidth);
  });

  const formatRow = (row: string[]): string =>
    row
      .map((cell, columnIndex) => (cell ?? "").padEnd(widths[columnIndex] ?? 0))
      .join("  ");

  const separator = widths.map((width) => "-".repeat(width)).join("  ");

  return [formatRow(headers), separator, ...rows.map(formatRow)].join("\n");
}

export function renderTaskRows(tasks: Task[], dependencyTitles: Map<string, string[]>): string[][] {
  return tasks.map((task) => {
    const dependsOn = dependencyTitles.get(task.id) ?? [];

    return [
      task.status,
      String(task.priority),
      task.type,
      dependsOn.length > 0 ? truncate(dependsOn.join(", "), 36) : "-",
      truncate(task.title, 48),
    ];
  });
}

export function renderEventLines(events: Event[]): string[] {
  return events.map((event) => `${event.createdAt}  ${event.type}`);
}

export function shortIdentifier(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 18)}...`;
}
