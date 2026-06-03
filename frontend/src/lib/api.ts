const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function getInitData(): string {
  return window.Telegram?.WebApp?.initData || import.meta.env.VITE_DEV_INIT_DATA || "";
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const initData = getInitData();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `tma ${initData}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  return response.json() as Promise<T>;
}

export function hasTelegramInitData(): boolean {
  return Boolean(getInitData());
}
