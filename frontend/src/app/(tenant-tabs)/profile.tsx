import { api, rupeesFromPaise } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { Sheet } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AppText,
  AppAvatar,
  AppBadge,
  AppButton,
  AppInput,
  Skeleton,
} from "@/components/ui-components";

type MyProfile = {
  full_name: string;
  phone: string;
  email?: string | null;
  avatar_url?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  id_number?: string | null;
  room_number: string | null;
  bed_label: string | null;
  property_name: string | null;
  rent_paise: number | null;
  deposit_paise: number | null;
  move_in_date: string | null;
  notice_start_date: string | null;
  notice_end_date: string | null;
  notice_period_days?: number | null;
};

type PhoneChangeRequest = {
  id: string;
  status: string;
  requested_phone: string | null;
  created_at: string;
};

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function prettyDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function TenantProfile() {
  const { logout, token, orgId } = useAuth();
  const router = useRouter();
  const accent = roleAccents.tenant;

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneRequests, setPhoneRequests] = useState<PhoneChangeRequest[]>([]);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [sendingPhone, setSendingPhone] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [profileRes, pgRes, phoneRes] = await Promise.allSettled([
        api.get<MyProfile>("/my/profile"),
        orgId
          ? import("@/lib/public").then((mod) => mod.fetchPublicPg(orgId))
          : Promise.resolve(null),
        api.get<PhoneChangeRequest[]>("/my/phone-change-requests"),
      ]);
      if (profileRes.status === "fulfilled") {
        setProfile(profileRes.value);
      } else {
        setError(
          (profileRes.reason as any)?.message ?? "Failed to load your profile."
        );
      }
      if (pgRes.status === "fulfilled" && pgRes.value) {
        setContactPhone(pgRes.value.contact_phone ?? null);
      }
      if (phoneRes.status === "fulfilled") {
        setPhoneRequests(phoneRes.value ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, orgId]);

  async function signOut() {
    Alert.alert("Sign out?", "You will need your phone number and password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            await logout();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  }

  async function submitPhoneChange() {
    setPhoneError("");
    const value = newPhone.replace(/\D/g, "");
    if (!/^\d{10,15}$/.test(value)) {
      setPhoneError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (value === profile?.phone) {
      setPhoneError("New number must be different from your current number.");
      return;
    }
    try {
      setSendingPhone(true);
      await api.post("/my/phone-change-requests", { new_phone: value });
      setPhoneOpen(false);
      setNewPhone("");
      await load();
      Alert.alert(
        "Request sent",
        "Your manager will review this request. Once approved, the new number becomes your login ID."
      );
    } catch (e: any) {
      setPhoneError(e?.message ?? "Could not send your request.");
    } finally {
      setSendingPhone(false);
    }
  }

  const displayName = profile?.full_name || "Tenant";
  const noticeActive = !!profile?.notice_start_date;
  const pendingPhone = phoneRequests.find((r) => r.status === "open");

  const quickActions = [
    {
      icon: "swap-horizontal-outline",
      label: "Change request",
      onPress: () => router.push("/change-request"),
    },
    {
      icon: "construct-outline",
      label: "Complaints",
      onPress: () => router.push("/complaints"),
    },
    {
      icon: "star-outline",
      label: "Feedback",
      onPress: () => router.push("/feedback"),
    },
  ];

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: accent.accent }]}>
        <View style={styles.heroGlowA} />
        <View style={styles.heroGlowB} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>MY ACCOUNT</Text>
            <AppText variant="h2" color="#fff">
              Profile
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={load}
            accessibilityLabel="Refresh profile"
          >
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.identityRow}>
          <View style={styles.avatarWrap}>
            <AppAvatar initials={initials(displayName) || "T"} size={62} variant="neutral" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="h3" color="#fff" numberOfLines={1}>
              {displayName}
            </AppText>
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={12} color="rgba(255,255,255,0.78)" />
              <Text style={styles.phoneText}>{profile?.phone ?? "—"}</Text>
            </View>
            {profile?.property_name ? (
              <View style={styles.pillRow}>
                <View style={styles.heroPill}>
                  <Ionicons name="business-outline" size={11} color="#fff" />
                  <Text style={styles.heroPillText} numberOfLines={1}>
                    {profile.property_name}
                  </Text>
                </View>
                {profile.room_number ? (
                  <View style={styles.heroPill}>
                    <Ionicons name="bed-outline" size={11} color="#fff" />
                    <Text style={styles.heroPillText}>
                      {profile.room_number} · {profile.bed_label}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={accent.accent} />
        }
      >
        {!profile && loading && (
          <View style={{ gap: 10 }}>
            <Skeleton height={170} radius={16} />
            <Skeleton height={120} radius={16} />
            <Skeleton height={80} radius={16} />
          </View>
        )}

        {!profile && !loading && error ? (
          <View style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: accent.accentSoft }]}>
              <Ionicons name="cloud-offline-outline" size={24} color={accent.accent} />
            </View>
            <AppText variant="h4" color={design.colors.textPrimary} style={{ textAlign: "center" }}>
              Couldn't load your profile
            </AppText>
            <AppText
              variant="bodySmall"
              color={design.colors.textSecondary}
              style={{ textAlign: "center", lineHeight: 19 }}
            >
              {error}
            </AppText>
            <AppButton
              variant="primary"
              size="md"
              icon="refresh"
              onPress={load}
              style={{ marginTop: 6, backgroundColor: accent.accent }}
            >
              Try again
            </AppButton>
          </View>
        ) : null}

        {profile && (
          <>
            {/* Quick actions */}
            <View style={styles.quickGrid}>
              {quickActions.map((action) => (
                <TouchableOpacity
                  key={action.label}
                  style={styles.quickCard}
                  onPress={action.onPress}
                  activeOpacity={0.85}
                >
                  <View style={[styles.quickIcon, { backgroundColor: accent.accentSoft }]}>
                    <Ionicons name={action.icon as any} size={19} color={accent.accent} />
                  </View>
                  <AppText variant="caption" color={design.colors.textSecondary} style={{ fontWeight: "700" }}>
                    {action.label}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            {/* My stay */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { backgroundColor: accent.accentSoft }]}>
                  <Ionicons name="home-outline" size={17} color={accent.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h4" color={design.colors.textPrimary}>
                    My stay
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary}>
                    Where you live and what you pay
                  </AppText>
                </View>
                {noticeActive ? <AppBadge variant="warning">Notice</AppBadge> : null}
              </View>

              <View style={styles.detailList}>
                <DetailRow icon="business-outline" label="PG" value={profile.property_name ?? "—"} />
                <DetailRow
                  icon="bed-outline"
                  label="Room & bed"
                  value={
                    profile.room_number
                      ? `Room ${profile.room_number} · Bed ${profile.bed_label ?? "—"}`
                      : "—"
                  }
                />
                <DetailRow
                  icon="cash-outline"
                  label="Agreed rent"
                  value={profile.rent_paise != null ? `${rupeesFromPaise(profile.rent_paise)} / month` : "—"}
                />
                <DetailRow
                  icon="shield-checkmark-outline"
                  label="Security deposit"
                  value={profile.deposit_paise != null ? rupeesFromPaise(profile.deposit_paise) : "—"}
                />
                <DetailRow
                  icon="calendar-outline"
                  label="Moved in"
                  value={prettyDate(profile.move_in_date)}
                />
                {noticeActive ? (
                  <DetailRow
                    icon="time-outline"
                    label="Notice period"
                    value={`${prettyDate(profile.notice_start_date)} → ${prettyDate(profile.notice_end_date)}`}
                    last
                  />
                ) : (
                  <DetailRow
                    icon="hourglass-outline"
                    label="Notice period"
                    value={`${profile.notice_period_days ?? 30} days`}
                    last
                  />
                )}
              </View>
            </View>

            {/* Contact */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { backgroundColor: accent.accentSoft }]}>
                  <Ionicons name="person-outline" size={17} color={accent.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h4" color={design.colors.textPrimary}>
                    Contact details
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary}>
                    Your account and emergency info
                  </AppText>
                </View>
              </View>

              <View style={styles.detailList}>
                <DetailRow icon="call-outline" label="Phone" value={profile.phone} />
                <DetailRow icon="mail-outline" label="Email" value={profile.email ?? "Not added"} />
                <DetailRow icon="card-outline" label="ID / KYC" value={profile.id_number ?? "Not added"} />
                <DetailRow
                  icon="medkit-outline"
                  label="Emergency contact"
                  value={
                    profile.emergency_contact_name
                      ? `${profile.emergency_contact_name}${
                          profile.emergency_contact_phone
                            ? ` · ${profile.emergency_contact_phone}`
                            : ""
                        }`
                      : "Not added"
                  }
                  last
                />
              </View>

              <TouchableOpacity
                style={[styles.phoneChangeRow, { borderColor: `${accent.accent}30` }]}
                onPress={() => {
                  setPhoneError("");
                  setNewPhone("");
                  setPhoneOpen(true);
                }}
                activeOpacity={0.85}
                disabled={!!pendingPhone}
              >
                <View style={[styles.phoneChangeIcon, { backgroundColor: accent.accentSoft }]}>
                  <Ionicons
                    name={pendingPhone ? "hourglass-outline" : "swap-horizontal-outline"}
                    size={16}
                    color={accent.accent}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText
                    variant="bodySmall"
                    color={design.colors.textPrimary}
                    style={{ fontWeight: "800" }}
                  >
                    {pendingPhone ? "Number change pending" : "Change mobile number"}
                  </AppText>
                  <AppText
                    variant="caption"
                    color={design.colors.textSecondary}
                    numberOfLines={2}
                  >
                    {pendingPhone
                      ? `Requested ${pendingPhone.requested_phone} — awaiting manager approval`
                      : "Send a request to your manager for approval"}
                  </AppText>
                </View>
                {!pendingPhone ? (
                  <Ionicons name="chevron-forward" size={16} color={accent.accent} />
                ) : null}
              </TouchableOpacity>
            </View>

            {/* Manager */}
            {contactPhone ? (
              <TouchableOpacity
                style={[styles.managerCard, { borderColor: `${accent.accent}30` }]}
                onPress={() => Linking.openURL(`tel:${contactPhone}`)}
                activeOpacity={0.9}
              >
                <View style={[styles.managerIcon, { backgroundColor: accent.accent }]}>
                  <Ionicons name="call" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "800" }}>
                    Call your manager
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary}>
                    {contactPhone} · reach out for anything
                  </AppText>
                </View>
                <Ionicons name="arrow-forward" size={17} color={accent.accent} />
              </TouchableOpacity>
            ) : null}

            <AppButton
              variant="ghost"
              fullWidth
              icon="log-out-outline"
              loading={signingOut}
              onPress={signOut}
              style={styles.signOut}
            >
              Sign out
            </AppButton>

            <AppText
              variant="caption"
              color={design.colors.textMuted}
              style={{ textAlign: "center", marginTop: 10 }}
            >
              Signed in as {profile.phone}
            </AppText>
          </>
        )}
      </ScrollView>

      <Sheet visible={phoneOpen} onClose={() => setPhoneOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={{ marginBottom: 6 }}>
          Change mobile number
        </AppText>
        <AppText
          variant="bodySmall"
          color={design.colors.textSecondary}
          style={{ marginBottom: 14, lineHeight: 19 }}
        >
          Your manager will review this request. Once approved, the new number
          becomes your login ID.
        </AppText>
        <AppInput
          label="New mobile number"
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          value={newPhone}
          onChangeText={(v) => setNewPhone(v.replace(/\D/g, ""))}
        />
        <View style={[styles.phoneInfo, { backgroundColor: accent.accentSoft }]}>
          <Ionicons name="information-circle-outline" size={15} color={accent.accent} />
          <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
            Current number:{" "}
            <Text style={{ fontWeight: "800", color: design.colors.textPrimary }}>
              {profile?.phone ?? "—"}
            </Text>
          </AppText>
        </View>
        {phoneError ? <Text style={styles.formError}>{phoneError}</Text> : null}
        <AppButton
          variant="primary"
          fullWidth
          loading={sendingPhone}
          onPress={submitPhoneChange}
          style={{ marginTop: 8, backgroundColor: accent.accent }}
        >
          Send Request
        </AppButton>
      </Sheet>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  last,
}: {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.detailLabelWrap}>
        <Ionicons name={icon as any} size={14} color={design.colors.textMuted} />
        <AppText variant="caption" color={design.colors.textSecondary}>
          {label}
        </AppText>
      </View>
      <AppText
        variant="bodySmall"
        color={design.colors.textPrimary}
        style={styles.detailValue}
        numberOfLines={2}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  hero: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  heroGlowA: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.09)",
    top: -70,
    right: -40,
  },
  heroGlowB: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.07)",
    bottom: -40,
    left: -16,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "rgba(255,255,255,0.72)",
    marginBottom: 3,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 13, marginTop: 16 },
  avatarWrap: {
    borderRadius: 21,
    padding: 3,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  phoneText: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "600" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  heroPillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 110, gap: 10 },

  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 20,
    alignItems: "center",
    gap: 8,
    ...getShadow("sm"),
  },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },

  quickGrid: { flexDirection: "row", gap: 8 },
  quickCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 6,
    ...getShadow("sm"),
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 14,
    ...getShadow("sm"),
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  detailList: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: design.colors.border,
  },
  detailLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailValue: { fontWeight: "700", maxWidth: "60%", textAlign: "right" },

  phoneChangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  phoneChangeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  formError: {
    color: design.colors.danger,
    marginTop: 6,
    marginBottom: 4,
    textAlign: "center",
    fontSize: 12,
  },

  managerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#fff",
    ...getShadow("sm"),
  },
  managerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  signOut: { marginTop: 2 },
});
