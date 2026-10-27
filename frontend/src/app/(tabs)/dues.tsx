import { api, receiptUrl, rupeesFromPaise } from "@/lib/api";
import { usePg } from "@/lib/pg";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import type { InvoiceStatus } from "@/lib/types";
import * as Linking from "expo-linking";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Dues = {
  summary: {
    total_invoices: number;
    pending: number;
    partial: number;
    paid: number;
    billed_paise: number;
    collected_paise: number;
    outstanding_paise: number;
  };
  rows: DueRow[];
};

type DueRow = {
  invoice_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string;
  property_name: string;
  room_number: string;
  bed_label: string;
  period_month: string;
  amount_paise: number;
  paid_paise: number;
  balance_paise: number;
  due_date: string;
  status: InvoiceStatus;
  receipt_url?: string;
};

const statusStyles: Record<InvoiceStatus, { bg: string }> = {
  pending: { bg: theme.warn },
  partial: { bg: theme.info },
  paid: { bg: theme.success },
  void: { bg: "#94a3b8" },
};

export default function Dues() {
  const { propertyId, property } = usePg();
  const [dues, setDues] = useState<Dues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<DueRow | null>(null);
  const [genOpen, setGenOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const q = propertyId ? `?property_id=${propertyId}` : "";
      setDues(await api.get<Dues>(`/dues${q}`));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load dues");
    }
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onSavedPayment() {
    setPayFor(null);
    await load();
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={!dues && !error} onRefresh={load} />}
    >
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Rent Dues</Text>
          <Text style={styles.sub}>{property ? property.name : "All PGs"}</Text>
        </View>
      </View>
      <Pressable style={styles.genBtn} onPress={() => setGenOpen(true)}>
        <Ionicons name="flash-outline" size={16} color="#fff" />
        <Text style={styles.genBtnText}> Generate {property ? property.name + "'s" : "month's"} bills</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      {dues && (
        <View style={styles.summaryCard}>
          <SummaryItem label="Outstanding" value={rupeesFromPaise(dues.summary.outstanding_paise)} big />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <SummaryItem label="Collected" value={rupeesFromPaise(dues.summary.collected_paise)} />
            <SummaryItem label="Billed" value={rupeesFromPaise(dues.summary.billed_paise)} />
            <SummaryItem label="Pending" value={String(dues.summary.pending + dues.summary.partial)} />
          </View>
        </View>
      )}

      {dues?.rows.map((r) => (
        <View key={r.invoice_id} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.tenantName}>{r.tenant_name}</Text>
            <Text style={styles.meta}>
              {r.property_name} · Room {r.room_number}/{r.bed_label} · {r.period_month}
            </Text>
            <Text style={styles.meta}>
              Balance {rupeesFromPaise(r.balance_paise)} of {rupeesFromPaise(r.amount_paise)} · due {r.due_date}
            </Text>
            {r.paid_paise > 0 && (
              <Pressable onPress={() => Linking.openURL(receiptUrl(r.invoice_id))}>
                <Text style={styles.link}>Receipt for collected {rupeesFromPaise(r.paid_paise)}</Text>
              </Pressable>
            )}
          </View>
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <View style={[styles.statusBadge, { backgroundColor: statusStyles[r.status].bg }]}>
              <Text style={styles.statusText}>{r.status.toUpperCase()}</Text>
            </View>
            {r.balance_paise > 0 && (
              <Pressable style={styles.payBtn} onPress={() => setPayFor(r)}>
                <Text style={styles.payBtnText}>+ Payment</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
      {dues?.rows.length === 0 && (
        <Text style={styles.empty}>No invoices yet — generate a rent cycle from the dues API or wait for the monthly job.</Text>
      )}

      <PayModal row={payFor} onClose={() => setPayFor(null)} onSaved={onSavedPayment} />
      <GenerateModal
        visible={genOpen}
        propertyId={propertyId}
        propertyName={property?.name ?? null}
        onClose={() => setGenOpen(false)}
        onGenerated={load}
      />
    </ScrollView>
  );
}

function SummaryItem({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={big ? styles.summaryValueBig : styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function GenerateModal({
  visible,
  propertyId,
  propertyName,
  onClose,
  onGenerated,
}: {
  visible: boolean;
  propertyId: string | null;
  propertyName: string | null;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const monthStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const [month, setMonth] = useState(monthStr());
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const created = await api.post<{ length: number }>("/invoices/generate", {
        month,
        property_id: propertyId,
      });
      Alert.alert(
        "Done",
        `Generated ${Array.isArray(created) ? created.length : 0} invoice(s) for ${month}${propertyName ? ` · ${propertyName}` : " (all PGs)"}. Idempotent — already-billed stays are skipped.`
      );
      onGenerated();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Generate rent bills</Text>
          <Text style={styles.modalHelp}>
            Creates one invoice per occupied bed for the month{propertyName ? ` in ${propertyName}` : " across all PGs"}. Safe to re-run for the same month.
          </Text>
          <TextInput style={styles.input} placeholder="Month (YYYY-MM)" keyboardType="numbers-and-punctuation" maxLength={7} value={month} onChangeText={(v) => setMonth(v.replace(/[^\d-]/g, ""))} />
          <Pressable style={styles.primaryBtn} onPress={generate} disabled={busy || month.length !== 7}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Generate</Text>}
          </Pressable>
          <Pressable style={[styles.secondaryBtn, { alignItems: "center" }]} onPress={onClose}>
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function PayModal({ row, onClose, onSaved }: { row: DueRow | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "upi_manual">("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!row) return;
    setBusy(true);
    try {
      await api.post("/payments", {
        invoice_id: row.invoice_id,
        amount_paise: Math.round(parseFloat(amount) * 100),
        mode,
        reference: reference || null,
      });
      setAmount("");
      setReference("");
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={!!row} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Record payment</Text>
          {row && (
            <>
              <Text style={styles.modalHelp}>
                {row.tenant_name} · {row.period_month} · outstanding {rupeesFromPaise(row.balance_paise)}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={`Amount (max ${(row.balance_paise / 100).toFixed(2)})`}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["cash", "upi_manual"] as const).map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.modeBtn, mode === m && styles.modeBtnOn]}
                    onPress={() => setMode(m)}
                  >
                    <Text style={{ color: mode === m ? "#fff" : theme.text, fontWeight: "600" }}>
                      {m === "cash" ? "Cash" : "UPI (manual)"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {mode === "upi_manual" && (
                <TextInput style={styles.input} placeholder="UPI reference / UTR" value={reference} onChangeText={setReference} />
              )}
              <Pressable style={styles.primaryBtn} onPress={save} disabled={busy || !amount}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save payment</Text>}
              </Pressable>
            </>
          )}
          <Pressable style={[styles.secondaryBtn, { alignItems: "center" }]} onPress={onClose}>
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  h1: { fontSize: 26, fontWeight: "800", color: theme.text, letterSpacing: -0.3 },
  sub: { fontSize: 12, color: theme.textLight, marginTop: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  genBtn: { backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 13, alignItems: "center", marginBottom: 12, flexDirection: "row", justifyContent: "center" },
  genBtnText: { color: "#fff", fontWeight: "800" },
  summaryCard: { backgroundColor: theme.accent, borderRadius: 22, padding: 18, marginBottom: 12 },
  summaryItem: { flex: 1 },
  summaryValue: { fontSize: 15, fontWeight: "700", color: "#fff" },
  summaryValueBig: { fontSize: 24, fontWeight: "800", color: "#fff" },
  summaryLabel: { fontSize: 11, color: "#dcf0ff", marginTop: 2 },
  card: { backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: "row", borderWidth: 1, borderColor: theme.border },
  tenantName: { fontSize: 16, fontWeight: "700", color: theme.text },
  meta: { fontSize: 12, color: theme.textLight, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  payBtn: { backgroundColor: theme.success, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  payBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  link: { color: theme.accentText, fontSize: 11, marginTop: 4, textDecorationLine: "underline" },
  empty: { color: theme.textLight, textAlign: "center", marginTop: 20 },
  error: { color: theme.danger, marginBottom: 8 },
  overlay: { flex: 1, backgroundColor: "#00000055", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 20, padding: 20, width: "100%", gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: theme.text },
  modalHelp: { fontSize: 12, color: theme.textLight },
  input: { borderWidth: 1, borderColor: theme.chipBorder, borderRadius: 12, padding: 12, fontSize: 15, color: theme.text },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: theme.chipBorder, borderRadius: 12, padding: 10, alignItems: "center" },
  modeBtnOn: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
  primaryBtn: { backgroundColor: theme.accent, borderRadius: 12, padding: 13, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  secondaryBtn: { backgroundColor: theme.chipBg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  secondaryBtnText: { color: theme.accentText, fontWeight: "700" },
});
