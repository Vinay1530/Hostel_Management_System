import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

export type Role = "owner" | "manager" | "tenant";

export type Organization = { id: string; name: string; role: Role | null };

type AuthState = {
  ready: boolean;
  token: string | null;
  orgs: Organization[];
  orgId: string | null;
  role: Role | null;
  login: (phone: string, password: string) => Promise<Organization[]>;
  register: (
    data: { name: string; phone: string; email?: string; password: string; org_name: string }
  ) => Promise<Organization[]>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const session = await AsyncStorage.getItem("pgms_session");
        if (session) {
          const parsed = JSON.parse(session);
          const me = await api.get<Organization[]>("/auth/organizations");
          setOrgs(me);
          setToken(parsed.token);
          setOrgId(parsed.orgId ?? me[0]?.id ?? null);
          setRole(parsed.role ?? me[0]?.role ?? null);
        }
      } catch {
        await clearSession();
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function clearSession() {
    setToken(null);
    setOrgs([]);
    setOrgId(null);
    setRole(null);
    await AsyncStorage.removeItem("pgms_session");
    const { clearToken } = await import("./api");
    await clearToken();
  }

  async function persist(res: { token: string; organizations: Organization[] }) {
    const { saveToken } = await import("./api");
    await saveToken(res.token);
    setToken(res.token);
    setOrgs(res.organizations);
    const first = res.organizations[0] ?? null;
    setOrgId(first?.id ?? null);
    setRole(first?.role ?? null);
    await AsyncStorage.setItem(
      "pgms_session",
      JSON.stringify({ token: res.token, orgId: first?.id, role: first?.role })
    );
  }

  async function login(phone: string, password: string): Promise<Organization[]> {
    const res = await api.post<{ access_token: string; organizations: Organization[] }>(
      "/auth/login",
      { phone, password }
    );
    await persist({ token: res.access_token, organizations: res.organizations });
    return res.organizations;
  }

  async function register(
    data: { name: string; phone: string; email?: string; password: string; org_name: string }
  ): Promise<Organization[]> {
    const res = await api.post<{ access_token: string; organizations: Organization[] }>(
      "/auth/register",
      { email: null, ...data }
    );
    await persist({ token: res.access_token, organizations: res.organizations });
    return res.organizations;
  }

  return (
    <AuthContext.Provider
      value={{ ready, token, orgs, orgId, role, login, register, logout: clearSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
