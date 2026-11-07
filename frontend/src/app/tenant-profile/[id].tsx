import { api, rupeesFromPaise } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { design, getShadow } from "@/lib/design";
import { AppAvatar, AppBadge, AppText, EmptyState, Skeleton } from "@/components/ui-components";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Stay = {
  id: string;
  bed_id: string;
  start_date: string | null;
  end_date: string | null;
  notice_start_date: string | null;
  notice_end_date: string | null;
  agreed_rent_paise: number;
  deposit_paise: number;
  active: boolean;
};

type Tenant = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  id_number: string | null;
  notes: string | null;
};

type Invoice = {
  id: string;
  stay_id: string;
  period_month: string;
  amount_paise: number;
  paid_paise: number;
  balance_paise: number;
  due_date: string;
  status: string;
};

type GridBed = { id: string; label: string; status: string };
type GridRoom = { id: string; number: string; beds: GridBed[] };
type GridFloor = { id: string; name: string; rooms: GridRoom[] };
type GridProperty = { id: string; name: string; floors: GridFloor[] };

type Location = {
  property_id: string;
  property_name: string;
  floor_name: string;
  room_number: string;
  bed_label: string;
};

type Contact = {
  user_id: string;
  name: string;
  role: string;
  phone: string | null;
  room_number: string | null;
  property_id: string;
  property_name: string;
};

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
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

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

function invoiceMeta(status: string): {
  variant: "success" | "warning" | "info" | "danger" | "neutral";
  label: string;
} {
  if (status === "paid") return { variant: "success", label: "Paid" };
  if (status === "partial") return { variant: "warning", label: "Partial" };
  if (status === "pending") return { variant: "info", label: "Pending" };
  if (status === "overdue") return { variant: "danger", label: "Overdue" };
  return { variant: "neutral", label: status };
}

export default function TenantProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { role } = useAuth();

  const [profile, setProfile] = useState<Tenant | null>(null);
  const [stays, setStays] = useState<Stay[]>([]);
  const [dues, setDues] = useState<Invoice[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (!id) return;
      setError(null);
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const [tenant, grid] = await Promise.all([
          api.get<Tenant & { stays?: Stay[] }>(`/tenants/${id}`),
          api
            .get<{ properties: GridProperty[] }>("/occupancy-grid")
            .catch(() => ({ properties: [] as GridProperty[] })),
        ]);

        const tenantStays = tenant.stays ?? [];
        setProfile(tenant);
        setStays(tenantStays);

        const activeStay = tenantStays.find((stay) => stay.active) ?? null;
        let resolved: Location | null = null;
        if (activeStay) {
          for (const property of grid.properties ?? []) {
            for (const floor of property.floors ?? []) {
              for (const room of floor.rooms ?? []) {
                const bed = (room.beds ?? []).find((b) => b.id === activeStay.bed_id);
                if (bed) {
                  resolved = {
                    property_id: property.id,
                    property_name: property.name,
                    floor_name: floor.name,
                    room_number: room.number,
                    bed_label: bed.label,
                  };
                }
              }
            }
          }
        }
        setLocation(resolved);

        const invoiceLists = await Promise.all(
          tenantStays.map((stay) =>
            api
              .get<Invoice[]>(`/invoices?stay_id=${stay.id}`)
              .catch(() => [] as Invoice[])
          )
        );
        const merged = invoiceLists
          .flat()
          .sort((a, b) => b.period_month.localeCompare(a.period_month));
        setDues(merged);
      } catch (e: any) {
        setError(e?.detail ?? e?.message ?? "Could not load this tenant");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function messageTenant() {
    if (!profile) return;
    setMessaging(true);
    try {
      const data = await api.get<{ contacts: Contact[] }>("/conversations");
      const candidates = (data.contacts ?? []).filter(
        (contact) => contact.phone && contact.phone === profile.phone
      );
      const contact =
        candidates.find((c) => c.property_id === location?.property_id) ?? candidates[0];
      if (!contact) {
        Alert.alert("Chat unavailable", "No chat user found for this tenant's phone number.");
        return;
      }
      await api.post("/conversations/direct", {
        other_user_id: contact.user_id,
        property_id: contact.property_id,
      });
      router.push({
        pathname: "/chat",
        params: { tenantUserId: contact.user_id, propertyId: contact.property_id },
      });
    } catch {
      Alert.alert("Error", "Could not start the chat. Please try again.");
    } finally {
      setMessaging(false);
    }
  }

  const activeStay = useMemo(
    () => stays.find((stay) => stay.active) ?? null,
    [stays]
  );

  const totals = useMemo(() => {
    const outstanding = dues.reduce((sum, invoice) => sum + invoice.balance_paise, 0);
    const paid = dues.reduce((sum, invoice) => sum + invoice.paid_paise, 0);
    const billed = dues.reduce((sum, invoice) => sum + invoice.amount_paise, 0);
    return { outstanding, paid, billed, invoices: dues.length };
  }, [dues]);

  const noticeActive = !!activeStay?.notice_start_date;

  if (loading && !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton height={12} width={110} radius={4} />
              <Skeleton height={24} width={180} radius={6} />
            </View>
          </View>
          <View style={{ marginTop: 18 }}>
            <Skeleton height={62} radius={16} />
          </View>
        </View>
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton height={120} radius={16} />
          <Skeleton height={160} radius={16} />
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <AppText variant="h2" color="#fff">
              Tenant
            </AppText>
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <EmptyState
            icon="person-outline"
            title="Tenant not found"
            subtitle={error ?? "This tenant may have been removed."}
            actionLabel="Retry"
            onAction={() => load()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlowA} />
        <View style={styles.heroGlowB} />
        <View style={styles.heroTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>TENANT PROFILE</Text>
            <AppText variant="h2" color="#fff">
              Tenant
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => Linking.openURL(`tel:${profile.phone}`)}
            accessibilityLabel="Call tenant"
          >
            <Ionicons name="call-outline" size={19} color="#fff" />
          </TouchableOpacity>
          {(role === "owner" || role === "manager") && (
            <TouchableOpacity
              style={[styles.headerAction, { backgroundColor: "rgba(255,255,255,0.26)" }]}
              onPress={messageTenant}
              disabled={messaging}
              accessibilityLabel="Message tenant"
            >
              {messaging ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="chatbubble-outline" size={19} color="#fff" />
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.identityRow}>
          <View style={styles.avatarWrap}>
            <AppAvatar initials={initials(profile.full_name) || "T"} size={60} variant="neutral" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="h3" color="#fff" numberOfLines={1}>
              {profile.full_name}
            </AppText>
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={12} color="rgba(255,255,255,0.78)" />
              <Text style={styles.phoneText}>{profile.phone}</Text>
            </View>
            <View style={styles.pillRow}>
              <View style={styles.heroPill}>
                <Ionicons
                  name={activeStay ? "checkmark-circle" : "alert-circle"}
                  size={11}
                  color="#fff"
                />
                <Text style={styles.heroPillText}>{activeStay ? "Active tenant" : "No active stay"}</Text>
              </View>
              {noticeActive && (
                <View style={[styles.heroPill, { backgroundColor: "rgba(255,255,255,0.28)" }]}>
                  <Ionicons name="time" size={11} color="#fff" />
                  <Text style={styles.heroPillText}>On notice</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
              {activeStay ? rupeesFromPaise(activeStay.agreed_rent_paise) : "—"}
            </Text>
            <Text style={styles.heroStatLabel}>RENT / MO</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
              {rupeesFromPaise(totals.outstanding)}
            </Text>
            <Text style={styles.heroStatLabel}>OUTSTANDING</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{totals.invoices}</Text>
            <Text style={styles.heroStatLabel}>INVOICES</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={design.colors.primary}
          />
        }
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {/* Quick actions */}
        <View style={styles.quickGrid}>
          <QuickAction
            icon="chatbubble-outline"
            label="Message"
            onPress={messageTenant}
            disabled={messaging}
          />
          <QuickAction
            icon="call-outline"
            label="Call"
            onPress={() => Linking.openURL(`tel:${profile.phone}`)}
          />
          <QuickAction
            icon="cash-outline"
            label="Dues"
            onPress={() => router.push("/dues")}
          />
        </View>

        {/* Active stay */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardIcon}>
              <Ionicons name="home-outline" size={17} color={design.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h4" color={design.colors.textPrimary}>
                Active stay
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                {activeStay ? "Where this tenant lives" : "No bed is currently assigned"}
              </AppText>
            </View>
            <AppBadge variant={activeStay ? "success" : "neutral"}>
              {activeStay ? "Active" : "Inactive"}
            </AppBadge>
          </View>

          {activeStay ? (
            <View style={styles.detailList}>
              <InfoRow
                icon="business-outline"
                label="PG"
                value={location?.property_name ?? "—"}
              />
              <InfoRow
                icon="bed-outline"
                label="Room & bed"
                value={
                  location
                    ? `Room ${location.room_number} · Bed ${location.bed_label}${location.floor_name ? ` · ${location.floor_name} floor` : ""}`
                    : "—"
                }
              />
              <InfoRow
                icon="cash-outline"
                label="Agreed rent"
                value={`${rupeesFromPaise(activeStay.agreed_rent_paise)} / month`}
              />
              <InfoRow
                icon="shield-checkmark-outline"
                label="Security deposit"
                value={rupeesFromPaise(activeStay.deposit_paise)}
              />
              <InfoRow
                icon="calendar-outline"
                label="Moved in"
                value={prettyDate(activeStay.start_date)}
              />
              {noticeActive ? (
                <InfoRow
                  icon="time-outline"
                  label="Notice period"
                  value={`${prettyDate(activeStay.notice_start_date)} → ${prettyDate(activeStay.notice_end_date)}`}
                  last
                />
              ) : (
                <InfoRow
                  icon="log-out-outline"
                  label="Stay status"
                  value="Active · no notice given"
                  last
                />
              )}
            </View>
          ) : (
            <View style={styles.inlineEmpty}>
              <Ionicons name="bed-outline" size={16} color={design.colors.textMuted} />
              <AppText variant="bodySmall" color={design.colors.textSecondary} style={{ flex: 1 }}>
                Assign a bed from the occupancy map to start this tenant's stay.
              </AppText>
              <TouchableOpacity onPress={() => router.push("/occupancy-map")} hitSlop={8}>
                <Ionicons name="arrow-forward" size={16} color={design.colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Personal info */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardIcon}>
              <Ionicons name="person-outline" size={17} color={design.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h4" color={design.colors.textPrimary}>
                Personal info
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                Contact and KYC details
              </AppText>
            </View>
          </View>

          <View style={styles.detailList}>
            <InfoRow icon="call-outline" label="Phone" value={profile.phone} />
            <InfoRow icon="mail-outline" label="Email" value={profile.email ?? "Not added"} />
            {role === "manager" || role === "owner" ? (
              <>
                <InfoRow
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
                />
                <InfoRow
                  icon="card-outline"
                  label="ID / KYC"
                  value={profile.id_number ?? "Not added"}
                  last={!profile.notes}
                />
              </>
            ) : null}
            {profile.notes ? (
              <InfoRow icon="document-text-outline" label="Notes" value={profile.notes} last />
            ) : null}
          </View>
        </View>

        {/* Payment history */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardIcon}>
              <Ionicons name="receipt-outline" size={17} color={design.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h4" color={design.colors.textPrimary}>
                Payment history
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                {totals.invoices > 0
                  ? `${rupeesFromPaise(totals.paid)} paid of ${rupeesFromPaise(totals.billed)} billed`
                  : "No bills generated yet"}
              </AppText>
            </View>
          </View>

          {dues.length === 0 ? (
            <View style={styles.inlineEmpty}>
              <Ionicons name="receipt-outline" size={16} color={design.colors.textMuted} />
              <AppText variant="bodySmall" color={design.colors.textSecondary} style={{ flex: 1 }}>
                Generate rent invoices from the Dues screen to see the ledger here.
              </AppText>
            </View>
          ) : (
            <View style={styles.invoiceList}>
              {dues.map((invoice, index) => {
                const meta = invoiceMeta(invoice.status);
                return (
                  <View
                    key={invoice.id}
                    style={[styles.invoiceRow, index > 0 && styles.invoiceDivider]}
                  >
                    <View style={styles.invoiceMonthIcon}>
                      <Ionicons name="calendar-outline" size={15} color={design.colors.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText
                        variant="bodySmall"
                        color={design.colors.textPrimary}
                        style={{ fontWeight: "800" }}
                      >
                        {monthLabel(invoice.period_month)}
                      </AppText>
                      <AppText variant="caption" color={design.colors.textMuted} numberOfLines={1}>
                        Due {prettyDate(invoice.due_date)} · {rupeesFromPaise(invoice.paid_paise)} paid
                      </AppText>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 3 }}>
                      <AppText
                        variant="bodySmall"
                        color={design.colors.textPrimary}
                        style={{ fontWeight: "800" }}
                      >
                        {rupeesFromPaise(invoice.amount_paise)}
                      </AppText>
                      <AppBadge variant={meta.variant}>{meta.label}</AppBadge>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Documents */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardIcon}>
              <Ionicons name="folder-outline" size={17} color={design.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h4" color={design.colors.textPrimary}>
                Documents
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                ID proofs and agreements
              </AppText>
            </View>
            <AppBadge variant="neutral">Coming soon</AppBadge>
          </View>
          <View style={styles.inlineEmpty}>
            <Ionicons name="cloud-upload-outline" size={16} color={design.colors.textMuted} />
            <AppText variant="bodySmall" color={design.colors.textSecondary} style={{ flex: 1 }}>
              No documents uploaded yet. Store KYC documents with the tenant record in a future
              update.
            </AppText>
          </View>
        </View>

        <AppText variant="caption" color={design.colors.textMuted} style={styles.footer}>
          Joined {prettyDate(stays[stays.length - 1]?.start_date ?? null)}
        </AppText>
      </ScrollView>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.quickCard, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <View style={styles.quickIcon}>
        <Ionicons name={icon as any} size={18} color={design.colors.primary} />
      </View>
      <AppText variant="caption" color={design.colors.textSecondary} style={{ fontWeight: "700" }}>
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

function InfoRow({
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
        numberOfLines={3}
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
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
    backgroundColor: design.colors.primary,
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
  heroTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "rgba(255,255,255,0.72)",
    marginBottom: 3,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  identityRow: { flexDirection: "row", alignItems: "center", gap: 13, marginTop: 15 },
  avatarWrap: {
    borderRadius: 21,
    padding: 3,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  phoneText: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "600" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  heroPillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },

  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatValue: { color: "#fff", fontSize: 16, fontWeight: "800" },
  heroStatLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 1,
  },
  heroStatDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.18)" },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 70, gap: 10 },
  error: { color: design.colors.danger, fontSize: 12, textAlign: "center" },

  quickGrid: { flexDirection: "row", gap: 8 },
  quickCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    paddingVertical: 12,
    alignItems: "center",
    gap: 6,
    ...getShadow("sm"),
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: design.colors.primaryLight,
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
    backgroundColor: design.colors.primaryLight,
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: design.colors.border,
  },
  detailLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 1 },
  detailValue: { fontWeight: "700", maxWidth: "60%", textAlign: "right" },

  inlineEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    padding: 11,
    borderRadius: 11,
    backgroundColor: design.colors.background,
    borderWidth: 1,
    borderColor: design.colors.border,
  },

  invoiceList: { marginTop: 10, borderTopWidth: 1, borderTopColor: design.colors.border },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 10,
  },
  invoiceDivider: { borderTopWidth: 1, borderTopColor: design.colors.border },
  invoiceMonthIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  footer: { textAlign: "center", marginTop: 4 },
});
