import type { LearnedTask } from "./types.js";
export const taskKey = (task: LearnedTask): string =>
  [task.kind, task.mode, task.target, task.coverage, task.input].join(":");
