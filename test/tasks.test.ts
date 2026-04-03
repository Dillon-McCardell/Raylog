import test from "node:test";
import assert from "node:assert/strict";
import {
  filterTasks,
  getTaskListIndicators,
  validateTaskInput,
} from "../src/lib/tasks";
import type { TaskRecord } from "../src/lib/types";

test("sorts open tasks by urgency within the open view", () => {
  const tasks = [
    createTask({
      id: "no-date",
      status: "open",
      dueDate: null,
      updatedAt: "2026-03-31T00:00:00.000Z",
    }),
    createTask({
      id: "upcoming",
      status: "open",
      dueDate: "2099-04-03T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:00.000Z",
    }),
    createTask({
      id: "overdue",
      status: "open",
      dueDate: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:00.000Z",
    }),
  ];

  assert.deepEqual(
    filterTasks(tasks, "open", "").map((task) => task.id),
    ["overdue", "upcoming", "no-date"],
  );
});

test("all view excludes archived tasks", () => {
  const tasks = [
    createTask({ id: "open", status: "open" }),
    createTask({ id: "in-progress", status: "in_progress" }),
    createTask({ id: "done", status: "done" }),
    createTask({ id: "archived", status: "archived" }),
  ];

  assert.deepEqual(
    filterTasks(tasks, "all", "").map((task) => task.id),
    ["open", "in-progress", "done"],
  );
});

test("due soon only includes open and in-progress tasks", () => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  const soonIso = soon.toISOString();

  const tasks = [
    createTask({
      id: "open-due",
      status: "open",
      dueDate: soonIso,
    }),
    createTask({
      id: "active-due",
      status: "in_progress",
      dueDate: soonIso,
    }),
    createTask({
      id: "done-due",
      status: "done",
      dueDate: soonIso,
    }),
    createTask({
      id: "archived-due",
      status: "archived",
      dueDate: soonIso,
    }),
  ];

  assert.deepEqual(
    filterTasks(tasks, "due_soon", "", 7).map((task) => task.id),
    ["open-due", "active-due"],
  );
});

test("uses the configured due soon day threshold", () => {
  const dueInThreeDays = new Date();
  dueInThreeDays.setDate(dueInThreeDays.getDate() + 3);

  const tasks = [
    createTask({
      id: "due-in-three",
      status: "open",
      dueDate: dueInThreeDays.toISOString(),
    }),
  ];

  assert.deepEqual(filterTasks(tasks, "due_soon", "", 2), []);
  assert.deepEqual(
    filterTasks(tasks, "due_soon", "", 3).map((task) => task.id),
    ["due-in-three"],
  );
});

test("search matches header and body within the selected view", () => {
  const tasks = [
    createTask({
      id: "a",
      status: "done",
      header: "Write docs",
      body: "",
      updatedAt: "2026-03-30T00:00:00.000Z",
    }),
    createTask({
      id: "b",
      status: "done",
      header: "Ship release",
      body: "Update docs before publishing",
      updatedAt: "2026-03-31T00:00:00.000Z",
    }),
  ];

  assert.deepEqual(
    filterTasks(tasks, "done", "docs").map((task) => task.id),
    ["b", "a"],
  );
});

test("validates date order", () => {
  assert.equal(
    validateTaskInput({
      header: "Task",
      startDate: "2026-04-02T00:00:00.000Z",
      dueDate: "2026-04-01T00:00:00.000Z",
    }),
    "Start Date cannot be after Due Date",
  );
});

test("builds due and future start indicators in priority order", () => {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const due = new Date();
  due.setDate(due.getDate() + 3);

  const indicators = getTaskListIndicators(
    createTask({
      dueDate: due.toISOString(),
      startDate: start.toISOString(),
    }),
    { dueDate: true, startDate: true },
  );

  assert.equal(indicators.length, 2);
  assert.equal(indicators[0]?.color, "red");
  assert.equal(indicators[0]?.text, "3d");
  assert.equal(indicators[1]?.color, "blue");
  assert.equal(indicators[1]?.text, "1d");
});

test("hides past start indicators and respects metadata toggles", () => {
  const pastStart = new Date();
  pastStart.setDate(pastStart.getDate() - 1);
  const due = new Date();
  due.setDate(due.getDate() + 5);

  const indicators = getTaskListIndicators(
    createTask({
      dueDate: due.toISOString(),
      startDate: pastStart.toISOString(),
    }),
    { dueDate: true, startDate: true },
  );

  assert.deepEqual(indicators.map((indicator) => indicator.text), ["5d"]);
});

test("omits disabled metadata types", () => {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const due = new Date();
  due.setDate(due.getDate() + 2);

  const indicators = getTaskListIndicators(
    createTask({
      dueDate: due.toISOString(),
      startDate: start.toISOString(),
    }),
    { dueDate: false, startDate: true },
  );

  assert.deepEqual(indicators.map((indicator) => indicator.text), ["1d"]);
});

function createTask(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    id: overrides.id ?? "task",
    header: overrides.header ?? "Task",
    body: overrides.body ?? "",
    status: overrides.status ?? "open",
    dueDate: overrides.dueDate ?? null,
    startDate: overrides.startDate ?? null,
    completedAt: overrides.completedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-03-31T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-31T00:00:00.000Z",
  };
}
