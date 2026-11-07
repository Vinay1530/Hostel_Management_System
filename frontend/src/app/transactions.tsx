import { api, rupeesFromPaise } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { Sheet } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AppButton,
  AppText,
  AppBadge,
  EmptyState,
  AppAvatar,
  AppInput,
  Skeleton,
} from "@/components/ui-components";

type Invoice = {
  id: string;
  stay_id: string;
  period_month: string;
  amount_paise: number;
  due_date: string;
  status: string;
  payments: {
    id: string;
    invoice_id: string;
    amount_paise: number;
    mode: string;
    reference: string | null;
    paid_at: string;
  }[];
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

type TenantTxn = {
  invoice_id: string;
  period_month: string;
  amount_paise: number;
  paid_paise: number;
  balance_paise: number;
  due_date: string;
  status: string;
  payments: {
    payment_id: string;
    amount_paise: number;
    mode: string;
    reference: string | null;
    paid_at: string;
  }[];
};

type LedgerEntry = {
  key: string;
  invoiceId: string;
  tenantId: string | null;
  tenantName: string;
  room: string;
  bed: string;
  property: string;
  month: string;
  amount_paise: number;
  mode: string;
  reference: string | null;
  paid_at: string;
};

const MODES: { value: string; label: string; icon: string }[] = [
  { value: "cash", label: "Cash", icon: "cash-outline" },
  { value: "upi_manual", label: "UPI", icon: "phone-portrait-outline" },
  { value: "bank_transfer", label: "Bank", icon: "business-outline" },
  { value: "card", label: "Card", icon: "card-outline" },
];

const MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi_manual: "UPI",
  bank_transfer: "Bank transfer",
  card: "Card",
};

const RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
];

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function prettyDate(iso: string, withTime = false): string {
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: withTime ? undefined : "numeric",
  });
}

function modeIcon(mode: string): string {
  return MODES.find((m) => m.value === mode)?.icon ?? "wallet-outline";
}

function inRange(iso: string, range: string): boolean {
  if (range === "all") return true;
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (isNaN(date.getTime())) return true;
  const now = new Date();
  if (range === "7d") return now.getTime() - date.getTime() <= 7 * 24 * 60 * 60 * 1000;
  if (range === "30d") return now.getTime() - date.getTime() <= 30 * 24 * 60 * 60 * 1000;
  if (range === "month")
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  return true;
}

export default function TransactionsScreen() {
  const router = useRouter();
  const { role } = useAuth();
  const isTenant = role === "tenant";
  const accent = isTenant ? roleAccents.tenant : roleAccents.manager;

  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [tenantTxns, setTenantTxns] = useState<TenantTxn[] | null>(null);
  const [duesRows, setDuesRows] = useState<DueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState("all");
  const [modeFilter, setModeFilter] = useState("__all__");

  const [recordOpen, setRecordOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      if (isTenant) {
        const rows = await api.get<TenantTxn[]>("/my/transactions");
        setTenantTxns(rows);
      } else {
        const [invRes, duesRes] = await Promise.allSettled([
          api.get<Invoice[]>("/invoices"),
          api.get<{ rows: DueRow[] }>("/dues"),
        ]);
        const invoices = invRes.status === "fulfilled" ? invRes.value : [];
        const rows = duesRes.status === "fulfilled" ? duesRes.value.rows ?? [] : [];
        const duesMap = new Map(rows.map((r) => [r.invoice_id, r]));
        setDuesRows(rows);
        const entries: LedgerEntry[] = [];
        for (const invoice of invoices) {
          const info = duesMap.get(invoice.id);
          for (const payment of invoice.payments ?? []) {
            entries.push({
              key: payment.id,
              invoiceId: invoice.id,
              tenantId: info?.tenant_id ?? null,
              tenantName: info?.tenant_name ?? "Tenant",
              room: info?.room_number ?? "—",
              bed: info?.bed_label ?? "—",
              property: info?.property_name ?? "—",
              month: invoice.period_month,
              amount_paise: payment.amount_paise,
              mode: payment.mode,
              reference: payment.reference,
              paid_at: payment.paid_at,
            });
          }
        }
        entries.sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));
        setLedger(entries);
        if (invRes.status === "rejected" && duesRes.status === "rejected")
          setError("Failed to load transactions");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [isTenant]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filteredLedger = useMemo(
    () =>
      (ledger ?? []).filter((entry) => {
        if (modeFilter !== "__all__" && entry.mode !== modeFilter) return false;
        return inRange(entry.paid_at, range);
      }),
    [ledger, modeFilter, range]
  );

  const collectedTotal = filteredLedger.reduce((sum, e) => sum + e.amount_paise, 0);
  const tenantPaidTotal = (tenantTxns ?? []).reduce((sum, r) => sum + r.paid_paise, 0);
  const tenantOutstanding = (tenantTxns ?? []).reduce(
    (sum, r) => sum + (r.status === "void" ? 0 : r.balance_paise),
    0
  );

  const openInvoices = useMemo(
    () =>
      duesRows
        .filter((r) => r.balance_paise > 0 && r.status !== "void" && r.status !== "paid")
        .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))),
    [duesRows]
  );

  const selectedInvoice = openInvoices.find((r) => r.invoice_id === invoiceId) ?? null;

  function openRecord() {
    const first = openInvoices[0];
    setInvoiceId(first?.invoice_id ?? null);
    setAmount(first ? String(Math.round(first.balance_paise / 100)) : "");
    setMode("cash");
    setReference("");
    setFormError(null);
    setRecordOpen(true);
  }

  function chooseInvoice(id: string) {
    setInvoiceId(id);
    const row = openInvoices.find((r) => r.invoice_id === id);
    if (row) setAmount(String(Math.round(row.balance_paise / 100)));
    setInvoicePickerOpen(false);
  }

  async function recordPayment() {
    setFormError(null);
    if (!selectedInvoice) {
      setFormError("Select an invoice to record a payment.");
      return;
    }
    const amountPaise = Math.round((Number(amount.replace(/[^\d.]/g, "")) || 0) * 100);
    if (amountPaise <= 0) {
      setFormError("Enter a payment amount greater than zero.");
      return;
    }
    if (amountPaise > selectedInvoice.balance_paise) {
      setFormError(`Amount exceeds the outstanding balance of ${rupeesFromPaise(selectedInvoice.balance_paise)}.`);
      return;
    }
    setSaving(true);
    try {
      await api.post("/payments", {
        invoice_id: selectedInvoice.invoice_id,
        amount_paise: amountPaise,
        mode,
        reference: reference.trim() || null,
      });
      setRecordOpen(false);
      await load();
      Alert.alert("Payment recorded", `${rupeesFromPaise(amountPaise)} added to ${selectedInvoice.tenant_name}'s invoice.`);
    } catch (e: any) {
      setFormError(e?.detail ?? e?.message ?? "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: accent.accent }]}>
        <View style={styles.headerGlow} />
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{isTenant ? "MY PAYMENTS" : "MONEY LEDGER"}</Text>
            <Text style={styles.h1}>Transactions</Text>
          </View>
          {!isTenant && (
            <TouchableOpacity style={styles.headerAction} onPress={openRecord}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.heroAmountCard}>
          <Text style={styles.heroAmountLabel}>
            {isTenant ? "TOTAL PAID TILL DATE" : "COLLECTED (FILTERED)"}
          </Text>
          <Text style={styles.heroAmountValue} numberOfLines={1} adjustsFontSizeToFit>
            {rupeesFromPaise(isTenant ? tenantPaidTotal : collectedTotal)}
          </Text>
          <Text style={styles.heroAmountSub}>
            {isTenant
              ? tenantOutstanding > 0
                ? `${rupeesFromPaise(tenantOutstanding)} still outstanding`
                : "All dues cleared"
              : `${filteredLedger.length} payment${filteredLedger.length === 1 ? "" : "s"} · ${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}`}
          </Text>
        </View>

        {!isTenant && (
          <TouchableOpacity style={styles.recordCta} onPress={openRecord} activeOpacity={0.9}>
            <Ionicons name="add-circle" size={17} color={accent.accent} />
            <Text style={[styles.recordCtaText, { color: accent.accent }]}>Record Payment</Text>
            <Ionicons name="arrow-forward" size={14} color={accent.accent} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={accent.accent} />
        }
      >
        {loading && (!ledger && !tenantTxns) && (
          <View style={{ gap: 10 }}>
            <View style={styles.statsRow}>
              <Skeleton height={80} radius={16} style={{ flex: 1 }} />
              <Skeleton height={80} radius={16} style={{ flex: 1 }} />
            </View>
            <Skeleton height={88} radius={16} />
            <Skeleton height={88} radius={16} />
            <Skeleton height={88} radius={16} />
          </View>
        )}

        {/* Tenant view */}
        {isTenant && tenantTxns && (
          <>
            <View style={styles.statsRow}>
              <MiniStat label="Invoices" value={tenantTxns.length} icon="receipt-outline" />
              <MiniStat
                label="Outstanding"
                value={rupeesFromPaise(tenantOutstanding)}
                icon="alert-circle-outline"
                tint={tenantOutstanding > 0 ? design.colors.danger : design.colors.success}
              />
            </View>

            {tenantTxns.length === 0 && (
              <EmptyState
                icon="receipt-outline"
                title="No bills yet"
                subtitle="Your manager generates rent bills monthly. They'll appear here with every payment."
              />
            )}

            <View style={{ gap: 10 }}>
              {tenantTxns.map((txn) => (
                <View key={txn.invoice_id} style={styles.txnCard}>
                  <View style={styles.txnTop}>
                    <View style={styles.monthTile}>
                      <Ionicons name="calendar-outline" size={16} color={accent.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "800" }}>
                        {txn.period_month}
                      </AppText>
                      <AppText variant="caption" color={design.colors.textSecondary}>
                        Due {prettyDate(txn.due_date)}
                      </AppText>
                    </View>
                    <AppBadge
                      variant={
                        txn.status === "paid"
                          ? "success"
                          : txn.balance_paise > 0
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {txn.status === "paid" ? "Paid" : txn.status === "partial" ? "Partial" : "Pending"}
                    </AppBadge>
                  </View>

                  <View style={styles.amountRow}>
                    <View>
                      <AppText variant="caption" color={design.colors.textMuted}>
                        BILL AMOUNT
                      </AppText>
                      <AppText variant="h4" color={design.colors.textPrimary}>
                        {rupeesFromPaise(txn.amount_paise)}
                      </AppText>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <AppText variant="caption" color={design.colors.textMuted}>
                        BALANCE
                      </AppText>
                      <AppText
                        variant="h4"
                        color={txn.balance_paise > 0 ? design.colors.danger : design.colors.success}
                      >
                        {rupeesFromPaise(txn.balance_paise)}
                      </AppText>
                    </View>
                  </View>

                  {txn.payments.length > 0 && (
                    <View style={styles.paymentList}>
                      {txn.payments.map((p) => (
                        <View key={p.payment_id} style={styles.paymentRow}>
                          <Ionicons
                            name={modeIcon(p.mode) as any}
                            size={14}
                            color={design.colors.success}
                          />
                          <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
                            {rupeesFromPaise(p.amount_paise)} · {MODE_LABEL[p.mode] ?? p.mode}
                            {p.reference ? ` · ${p.reference}` : ""}
                          </AppText>
                          <AppText variant="caption" color={design.colors.textMuted}>
                            {prettyDate(p.paid_at)}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Staff ledger */}
        {!isTenant && (
          <>
            <View style={styles.filterBlock}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {RANGE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.chip, range === option.value && styles.chipActive]}
                    onPress={() => setRange(option.value)}
                  >
                    <AppText
                      variant="caption"
                      color={range === option.value ? "#fff" : design.colors.textSecondary}
                      style={{ fontWeight: "700" }}
                    >
                      {option.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                <TouchableOpacity
                  style={[styles.modeChip, modeFilter === "__all__" && styles.modeChipActive]}
                  onPress={() => setModeFilter("__all__")}
                >
                  <Ionicons
                    name="apps-outline"
                    size={13}
                    color={modeFilter === "__all__" ? design.colors.primary : design.colors.textMuted}
                  />
                  <AppText
                    variant="caption"
                    color={modeFilter === "__all__" ? design.colors.primary : design.colors.textSecondary}
                    style={{ fontWeight: "700" }}
                  >
                    All modes
                  </AppText>
                </TouchableOpacity>
                {MODES.map((m) => {
                  const active = modeFilter === m.value;
                  return (
                    <TouchableOpacity
                      key={m.value}
                      style={[styles.modeChip, active && styles.modeChipActive]}
                      onPress={() => setModeFilter(m.value)}
                    >
                      <Ionicons
                        name={m.icon as any}
                        size={13}
                        color={active ? design.colors.primary : design.colors.textMuted}
                      />
                      <AppText
                        variant="caption"
                        color={active ? design.colors.primary : design.colors.textSecondary}
                        style={{ fontWeight: "700" }}
                      >
                        {m.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.sectionRow}>
              <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                PAYMENT HISTORY
              </AppText>
              <AppText variant="caption" color={design.colors.textMuted}>
                {filteredLedger.length} entr{filteredLedger.length === 1 ? "y" : "ies"}
              </AppText>
            </View>

            {ledger && filteredLedger.length === 0 && (
              <EmptyState
                icon="receipt-outline"
                title="No payments in this view"
                subtitle="Adjust the date range or payment mode, or record a cash/UPI payment."
                actionLabel="Record Payment"
                onAction={openRecord}
              />
            )}

            <View style={{ gap: 10 }}>
              {filteredLedger.map((entry) => (
                <TouchableOpacity
                  key={entry.key}
                  style={styles.txnCard}
                  activeOpacity={0.9}
                  onPress={() =>
                    entry.tenantId ? router.push(`/tenant-profile/${entry.tenantId}`) : undefined
                  }
                >
                  <View style={styles.txnTop}>
                    <AppAvatar initials={initials(entry.tenantName) || "T"} size={40} variant="primary" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "800" }} numberOfLines={1}>
                        {entry.tenantName}
                      </AppText>
                      <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                        Room {entry.room} · Bed {entry.bed} · {entry.month}
                      </AppText>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <AppText variant="h4" color={design.colors.success}>
                        +{rupeesFromPaise(entry.amount_paise)}
                      </AppText>
                      <AppText variant="caption" color={design.colors.textMuted}>
                        {prettyDate(entry.paid_at)}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.entryMeta}>
                    <View style={styles.modePill}>
                      <Ionicons name={modeIcon(entry.mode) as any} size={12} color={design.colors.textSecondary} />
                      <AppText variant="caption" color={design.colors.textSecondary} style={{ fontWeight: "700" }}>
                        {MODE_LABEL[entry.mode] ?? entry.mode}
                      </AppText>
                    </View>
                    {entry.reference ? (
                      <AppText variant="caption" color={design.colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
                        Ref {entry.reference}
                      </AppText>
                    ) : (
                      <AppText variant="caption" color={design.colors.textMuted} style={{ flex: 1 }}>
                        Invoice {entry.invoiceId.slice(0, 8).toUpperCase()}
                      </AppText>
                    )}
                    <Ionicons name="chevron-forward" size={14} color={design.colors.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {openInvoices.length > 0 && (
              <>
                <View style={styles.sectionRow}>
                  <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                    AWAITING PAYMENT
                  </AppText>
                  <AppText variant="caption" color={design.colors.textMuted}>
                    {openInvoices.length} invoices
                  </AppText>
                </View>
                <View style={{ gap: 8 }}>
                  {openInvoices.slice(0, 5).map((row) => (
                    <TouchableOpacity
                      key={row.invoice_id}
                      style={styles.pendingRow}
                      onPress={() => {
                        setInvoiceId(row.invoice_id);
                        setAmount(String(Math.round(row.balance_paise / 100)));
                        setMode("cash");
                        setReference("");
                        setFormError(null);
                        setRecordOpen(true);
                      }}
                    >
                      <View style={styles.pendingIcon}>
                        <Ionicons name="time-outline" size={16} color="#B45309" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodySmall" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
                          {row.tenant_name} · Room {row.room_number}
                        </AppText>
                        <AppText variant="caption" color={design.colors.textMuted}>
                          {row.period_month} · due {prettyDate(row.due_date)}
                        </AppText>
                      </View>
                      <AppText variant="body" color={design.colors.danger} style={{ fontWeight: "800" }}>
                        {rupeesFromPaise(row.balance_paise)}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {/* Record payment sheet */}
      <Sheet visible={recordOpen} onClose={() => setRecordOpen(false)}>
        <AppText variant="h3" color={design.colors.textPrimary}>
          Record Payment
        </AppText>
        <AppText variant="caption" color={design.colors.textSecondary} style={{ marginBottom: 12 }}>
          Log a cash, UPI, card or bank transfer against an open invoice.
        </AppText>

        <AppText variant="label" color={design.colors.textSecondary} style={{ marginBottom: 5 }}>
          INVOICE
        </AppText>
        <TouchableOpacity style={styles.selectBtn} onPress={() => setInvoicePickerOpen(true)}>
          <View style={{ flex: 1 }}>
            {selectedInvoice ? (
              <>
                <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "700" }} numberOfLines={1}>
                  {selectedInvoice.tenant_name} · Room {selectedInvoice.room_number}
                </AppText>
                <AppText variant="caption" color={design.colors.textSecondary}>
                  {selectedInvoice.period_month} · balance {rupeesFromPaise(selectedInvoice.balance_paise)}
                </AppText>
              </>
            ) : (
              <AppText variant="body" color={design.colors.textMuted}>
                {openInvoices.length ? "Select an invoice" : "No open invoices"}
              </AppText>
            )}
          </View>
          <Ionicons name="chevron-down" size={16} color={design.colors.textMuted} />
        </TouchableOpacity>

        <AppInput
          label="Amount received (Rs.)"
          placeholder="0"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
        {selectedInvoice ? (
          <AppText variant="caption" color={design.colors.textMuted} style={{ marginTop: -6, marginBottom: 8 }}>
            Maximum {rupeesFromPaise(selectedInvoice.balance_paise)}
          </AppText>
        ) : null}

        <AppText variant="label" color={design.colors.textSecondary} style={{ marginBottom: 6 }}>
          PAYMENT MODE
        </AppText>
        <View style={styles.modeGrid}>
          {MODES.map((m) => {
            const active = mode === m.value;
            return (
              <TouchableOpacity
                key={m.value}
                style={[styles.modeOption, active && styles.modeOptionActive]}
                onPress={() => setMode(m.value)}
              >
                <Ionicons
                  name={m.icon as any}
                  size={17}
                  color={active ? design.colors.primary : design.colors.textMuted}
                />
                <AppText
                  variant="caption"
                  color={active ? design.colors.primary : design.colors.textSecondary}
                  style={{ fontWeight: "800" }}
                >
                  {m.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        <AppInput
          label="Reference (optional)"
          placeholder="UPI ref / cheque no."
          value={reference}
          onChangeText={setReference}
        />

        {formError && <Text style={styles.formError}>{formError}</Text>}
        <AppButton
          variant="primary"
          fullWidth
          loading={saving}
          onPress={recordPayment}
          disabled={!selectedInvoice}
          style={{ marginTop: 8 }}
        >
          Save Payment
        </AppButton>
      </Sheet>

      {/* Invoice picker */}
      <Sheet visible={invoicePickerOpen} onClose={() => setInvoicePickerOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={{ marginBottom: 10 }}>
          Select invoice
        </AppText>
        <ScrollView style={{ maxHeight: 420 }}>
          {openInvoices.map((row) => {
            const active = row.invoice_id === invoiceId;
            return (
              <TouchableOpacity
                key={row.invoice_id}
                style={[styles.invoiceOption, active && styles.invoiceOptionActive]}
                onPress={() => chooseInvoice(row.invoice_id)}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
                    {row.tenant_name} · Room {row.room_number}
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary}>
                    {row.period_month} · due {prettyDate(row.due_date)}
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
              No open invoices — everything is settled.
            </AppText>
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
}

function MiniStat({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: string | number;
  icon: string;
  tint?: string;
}) {
  return (
    <View style={styles.miniStat}>
      <View style={styles.miniStatTop}>
        <Ionicons name={icon as any} size={14} color={tint ?? design.colors.primary} />
        <AppText variant="caption" color={design.colors.textMuted}>
          {label}
        </AppText>
      </View>
      <AppText
        variant="h4"
        color={design.colors.textPrimary}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  headerGlow: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -70,
    right: -30,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: "rgba(255,255,255,0.72)", marginBottom: 1 },
  h1: { fontSize: 21, fontWeight: "800", color: "#fff" },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAmountCard: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderRadius: 14,
    padding: 14,
  },
  heroAmountLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8, color: "rgba(255,255,255,0.7)" },
  heroAmountValue: { fontSize: 26, fontWeight: "800", color: "#fff", marginTop: 3, letterSpacing: -0.4 },
  heroAmountSub: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.74)", marginTop: 2 },
  recordCta: {
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
  recordCtaText: { fontWeight: "800", fontSize: 13 },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 100 },

  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  miniStat: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 12,
    ...getShadow("sm"),
  },
  miniStatTop: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 },

  filterBlock: { gap: 8, marginBottom: 16 },
  chipsRow: { gap: 6, paddingRight: 4 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: design.colors.primary, borderColor: design.colors.primary },
  modeChip: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  modeChipActive: { backgroundColor: design.colors.primaryLight, borderColor: design.colors.primary },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
    marginTop: 4,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },

  txnCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 13,
    gap: 10,
    ...getShadow("sm"),
  },
  txnTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  monthTile: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: design.colors.infoLight,
    alignItems: "center",
    justifyContent: "center",
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },
  paymentList: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  entryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: design.colors.surfaceVariant,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 11,
  },
  pendingIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: design.colors.warningLight,
    alignItems: "center",
    justifyContent: "center",
  },

  selectBtn: {
    minHeight: 52,
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
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  modeOption: {
    width: "48.5%",
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  modeOptionActive: { backgroundColor: design.colors.primaryLight, borderColor: design.colors.primary },
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
