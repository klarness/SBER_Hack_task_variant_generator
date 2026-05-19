// Тонкая обёртка вокруг fetch.
// Добавляет X-User-ID и нормализует ошибки в человекочитаемый вид.

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const USER_ID = import.meta.env.VITE_DEV_USER_ID || "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestInitNoHeaders extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
}

export async function apiFetch(
  path: string,
  init: RequestInitNoHeaders = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    "X-User-ID": USER_ID,
    ...init.headers,
  };

  // если в body не FormData — ставим JSON content-type
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }

  return res;
}

export async function apiJson<T>(
  path: string,
  init: RequestInitNoHeaders = {}
): Promise<T> {
  const res = await apiFetch(path, init);
  return res.json() as Promise<T>;
}
