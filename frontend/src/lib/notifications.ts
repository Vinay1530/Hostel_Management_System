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
      await api.patch(`${path.endsWith("/staff/notifications") ? "/staff/notifications" : "/my/notifications"}/${id}/read`);
    } catch {
      return;
    }
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    );
  }

  return { items, unread, refresh, markRead };
}
