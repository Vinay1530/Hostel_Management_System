import { api, rupeesFromPaise } from "@/lib/api";
import { design, getShadow } from "@/lib/design";
import { ConfirmDialog, Sheet } from "@/components/ui";
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
  AppAvatar,
  EmptyState,
  AppInput,
  Skeleton,
} from "@/components/ui-components";

type Deposit = {
  id: string;
  stay_id: string;
  amount_paise: number;
  status: string;
  held_by_user_id: string | null;
  refund_date: string | null;
  deductions_paise: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Tenant = {
  id: string;
  full_name: string;
  phone: string;
  stays: {
    id: string;
    bed_id: string;
    start_date: string | null;
    agreed_rent_paise: number;
    deposit_paise: number;
    active: boolean;
  }[];
};

type GridBed = { id: string; label: string };
type GridRoom = { id: string; number: string; beds: GridBed[] };
type GridFloor = { id: string; name: string; rooms: GridRoom[] };
type GridProperty = { id: string; name: string; floors: GridFloor[] };

type StayInfo = {
  tenantId: string;
  tenantName: string;
  phone: string;
  stayId: string;
  bedId: string;
  rentPaise: number;
  depositPaise: number;
  propertyName: string;
  floorName: string;
  roomNumber: string;
  bedLabel: string;
};

const STATUS_META: Record<
  string,
  { label: string; variant: "primary" | "success" | "danger" | "neutral" | "warning" }
> = {
  held: { label: "Held", variant: "primary" },
  refunded: { label: "Refunded", variant: "success" },
  forfeited: { label: "Forfeited", variant: "danger" },
  partial: { label: "Partial", variant: "warning" },
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
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function SecurityDeposits() {
  const router = useRouter();

  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const [stays, setStays] = useState<Record<string, StayInfo>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [stayPickerOpen, setStayPickerOpen] = useState(false);
  const [selectedStay, setSelectedStay] = useState<StayInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [actionDeposit, setActionDeposit] = useState<Deposit | null>(null);
  const [refundTarget, setRefundTarget] = useState<Deposit | null>(null);
  const [settleTarget, setSettleTarget] = useState<Deposit | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const [depRes, tenantRes, gridRes] = await Promise.allSettled([
        api.get<Deposit[]>("/security-deposits"),
        api.get<Tenant[]>("/tenants"),
        api.get<{ properties: GridProperty[] }>("/occupancy-grid"),
      ]);

      if (depRes.status === "fulfilled") setDeposits(depRes.value);
      else setError((depRes.reason as any)?.message ?? "Failed to load deposits");

      const bedLocation: Record<
        string,
        { propertyName: string; floorName: string; roomNumber: string; bedLabel: string }
      > = {};
      if (gridRes.status === "fulfilled") {
        for (const property of gridRes.value.properties ?? [])
          for (const floor of property.floors ?? [])
            for (const room of floor.rooms ?? [])
              for (const bed of room.beds ?? [])
                bedLocation[bed.id] = {
                  propertyName: property.name,
                  floorName: floor.name,
                  roomNumber: room.number,
                  bedLabel: bed.label,
                };
      }

      if (tenantRes.status === "fulfilled") {
        const map: Record<string, StayInfo> = {};
        for (const tenant of tenantRes.value) {
          for (const stay of tenant.stays ?? []) {
            const loc = bedLocation[stay.bed_id];
            map[stay.id] = {
              tenantId: tenant.id,
              tenantName: tenant.full_name,
              phone: tenant.phone,
              stayId: stay.id,
              bedId: stay.bed_id,
              rentPaise: stay.agreed_rent_paise,
              depositPaise: stay.deposit_paise,
              propertyName: loc?.propertyName ?? "—",
              floorName: loc?.floorName ?? "",
              roomNumber: loc?.roomNumber ?? "—",
              bedLabel: loc?.bedLabel ?? "—",
            };
          }
        }
        setStays(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const heldTotal = useMemo(
    () =>
      (deposits ?? [])
        .filter((d) => d.status === "held")
        .reduce((sum, d) => sum + d.amount_paise, 0),
    [deposits]
  );
  const deductionsTotal = useMemo(
    () => (deposits ?? []).reduce((sum, d) => sum + d.deductions_paise, 0),
    [deposits]
  );
  const refundedTotal = useMemo(
    () =>
      (deposits ?? [])
        .filter((d) => d.status === "refunded")
        .reduce((sum, d) => sum + Math.max(0, d.amount_paise - d.deductions_paise), 0),
    [deposits]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return deposits ?? [];
    return (deposits ?? []).filter((d) => d.status === filter);
  }, [deposits, filter]);

  const availableStays = useMemo(() => {
    const taken = new Set((deposits ?? []).map((d) => d.stay_id));
    return Object.values(stays)
      .filter((s) => !taken.has(s.stayId))
      .sort((a, b) => a.tenantName.localeCompare(b.tenantName));
  }, [stays, deposits]);

  function openAdd() {
    const first = availableStays[0] ?? null;
    setSelectedStay(first);
    setAmount(first && first.depositPaise > 0 ? String(Math.round(first.depositPaise / 100)) : "");
    setFormError(null);
    setAddOpen(true);
  }

  function chooseStay(stay: StayInfo) {
    setSelectedStay(stay);
    if (stay.depositPaise > 0) setAmount(String(Math.round(stay.depositPaise / 100)));
    setStayPickerOpen(false);
  }

  async function recordDeposit() {
    setFormError(null);
    if (!selectedStay) {
      setFormError("Select the tenant whose deposit you received.");
      return;
    }
    const paise = Math.round((Number(amount.replace(/[^\d.]/g, "")) || 0) * 100);
    if (paise <= 0) {
      setFormError("Enter a deposit amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/security-deposits", {
        stay_id: selectedStay.stayId,
        amount_paise: paise,
      });
      setAddOpen(false);
      await load();
      Alert.alert(
        "Deposit recorded",
        `${rupeesFromPaise(paise)} security deposit logged for ${selectedStay.tenantName}.`
      );
    } catch (e: any) {
      setFormError(e?.detail ?? e?.message ?? "Failed to record deposit");
    } finally {
      setSaving(false);
    }
  }

  async function refundDeposit(deposit: Deposit) {
    setBusyId(deposit.id);
    try {
      await api.post(`/security-deposits/${deposit.id}/refund`, {});
      await load();
      Alert.alert(
        "Deposit refunded",
        `${rupeesFromPaise(deposit.amount_paise - deposit.deductions_paise)} marked refunded.`
      );
    } catch (e: any) {
      Alert.alert("Refund failed", e?.detail ?? e?.message ?? "Could not refund deposit");
    } finally {
      setBusyId(null);
      setRefundTarget(null);
    }
  }

  async function settleDeposit(deposit: Deposit) {
    setBusyId(deposit.id);
    try {
      await api.post(`/security-deposits/${deposit.id}/settle`, {});
      await load();
      Alert.alert(
        "Deposit settled",
        "Outstanding dues were cleared from this deposit first. The remainder is marked refundable."
      );
    } catch (e: any) {
      Alert.alert("Settlement failed", e?.detail ?? e?.message ?? "Could not settle deposit");
    } finally {
      setBusyId(null);
      setSettleTarget(null);
    }
  }

  async function deleteDeposit(deposit: Deposit) {
    Alert.alert(
      "Delete deposit record?",
      "This only removes the ledger entry. It does not move money or change the stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusyId(deposit.id);
            try {
              // No delete route exists for deposits; mark voided via notes/status.
              await api.patch(`/security-deposits/${deposit.id}`, {
                ...deposit,
                status: "voided",
                notes: deposit.notes ?? "Deposit record voided",
              });
              await load();
            } catch (e: any) {
              Alert.alert("Failed", e?.detail ?? e?.message ?? "Could not void deposit");
            } finally {
              setBusyId(null);
              setActionDeposit(null);
            }
          },
        },
      ]
    );
  }

  const isFilterActive = (value: string) => filter === value;

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>FINANCIAL SAFETY</Text>
            <AppText variant="h2" color="#fff">
              Security Deposits
            </AppText>
          </View>
          <TouchableOpacity style={styles.headerAction} onPress={openAdd} accessibilityLabel="Record deposit">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroAmountCard}>
          <Text style={styles.heroAmountLabel}>CURRENTLY HELD</Text>
          <Text style={styles.heroAmountValue} numberOfLines={1} adjustsFontSizeToFit>
            {rupeesFromPaise(heldTotal)}
          </Text>
          <Text style={styles.heroAmountSub}>
            {deposits?.filter((d) => d.status === "held").length ?? 0} open deposits ·{" "}
            {deposits?.length ?? 0} total records
          </Text>
        </View>

        <TouchableOpacity style={styles.recordCta} onPress={openAdd} activeOpacity={0.9}>
          <Ionicons name="add-circle" size={17} color={design.colors.primary} />
          <Text style={styles.recordCtaText}>Record Deposit</Text>
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
        {loading && !deposits && (
          <View style={{ gap: 10 }}>
            <View style={styles.statsGrid}>
              <Skeleton height={86} radius={16} style={{ width: "48.3%" }} />
              <Skeleton height={86} radius={16} style={{ width: "48.3%" }} />
              <Skeleton height={86} radius={16} style={{ width: "48.3%" }} />
              <Skeleton height={86} radius={16} style={{ width: "48.3%" }} />
            </View>
            <Skeleton height={120} radius={16} />
            <Skeleton height={120} radius={16} />
          </View>
        )}

        {(!loading || deposits) && (
          <>
            <View style={styles.statsGrid}>
              <MiniStat
                icon="shield-checkmark-outline"
                label="Held"
                value={rupeesFromPaise(heldTotal)}
                tint={design.colors.primary}
                bg={design.colors.primaryLight}
              />
              <MiniStat
                icon="cut-outline"
                label="Deductions"
                value={rupeesFromPaise(deductionsTotal)}
                tint="#B45309"
                bg={design.colors.warningLight}
              />
              <MiniStat
                icon="return-down-back-outline"
                label="Refunded"
                value={rupeesFromPaise(refundedTotal)}
                tint={design.colors.success}
                bg={design.colors.successLight}
              />
              <MiniStat
                icon="document-text-outline"
                label="Records"
                value={deposits?.length ?? 0}
                tint={design.colors.info}
                bg={design.colors.infoLight}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChips}
            >
              {(
                [
                  ["all", "All"],
                  ["held", "Held"],
                  ["refunded", "Refunded"],
                  ["forfeited", "Forfeited"],
                ] as [string, string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, isFilterActive(value) && styles.chipActive]}
                  onPress={() => setFilter(value)}
                  activeOpacity={0.85}
                >
                  <AppText
                    variant="caption"
                    color={isFilterActive(value) ? "#fff" : design.colors.textSecondary}
                    style={{ fontWeight: "700" }}
                  >
                    {label}
                  </AppText>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {deposits && filtered.length === 0 && (
              <EmptyState
                icon="shield-checkmark-outline"
                title={deposits.length === 0 ? "No deposits recorded" : "No deposits in this view"}
                subtitle={
                  deposits.length === 0
                    ? "Log the security deposit received from each tenant to keep refunds and deductions transparent."
                    : "Try a different status filter."
                }
                actionLabel={deposits.length === 0 ? "Record Deposit" : undefined}
                onAction={deposits.length === 0 ? openAdd : undefined}
              />
            )}

            <View style={{ gap: 10 }}>
              {filtered.map((deposit) => {
                const info = stays[deposit.stay_id];
                const meta = STATUS_META[deposit.status] ?? {
                  label: deposit.status,
                  variant: "neutral" as const,
                };
                const refundable = Math.max(0, deposit.amount_paise - deposit.deductions_paise);
                return (
                  <View key={deposit.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <AppAvatar
                        initials={initials(info?.tenantName ?? "T") || "T"}
                        size={44}
                        variant="primary"
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText
                          variant="body"
                          color={design.colors.textPrimary}
                          style={{ fontWeight: "800" }}
                          numberOfLines={1}
                        >
                          {info?.tenantName ?? "Tenant"}
                        </AppText>
                        <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                          {info
                            ? `Room ${info.roomNumber} · Bed ${info.bedLabel} · ${info.propertyName}`
                            : "Stay no longer active"}
                        </AppText>
                      </View>
                      <AppBadge variant={meta.variant}>{meta.label}</AppBadge>
                    </View>

                    <View style={styles.amountRow}>
                      <View>
                        <AppText variant="caption" color={design.colors.textMuted}>
                          DEPOSIT RECEIVED
                        </AppText>
                        <AppText variant="h3" color={design.colors.textPrimary}>
                          {rupeesFromPaise(deposit.amount_paise)}
                        </AppText>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <AppText variant="caption" color={design.colors.textMuted}>
                          {deposit.status === "held" ? "REFUNDABLE" : "DEDUCTED"}
                        </AppText>
                        <AppText
                          variant="h4"
                          color={
                            deposit.status === "held"
                              ? design.colors.success
                              : design.colors.textSecondary
                          }
                        >
                          {rupeesFromPaise(
                            deposit.status === "held" ? refundable : deposit.deductions_paise
                          )}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={13} color={design.colors.textMuted} />
                      <AppText variant="caption" color={design.colors.textMuted} style={{ flex: 1 }}>
                        Recorded {prettyDate(deposit.created_at)}
                        {deposit.refund_date ? ` · Settled ${prettyDate(deposit.refund_date)}` : ""}
                      </AppText>
                      {deposit.notes ? (
                        <TouchableOpacity
                          onPress={() => Alert.alert("Deposit notes", deposit.notes ?? "")}
                          hitSlop={8}
                        >
                          <Ionicons name="information-circle-outline" size={17} color={design.colors.textSecondary} />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {deposit.status === "held" ? (
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={styles.secondaryAction}
                          onPress={() => setSettleTarget(deposit)}
                          disabled={busyId === deposit.id}
                        >
                          <Ionicons name="git-merge-outline" size={15} color={design.colors.primary} />
                          <AppText
                            variant="caption"
                            color={design.colors.primary}
                            style={{ fontWeight: "800" }}
                          >
                            Settle Dues
                          </AppText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.primaryAction}
                          onPress={() => setRefundTarget(deposit)}
                          disabled={busyId === deposit.id}
                        >
                          <Ionicons name="return-down-back" size={15} color="#fff" />
                          <AppText variant="caption" color="#fff" style={{ fontWeight: "800" }}>
                            {busyId === deposit.id ? "Working…" : "Refund"}
                          </AppText>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.archiveRow}
                        onPress={() => setActionDeposit(deposit)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="ellipsis-horizontal" size={15} color={design.colors.textMuted} />
                        <AppText variant="caption" color={design.colors.textMuted} style={{ flex: 1 }}>
                          Closed deposit record
                        </AppText>
                        <Ionicons name="chevron-forward" size={14} color={design.colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {/* Record deposit sheet */}
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)}>
        <AppText variant="h3" color={design.colors.textPrimary}>
          Record Deposit
        </AppText>
        <AppText variant="caption" color={design.colors.textSecondary} style={styles.sheetHint}>
          Link the deposit to the tenant's active stay so refunds and deductions stay traceable.
        </AppText>

        <AppText variant="label" color={design.colors.textSecondary} style={styles.fieldLabel}>
          TENANT & STAY
        </AppText>
        <TouchableOpacity style={styles.selectBtn} onPress={() => setStayPickerOpen(true)}>
          <View style={{ flex: 1 }}>
            {selectedStay ? (
              <>
                <AppText
                  variant="body"
                  color={design.colors.textPrimary}
                  style={{ fontWeight: "700" }}
                  numberOfLines={1}
                >
                  {selectedStay.tenantName}
                </AppText>
                <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                  {selectedStay.propertyName} · Room {selectedStay.roomNumber} · Bed{" "}
                  {selectedStay.bedLabel}
                </AppText>
              </>
            ) : (
              <AppText variant="body" color={design.colors.textMuted}>
                {availableStays.length ? "Select tenant stay" : "All stays already have a deposit"}
              </AppText>
            )}
          </View>
          <Ionicons name="chevron-down" size={16} color={design.colors.textMuted} />
        </TouchableOpacity>

        {selectedStay ? (
          <View style={styles.hintCard}>
            <Ionicons name="bed-outline" size={15} color={design.colors.primary} />
            <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
              Rent {rupeesFromPaise(selectedStay.rentPaise)}/mo · stay deposit on file{" "}
              {rupeesFromPaise(selectedStay.depositPaise)}
            </AppText>
          </View>
        ) : null}

        <AppInput
          label="Deposit amount received (Rs.)"
          placeholder="e.g. 12000"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        {formError && <Text style={styles.formError}>{formError}</Text>}
        <AppButton
          variant="primary"
          fullWidth
          loading={saving}
          onPress={recordDeposit}
          disabled={!selectedStay}
          style={{ marginTop: 8 }}
        >
          Save Deposit
        </AppButton>
      </Sheet>

      {/* Stay picker */}
      <Sheet visible={stayPickerOpen} onClose={() => setStayPickerOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={{ marginBottom: 4 }}>
          Select tenant stay
        </AppText>
        <AppText variant="caption" color={design.colors.textSecondary} style={{ marginBottom: 10 }}>
          Only stays without a deposit record are listed.
        </AppText>
        <ScrollView style={{ maxHeight: 440 }}>
          {availableStays.map((stay) => {
            const active = stay.stayId === selectedStay?.stayId;
            return (
              <TouchableOpacity
                key={stay.stayId}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => chooseStay(stay)}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "700" }} numberOfLines={1}>
                    {stay.tenantName}
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                    Room {stay.roomNumber} · Bed {stay.bedLabel} · {stay.propertyName}
                  </AppText>
                </View>
                {active && <Ionicons name="checkmark-circle" size={19} color={design.colors.primary} />}
              </TouchableOpacity>
            );
          })}
          {availableStays.length === 0 && (
            <AppText variant="bodySmall" color={design.colors.textMuted} style={{ paddingVertical: 14 }}>
              Every active stay already has a deposit record.
            </AppText>
          )}
        </ScrollView>
      </Sheet>

      {/* Closed record actions */}
      <Sheet visible={!!actionDeposit} onClose={() => setActionDeposit(null)}>
        {actionDeposit ? (
          <>
            <AppText variant="h4" color={design.colors.textPrimary}>
              Deposit record
            </AppText>
            <View style={styles.detailCard}>
              <DetailRow label="Tenant" value={stays[actionDeposit.stay_id]?.tenantName ?? "Tenant"} />
              <DetailRow label="Deposit" value={rupeesFromPaise(actionDeposit.amount_paise)} />
              <DetailRow label="Deductions" value={rupeesFromPaise(actionDeposit.deductions_paise)} />
              <DetailRow
                label="Refunded"
                value={rupeesFromPaise(
                  Math.max(0, actionDeposit.amount_paise - actionDeposit.deductions_paise)
                )}
              />
              <DetailRow label="Status" value={STATUS_META[actionDeposit.status]?.label ?? actionDeposit.status} />
              <DetailRow label="Recorded" value={prettyDate(actionDeposit.created_at)} last />
            </View>
            {actionDeposit.notes ? (
              <View style={styles.notesCard}>
                <Ionicons name="document-text-outline" size={15} color={design.colors.textSecondary} />
                <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
                  {actionDeposit.notes}
                </AppText>
              </View>
            ) : null}
            <AppButton
              variant="ghost"
              fullWidth
              icon="trash-outline"
              onPress={() => deleteDeposit(actionDeposit)}
              style={{ marginTop: 8 }}
            >
              Void Record
            </AppButton>
          </>
        ) : null}
      </Sheet>

      <ConfirmDialog
        visible={!!refundTarget}
        title="Refund deposit?"
        message={
          refundTarget
            ? `Mark ${rupeesFromPaise(refundTarget.amount_paise - refundTarget.deductions_paise)} as refunded to ${
                stays[refundTarget.stay_id]?.tenantName ?? "the tenant"
              }.`
            : ""
        }
        confirmLabel="Mark refunded"
        onCancel={() => setRefundTarget(null)}
        onConfirm={() => refundTarget && refundDeposit(refundTarget)}
      />

      <ConfirmDialog
        visible={!!settleTarget}
        title="Settle against dues?"
        message={
          settleTarget
            ? "Outstanding invoices for this stay will be paid from the deposit first. Any remainder is marked refundable."
            : ""
        }
        confirmLabel="Settle deposit"
        onCancel={() => setSettleTarget(null)}
        onConfirm={() => settleTarget && settleDeposit(settleTarget)}
      />
    </View>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tint,
  bg,
}: {
  icon: string;
  label: string;
  value: string | number;
  tint: string;
  bg: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={15} color={tint} />
      </View>
      <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
        {label}
      </AppText>
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

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
      <AppText variant="caption" color={design.colors.textSecondary}>
        {label}
      </AppText>
      <AppText variant="bodySmall" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  hero: {
    backgroundColor: design.colors.primary,
    paddingHorizontal: 16,
    paddingTop: 12,
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
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.72)",
    marginBottom: 1,
  },
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
  heroAmountLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.7)",
  },
  heroAmountValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
    marginTop: 3,
    letterSpacing: -0.4,
  },
  heroAmountSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.74)",
    marginTop: 2,
  },
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
  recordCtaText: { color: design.colors.primary, fontWeight: "800", fontSize: 13 },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 100 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: {
    width: "48.3%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 12,
    ...getShadow("sm"),
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },

  filterChips: { gap: 6, paddingBottom: 14 },
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
    gap: 10,
    ...getShadow("sm"),
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  amountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  actions: { flexDirection: "row", gap: 8 },
  secondaryAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: design.colors.primaryLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  primaryAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: design.colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  archiveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
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
  hintCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: design.colors.primaryLight,
    marginBottom: 10,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  optionActive: { backgroundColor: design.colors.primaryLight },
  detailCard: {
    borderWidth: 1,
    borderColor: design.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: design.colors.border,
    gap: 10,
  },
  notesCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderRadius: 10,
    backgroundColor: design.colors.surfaceVariant,
    marginBottom: 6,
  },
  formError: { color: design.colors.danger, marginTop: 6, textAlign: "center", fontSize: 12 },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
