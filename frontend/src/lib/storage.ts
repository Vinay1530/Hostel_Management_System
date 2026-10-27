import { Platform } from "react-native";

/**
 * Token storage: SecureStore is native-only and throws on web
 * ( ExpoSecureStore.default.getValueWithKeyAsync is not a function ),
 * so web falls back to localStorage.
 */
export function getItem(key: string): string | null {
  if (Platform.OS === "web") {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return null; // native path goes through SecureStore below
}

export async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") return getItem(key);
  const SecureStore = await import("expo-secure-store");
  return (await SecureStore.getItemAsync(key)) ?? null;
}

export async function setStorageItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.setItem(key, value);
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(key, value);
}

export async function deleteStorageItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.removeItem(key);
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.deleteItemAsync(key);
}
