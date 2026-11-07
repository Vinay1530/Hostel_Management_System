import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import type { Notification } from "./public";

export function useNotifications() {
  const { token, role } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const path = role === "tenant" ? "/my/notifications" : "/staff/notifications";

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setItems(await api.get<Notification[]>(path));
    } catch {
      setItems([]);
    }
  }, [path, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unread = items.filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    if (!token) return;
    try {
      const key = path.endsWith("/staff/notifications") ? "/staff/notifications" : "/my/notifications";
      await api.patch(`${key}/${id}/read`);
    } catch {
      return;
    }
    // After marking as read, remove it from display — it should be deleted from the section
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  return { items, unread, refresh, markRead };
}
