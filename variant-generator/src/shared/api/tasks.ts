import { apiFetch, apiJson } from "./client";
import type { ExportResult, Task, TaskSettings } from "@/shared/types/domain";

export interface CreateTaskInput {
  title: string;
  text?: string;
  files: File[];
  settings: TaskSettings;
  variantCount: number;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const fd = new FormData();
  fd.append("title", input.title);
  if (input.text) fd.append("text", input.text);
  fd.append("settings", JSON.stringify(input.settings));
  fd.append("variant_count", String(input.variantCount));
  for (const file of input.files) {
    fd.append("files", file, file.name);
  }
  return apiJson<Task>("/api/v1/tasks", {
    method: "POST",
    body: fd,
  });
}

export async function getTask(id: string): Promise<Task> {
  return apiJson<Task>(`/api/v1/tasks/${id}`);
}

export interface ListTasksParams {
  query?: string;
  subject?: string;
  topic?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function listTasks(
  params: ListTasksParams = {}
): Promise<{ items: Task[] }> {
  const search = new URLSearchParams();
  if (params.query) search.set("q", params.query);
  if (params.subject) search.set("subject", params.subject);
  if (params.topic) search.set("topic", params.topic);
  if (params.status) search.set("status", params.status);
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));
  return apiJson(`/api/v1/tasks?${search.toString()}`);
}

export async function exportTask(id: string): Promise<ExportResult> {
  const res = await apiFetch(`/api/v1/tasks/${id}/export`);
  const blob = await res.blob();

  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || `export-${id}`;
  return { filename, blob };
}

export function downloadBlob(result: ExportResult) {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
