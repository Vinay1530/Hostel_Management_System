import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

export type Pg = { id: string; name: string; address?: string | null };

type PgState = {
  ready: boolean;
  properties: Pg[];
  /** null = "All PGs" aggregate view */
  propertyId: string | null;
  property: Pg | null;
  setPropertyId: (id: string | null) => void;
  refreshProperties: () => Promise<Pg[]>;
};

const STORAGE_KEY = "pgms_selected_pg";
const ALL = "__all__";

const PgContext = createContext<PgState>(null as any);

export function PgProvider({ children }: { children: React.ReactNode }) {
  const { token, role, ready: authReady } = useAuth();
  const [ready, setReady] = useState(false);
  const [properties, setProperties] = useState<Pg[]>([]);
  const [propertyId, setPropertyIdState] = useState<string | null>(null);

  async function refreshProperties(): Promise<Pg[]> {
    const props = await api.get<Pg[]>("/properties");
    setProperties(props);
    return props;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authReady) return;
      if (!token || role === "tenant") {
        setReady(true);
        return;
      }
      try {
        const props = await api.get<Pg[]>("/properties");
        if (cancelled) return;
        setProperties(props);
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        let next: string | null;
        if (saved === ALL) next = null;
        else if (saved && props.some((p) => p.id === saved)) next = saved;
        else next = props[0]?.id ?? null; // default: first PG (not the aggregate)
        setPropertyIdState(next);
        if (next) await AsyncStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* backend not reachable yet — keep empty state */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, token, role]);

  function setPropertyId(id: string | null) {
    setPropertyIdState(id);
    AsyncStorage.setItem(STORAGE_KEY, id ?? ALL).catch(() => undefined);
  }

  const property = properties.find((p) => p.id === propertyId) ?? null;

  return (
    <PgContext.Provider value={{ ready, properties, propertyId, property, setPropertyId, refreshProperties }}>
      {children}
    </PgContext.Provider>
  );
}

export function usePg() {
  return useContext(PgContext);
}
