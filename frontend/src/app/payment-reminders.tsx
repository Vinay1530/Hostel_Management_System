import { api, rupeesFromPaise } from "@/lib/api";
import { usePg } from "@/lib/pg";
import { design, getShadow } from "@/lib/design";
import { Sheet } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Switch,
} from "react-native";
import {
  AppButton,
  AppText,
  AppBadge,
  EmptyState,
  AppInput,
  Skeleton,
} from "@/components/ui-components";

type Reminder = {
  id: string;
  invoice_id: string;
  reminder_type: string;
  reminder_date: string;
  sent_at: string | null;
  channel: string;
  status: string;
  created_at: string;
};

type DueRow = {
  invoice_id: string;
  tenant_id: string;
  tenant_name: string;
  property_name: string;
  room_number: string;
  bed_label: string;
  period_month: string;
  amount_paise: number;
  paid_paise: number;
  balance_paise: number;
  due_date: string;
  status: string;
};

const REMINDER_TYPES = [
  { value: "initial", label: "First reminder", icon: "notifications-outline" },
  { value: "follow_up", label: "Follow-up", icon: "repeat-outline" },
  { value: "final", label: "Final notice", icon: "alert-circle-outline" },
];

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp" },
  { value: "sms", label: "SMS", icon: "chatbox-outline" },
  { value: "email", label: "Email", icon: "mail-outline" },
];

const STATUS_META: Record<
  string,
  { label: string; variant: "success" | "warning" | "danger" | "neutral" }
> = {
  sent: { label: "Sent", variant: "success" },
  pending: { label: "Scheduled", variant: "warning" },
  failed: { label: "Failed", variant: "danger" },
};

function typeLabel(value: string): string {
  return REMINDER_TYPES.find((t) => t.value === value)?.label ?? value;
}

function channelMeta(value: string) {
  return CHANNELS.find((c) => c.value === value) ?? CHANNELS[0];
}

function prettyDateTime(value: string | null): string {
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

function localDateInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function toIsoDateTime(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date().toISOString();
  const parsed = new Date(`${value}T09:00:00`);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export default function PaymentReminders() {
  const { propertyId } = usePg();

  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [dues, setDues] = useState<DueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<"all" | "pending" | "sent">("all");
  const [automation, setAutomation] = useState(true);

  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const [reminderType, setReminderType] = useState("initial");
  const [reminderDate, setReminderDate] = useState(localDateInput());
  const [channel, setChannel] = useState("whatsapp");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const [remRes, duesRes] = await Promise.allSettled([
        api.get<Reminder[]>("/payment-reminders"),
        api.get<{ rows: DueRow[] }>(`/dues${propertyId ? `?property_id=${propertyId}` : ""}`),
      ]);
      if (remRes.status === "fulfilled") setReminders(remRes.value);
      else setError((remRes.reason as any)?.message ?? "Failed to load reminders");
      if (duesRes.status === "fulfilled") setDues(duesRes.value.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const dueMap = useMemo(() => {
    const map: Record<string, DueRow> = {};
    for (const row of dues) map[row.invoice_id] = row;
    return map;
  }, [dues]);

  const openInvoices = useMemo(
    () =>
      dues
        .filter((r) => r.balance_paise > 0 && r.status !== "paid" && r.status !== "void")
        .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))),
    [dues]
  );

  const filtered = useMemo(() => {
    const list = reminders ?? [];
    if (filter === "all") return list;
    return list.filter((r) => r.status === filter);
  }, [reminders, filter]);

  const pendingCount = (reminders ?? []).filter((r) => r.status === "pending").length;
  const sentCount = (reminders ?? []).filter((r) => r.status === "sent").length;
  const selectedInvoice = openInvoices.find((r) => r.invoice_id === invoiceId) ?? null;

  function openAdd() {
    const first = openInvoices[0] ?? null;
    setInvoiceId(first?.invoice_id ?? null);
    setReminderType("initial");
    setReminderDate(localDateInput());
    setChannel("whatsapp");
    setFormError(null);
    setOpen(true);
  }

  async function saveReminder() {
    setFormError(null);
    if (!selectedInvoice) {
      setFormError("Pick an invoice to remind about.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/payment-reminders", {
        invoice_id: selectedInvoice.invoice_id,
        reminder_type: reminderType,
        reminder_date: toIsoDateTime(reminderDate),
        channel,
      });
      setOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e?.detail ?? e?.message ?? "Failed to create reminder");
    } finally {
      setSaving(false);
    }
  }

  async function markSent(id: string) {
    setBusyId(id);
    try {
      await api.patch(`/payment-reminders/${id}/sent`, {});
      await load();
    } catch (e: any) {
      Alert.alert("Failed", e?.detail ?? e?.message ?? "Could not mark as sent");
    } finally {
      setBusyId(null);
    }
  }

  async function generateDue() {
    setGenerating(true);
    try {
      const created: any = await api.post(
        `/payment-reminders/generate-due${propertyId ? `?property_id=${propertyId}` : ""}`,
        {}
      );
      const count = Array.isArray(created) ? created.length : 0;
      await load();
      Alert.alert(
        "Reminders generated",
        count > 0
          ? `${count} reminder${count === 1 ? "" : "s"} queued for unpaid invoices.`
          : "No new reminders were needed — every unpaid invoice already has one queued."
      );
    } catch (e: any) {
      Alert.alert("Failed", e?.detail ?? e?.message ?? "Could not generate reminders");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>COLLECTIONS AUTOMATION</Text>
            <AppText variant="h2" color="#fff">
              Payment Reminders
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.72)">
              Nudge tenants before dues turn overdue
            </AppText>
          </View>
          <TouchableOpacity style={styles.headerAction} onPress={openAdd} accessibilityLabel="Add reminder">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{pendingCount}</Text>
            <Text style={styles.heroStatLabel}>SCHEDULED</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{sentCount}</Text>
            <Text style={styles.heroStatLabel}>SENT</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{openInvoices.length}</Text>
            <Text style={styles.heroStatLabel}>OPEN BILLS</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.createCta}
          onPress={generateDue}
          disabled={generating}
          activeOpacity={0.9}
        >
          <Ionicons name="sparkles-outline" size={17} color={design.colors.primary} />
          <Text style={styles.createCtaText}>
            {generating ? "Generating…" : "Generate for all due invoices"}
          </Text>
          <Ionicons name="arrow-forward" size={14} color={design.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={design.colors.primary} />
        }
      >
        {loading && !reminders && (
          <View style={{ gap: 10 }}>
            <Skeleton height={96} radius={16} />
            <Skeleton height={80} radius={16} />
            <Skeleton height={80} radius={16} />
          </View>
        )}

        {/* Automation card */}
        <View style={styles.automationCard}>
          <View style={styles.automationIcon}>
            <Ionicons name="flash" size={18} color={design.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "800" }}>
              Smart reminders
            </AppText>
            <AppText variant="caption" color={design.colors.textSecondary} style={{ lineHeight: 17 }}>
              Queue a WhatsApp nudge 3 days before the due date and a final notice after it passes.
            </AppText>
          </View>
          <Switch
            value={automation}
            onValueChange={setAutomation}
            trackColor={{ false: design.colors.border, true: design.colors.primary }}
            thumbColor="#fff"
          />
        </View>

        {automation && (
          <View style={styles.timelineCard}>
            <TimelineDot icon="send-outline" title="Before due date" subtitle="Friendly first reminder" />
            <View style={styles.timelineLine} />
            <TimelineDot icon="repeat-outline" title="Due date" subtitle="Follow-up with payment link" />
            <View style={styles.timelineLine} />
            <TimelineDot
              icon="alert-circle-outline"
              title="After 3 days"
              subtitle="Final notice to tenant and manager"
              last
            />
          </View>
        )}

        {/* Filters */}
        <View style={styles.sectionRow}>
          <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
            REMINDER QUEUE
          </AppText>
          <AppText variant="caption" color={design.colors.textMuted}>
            {filtered.length} reminder{filtered.length === 1 ? "" : "s"}
          </AppText>
        </View>

        <View style={styles.filterChips}>
          {(
            [
              ["all", "All"],
              ["pending", "Scheduled"],
              ["sent", "Sent"],
            ] as ["all" | "pending" | "sent", string][]
          ).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              style={[styles.chip, filter === value && styles.chipActive]}
              onPress={() => setFilter(value)}
              activeOpacity={0.85}
            >
              <AppText
                variant="caption"
                color={filter === value ? "#fff" : design.colors.textSecondary}
                style={{ fontWeight: "700" }}
              >
                {label}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        {reminders && filtered.length === 0 && (
          <EmptyState
            icon="notifications-outline"
            title={reminders.length === 0 ? "No reminders yet" : "Nothing in this view"}
            subtitle={
              reminders.length === 0
                ? "Generate reminders for unpaid invoices, or add one for a specific tenant."
                : "Switch filters to see other reminders."
            }
            actionLabel={reminders.length === 0 ? "Add Reminder" : undefined}
            onAction={reminders.length === 0 ? openAdd : undefined}
          />
        )}

        <View style={{ gap: 9 }}>
          {filtered.map((reminder) => {
            const row = dueMap[reminder.invoice_id];
            const meta = STATUS_META[reminder.status] ?? {
              label: reminder.status,
              variant: "neutral" as const,
            };
            const ch = channelMeta(reminder.channel);
            return (
              <View key={reminder.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.channelIcon}>
                    <Ionicons name={ch.icon as any} size={17} color={design.colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <AppText
                        variant="body"
                        color={design.colors.textPrimary}
                        style={{ fontWeight: "800" }}
                        numberOfLines={1}
                      >
                        {row?.tenant_name ?? "Tenant"}
                      </AppText>
                      <AppBadge variant={meta.variant}>{meta.label}</AppBadge>
                    </View>
                    <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                      {row
                        ? `Room ${row.room_number} · ${row.period_month ? monthLabel(row.period_month) : "rent"}`
                        : `Invoice ${reminder.invoice_id.slice(0, 8).toUpperCase()}`}
                      {row ? ` · ${rupeesFromPaise(row.balance_paise)} due` : ""}
                    </AppText>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.typePill}>
                    <Ionicons name="notifications-outline" size={11} color={design.colors.textSecondary} />
                    <AppText variant="caption" color={design.colors.textSecondary} style={{ fontWeight: "700" }}>
                      {typeLabel(reminder.reminder_type)}
                    </AppText>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={12} color={design.colors.textMuted} />
                    <AppText variant="caption" color={design.colors.textMuted}>
                      {prettyDateTime(reminder.sent_at ?? reminder.reminder_date)}
                    </AppText>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name={ch.icon as any} size={12} color={design.colors.textMuted} />
                    <AppText variant="caption" color={design.colors.textMuted}>
                      {ch.label}
                    </AppText>
                  </View>
                </View>

                {reminder.status === "pending" && (
                  <TouchableOpacity
                    style={styles.markSentBtn}
                    onPress={() => markSent(reminder.id)}
                    disabled={busyId === reminder.id}
                  >
                    <Ionicons
                      name={busyId === reminder.id ? "hourglass-outline" : "checkmark-circle-outline"}
                      size={15}
                      color={design.colors.success}
                    />
                    <AppText variant="caption" color={design.colors.success} style={{ fontWeight: "800" }}>
                      {busyId === reminder.id ? "Updating…" : "Mark as sent"}
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {/* Add reminder */}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary}>
          Schedule Reminder
        </AppText>
        <AppText variant="caption" color={design.colors.textSecondary} style={styles.sheetHint}>
          Pick an unpaid invoice. The reminder is queued instantly and can be marked sent once delivered.
        </AppText>

        <AppText variant="label" color={design.colors.textSecondary} style={styles.fieldLabel}>
          INVOICE
        </AppText>
        <TouchableOpacity style={styles.selectBtn} onPress={() => setInvoicePickerOpen(true)}>
          <View style={{ flex: 1 }}>
            {selectedInvoice ? (
              <>
                <AppText
                  variant="body"
                  color={design.colors.textPrimary}
                  style={{ fontWeight: "700" }}
                  numberOfLines={1}
                >
                  {selectedInvoice.tenant_name} · Room {selectedInvoice.room_number}
                </AppText>
                <AppText variant="caption" color={design.colors.textSecondary}>
                  {monthLabel(selectedInvoice.period_month)} ·{" "}
                  {rupeesFromPaise(selectedInvoice.balance_paise)} due
                </AppText>
              </>
            ) : (
              <AppText variant="body" color={design.colors.textMuted}>
                {openInvoices.length ? "Select an unpaid invoice" : "No unpaid invoices"}
              </AppText>
            )}
          </View>
          <Ionicons name="chevron-down" size={16} color={design.colors.textMuted} />
        </TouchableOpacity>

        <AppText variant="label" color={design.colors.textSecondary} style={styles.fieldLabel}>
          REMINDER TYPE
        </AppText>
        <View style={styles.optionRow}>
          {REMINDER_TYPES.map((type) => {
            const active = reminderType === type.value;
            return (
              <TouchableOpacity
                key={type.value}
                style={[styles.optionChip, active && styles.optionChipActive]}
                onPress={() => setReminderType(type.value)}
              >
                <Ionicons
                  name={type.icon as any}
                  size={13}
                  color={active ? design.colors.primary : design.colors.textMuted}
                />
                <AppText
                  variant="caption"
                  color={active ? design.colors.primary : design.colors.textSecondary}
                  style={{ fontWeight: "700" }}
                >
                  {type.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        <AppText variant="label" color={design.colors.textSecondary} style={styles.fieldLabel}>
          CHANNEL
        </AppText>
        <View style={styles.optionRow}>
          {CHANNELS.map((ch) => {
            const active = channel === ch.value;
            return (
              <TouchableOpacity
                key={ch.value}
                style={[styles.optionChip, active && styles.optionChipActive]}
                onPress={() => setChannel(ch.value)}
              >
                <Ionicons
                  name={ch.icon as any}
                  size={13}
                  color={active ? design.colors.primary : design.colors.textMuted}
                />
                <AppText
                  variant="caption"
                  color={active ? design.colors.primary : design.colors.textSecondary}
                  style={{ fontWeight: "700" }}
                >
                  {ch.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        <AppInput
          label="Send on (YYYY-MM-DD)"
          placeholder={localDateInput()}
          value={reminderDate}
          onChangeText={setReminderDate}
        />

        {formError && <Text style={styles.formError}>{formError}</Text>}
        <AppButton
          variant="primary"
          fullWidth
          loading={saving}
          disabled={!selectedInvoice}
          onPress={saveReminder}
          style={{ marginTop: 8 }}
        >
          Queue Reminder
        </AppButton>
      </Sheet>

      {/* Invoice picker */}
      <Sheet visible={invoicePickerOpen} onClose={() => setInvoicePickerOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={{ marginBottom: 10 }}>
          Unpaid invoices
        </AppText>
        <ScrollView style={{ maxHeight: 430 }}>
          {openInvoices.map((row) => {
            const active = row.invoice_id === invoiceId;
            return (
              <TouchableOpacity
                key={row.invoice_id}
                style={[styles.invoiceOption, active && styles.invoiceOptionActive]}
                onPress={() => {
                  setInvoiceId(row.invoice_id);
                  setInvoicePickerOpen(false);
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText
                    variant="body"
                    color={design.colors.textPrimary}
                    style={{ fontWeight: "700" }}
                    numberOfLines={1}
                  >
                    {row.tenant_name} · Room {row.room_number}
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                    {monthLabel(row.period_month)} · due {prettyDateTime(row.due_date)}
                  </AppText>
                </View>
                <View style={{ alignItems: "flex-end", gap: 3 }}>
                  <AppText variant="bodySmall" color={design.colors.danger} style={{ fontWeight: "800" }}>
                    {rupeesFromPaise(row.balance_paise)}
                  </AppText>
                  {active && <Ionicons name="checkmark-circle" size={18} color={design.colors.primary} />}
                </View>
              </TouchableOpacity>
            );
          })}
          {openInvoices.length === 0 && (
            <AppText variant="bodySmall" color={design.colors.textMuted} style={{ paddingVertical: 14 }}>
              Every invoice is settled — nothing to remind.
            </AppText>
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
}

function TimelineDot({
  icon,
  title,
  subtitle,
  last,
}: {
  icon: string;
  title: string;
  subtitle: string;
  last?: boolean;
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineIcon}>
        <Ionicons name={icon as any} size={14} color={design.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodySmall" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
          {title}
        </AppText>
        <AppText variant="caption" color={design.colors.textSecondary}>
          {subtitle}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  hero: {
    backgroundColor: design.colors.primary,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  heroGlow: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -70,
    right: -30,
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
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatValue: { color: "#fff", fontSize: 18, fontWeight: "800" },
  heroStatLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 1,
  },
  heroStatDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.18)" },
  createCta: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    ...getShadow("sm"),
  },
  createCtaText: { color: design.colors.primary, fontWeight: "800", fontSize: 13 },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 100 },

  automationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    ...getShadow("sm"),
  },
  automationIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineCard: {
    marginTop: 10,
    marginBottom: 18,
    padding: 13,
    borderRadius: 14,
    backgroundColor: design.colors.surfaceVariant,
  },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  timelineIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineLine: {
    width: 1,
    height: 12,
    backgroundColor: design.colors.border,
    marginLeft: 15,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  filterChips: { flexDirection: "row", gap: 7, marginBottom: 13 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: design.colors.primary, borderColor: design.colors.primary },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 13,
    gap: 9,
    ...getShadow("sm"),
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  channelIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: design.colors.surfaceVariant,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  markSentBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: design.colors.successLight,
  },

  sheetHint: { marginBottom: 12, lineHeight: 19 },
  fieldLabel: { marginBottom: 6 },
  selectBtn: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  optionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
  },
  optionChipActive: {
    backgroundColor: design.colors.primaryLight,
    borderColor: design.colors.primary,
  },
  invoiceOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  invoiceOptionActive: { backgroundColor: design.colors.primaryLight },
  formError: { color: design.colors.danger, marginTop: 6, textAlign: "center", fontSize: 12 },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
