import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  deleteStorageItem,
  getStorageItem,
  setStorageItem,
} from "./storage";

/**
 * Resolve the backend URL:
 * 1. EXPO_PUBLIC_API_URL env var (set when starting expo) wins
 * 2. In dev, derive it from the Metro debugger host (the machine's LAN IP),
 *    so physical devices reached via QR also hit the right API
 * 3. Fallbacks: Android emulator loopback / localhost for web + iOS sim
 */
function resolveApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const hostUri: string | undefined =
    (Constants as any).expoConfig?.hostUri ?? (Constants as any).manifest?.debuggerHost;
  if (hostUri) {
    const host = String(hostUri).split(":")[0];
    if (host) return `http://${host}:8000`;
  }
  if (Platform.OS === "android") return "http://10.0.2.2:8000";
  return "http://localhost:8000";
}

export const API_HOST = resolveApiUrl();
export const TOKEN_KEY = "pgms_token";

let token: string | null = null;

export async function initToken(): Promise<string | null> {
  if (!token) {
    token = (await getStorageItem(TOKEN_KEY)) ?? null;
  }
  return token;
}

export async function saveToken(t: string) {
  token = t;
  await setStorageItem(TOKEN_KEY, t);
}

export async function clearToken() {
  token = null;
  await deleteStorageItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  await initToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  const body =
    options.json !== undefined ? JSON.stringify(options.json) : options.body;
  const res = await fetch(`${API_HOST}${path}`, { ...options, headers, body });
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : await res.text();
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, json?: unknown) =>
    request<T>(p, { method: "POST", json }),
  patch: <T>(p: string, json?: unknown) =>
    request<T>(p, { method: "PATCH", json }),
  delete: <T>(p: string) => request<T>(p, { method: "DELETE" }),
  upload: async <T>(p: string, file: { uri: string; name: string } | null, fields?: Record<string, string>) => {
    await initToken();

    const form = new FormData();
    if (file) {
      form.append("file", { uri: file.uri, name: file.name, type: "text/csv" } as any);
    }
    if (fields) Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    const res = await fetch(`${API_HOST}${p}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  },
};

export function receiptUrl(paymentId: string): string {
  return `${API_HOST}/payments/${paymentId}/receipt`;
}

export const apiBaseUrl = API_HOST;

export function rupeesFromPaise(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  return `${sign}Rs. ${(Math.abs(paise) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
