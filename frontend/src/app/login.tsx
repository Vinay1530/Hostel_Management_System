import { useAuth } from "@/lib/auth";
import { design } from "@/lib/design";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Mode = "login" | "register";

export default function Login() {
  const { login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // login
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // register (PG manager)
  const [rName, setRName] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rOrg, setROrg] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [rPassword, setRPassword] = useState("");

  const phoneOk = (p: string) => p.length >= 10;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const orgs = mode === "login" ? await login(phone, password) : await register({
        name: rName.trim(),
        phone: rPhone,
        email: rEmail.trim() || undefined,
        password: rPassword,
        org_name: rOrg.trim(),
      });
      const role = orgs[0]?.role;
      router.replace(role === "tenant" ? "/(tenant-tabs)/home" : "/(tabs)/dashboard");
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <View style={styles.logoRow}>
          <View style={styles.logo}>
            <Ionicons name="bed-outline" size={24} color="#fff" />
          </View>
          <View>
            <Text style={styles.title}>PG Manager</Text>
            <Text style={styles.subtitle}>Rent, beds & tenants — in one place</Text>
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Pressable style={[styles.toggle, mode === "login" && styles.toggleOn]} onPress={() => { setMode("login"); setError(null); }}>
            <Text style={[styles.toggleText, mode === "login" && styles.toggleTextOn]}>Sign in</Text>
          </Pressable>
          <Pressable style={[styles.toggle, mode === "register" && styles.toggleOn]} onPress={() => { setMode("register"); setError(null); }}>
            <Text style={[styles.toggleText, mode === "register" && styles.toggleTextOn]}>New PG Manager</Text>
          </Pressable>
        </View>

        {mode === "login" ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Mobile number"
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, ""))}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
            <Text style={styles.hint}>Tenants created by your PG Manager use the default password: "password"</Text>
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>PG Manager & Building details</Text>
            <TextInput style={styles.input} placeholder="Your full name" value={rName} onChangeText={setRName} />
            <TextInput style={styles.input} placeholder="Email (optional)" autoCapitalize="none" keyboardType="email-address" value={rEmail} onChangeText={setREmail} />
            <TextInput style={styles.input} placeholder="Mobile number" keyboardType="phone-pad" maxLength={10} value={rPhone} onChangeText={(v) => setRPhone(v.replace(/\D/g, ""))} />
            <TextInput style={styles.input} placeholder="PG / business name (e.g. Sunshine PGs)" value={rOrg} onChangeText={setROrg} />
            <TextInput style={styles.input} placeholder="Password (min 6 chars)" secureTextEntry value={rPassword} onChangeText={setRPassword} />
          </>
        )}

        <Pressable style={styles.button} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.buttonText}>
              {mode === "login" ? "Sign in" : "Create manager account"}
            </Text>
          )}
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}

        {mode === "login" && (
          <Pressable style={styles.guestLink} onPress={() => router.push("/guest")}>
            <Ionicons name="compass-outline" size={16} color={design.colors.primary} />
            <Text style={styles.guestText}>Looking for a bed? Browse PGs as a guest</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { backgroundColor: design.colors.surface, borderRadius: 20, padding: 24, width: "100%", maxWidth: 400, borderWidth: 1, borderColor: design.colors.border, gap: 4 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  logo: { backgroundColor: design.colors.primary, borderRadius: 14, width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "800", color: design.colors.textPrimary },
  subtitle: { color: design.colors.textSecondary, fontSize: 13, marginTop: 2 },
  toggleRow: { flexDirection: "row", backgroundColor: design.colors.surfaceVariant, borderRadius: 12, padding: 3, marginBottom: 14, marginTop: 8 },
  toggle: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 10 },
  toggleOn: { backgroundColor: design.colors.primary },
  toggleText: { fontWeight: "700", color: design.colors.textMuted, fontSize: 13 },
  toggleTextOn: { color: "#fff" },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: design.colors.textMuted, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: design.colors.border, backgroundColor: "#fff", borderRadius: 12, padding: 12, fontSize: 16, marginBottom: 10, color: design.colors.textPrimary },
  button: { backgroundColor: design.colors.primary, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  hint: { fontSize: 11, color: design.colors.warning, marginBottom: 4 },
  guestLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: design.colors.surfaceVariant,
  },
  guestText: { fontSize: 13, fontWeight: "700", color: design.colors.primary },
  error: { color: design.colors.danger, marginTop: 10, textAlign: "center" },
});
