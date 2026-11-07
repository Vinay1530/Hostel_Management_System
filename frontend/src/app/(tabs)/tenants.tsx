import { api, rupeesFromPaise } from "@/lib/api";
import { usePg } from "@/lib/pg";
import { useAuth } from "@/lib/auth";
import { design, getShadow } from "@/lib/design";
import { Sheet } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type Tenant = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  stays: {
    id: string;
    bed_id: string;
    start_date: string | null;
    agreed_rent_paise: number;
    deposit_paise: number;
    active: boolean;
  }[];
};

type GridBed = {
  id: string;
  label: string;
  status: "occupied" | "vacant" | "maintenance";
  tenant_id: string | null;
  tenant_name?: string | null;
};

type GridRoom = { id: string; number: string; beds: GridBed[] };
type GridFloor = { id: string; name: string; rooms: GridRoom[] };
type GridProperty = { id: string; name: string; floors: GridFloor[] };

type Location = {
  propertyId: string;
  propertyName: string;
  floorId: string;
  floorName: string;
  roomId: string;
  roomNumber: string;
  bedId: string;
  bedLabel: string;
};

type Contact = {
  user_id: string;
  name: string;
  room_number: string | null;
  property_id: string;
  property_name: string;
};

type Draft = {
  full_name: string;
  phone: string;
  email: string;
  id_number: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notes: string;
  building: string | null;
  room: string | null;
  bed: string | null;
  start_date: string;
  rent: string;
  deposit: string;
};

const EMPTY_DRAFT: Draft = {
  full_name: "",
  phone: "",
  email: "",
  id_number: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  notes: "",
  building: null,
  room: null,
  bed: null,
  start_date: new Date().toISOString().slice(0, 10),
  rent: "",
  deposit: "",
};

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Tenants() {
  const { propertyId } = usePg();
  const { role } = useAuth();
  const router = useRouter();

  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [properties, setProperties] = useState<GridProperty[]>([]);
  const [locations, setLocations] = useState<Record<string, Location>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [roomFilter, setRoomFilter] = useState("__all__");

  const [addOpen, setAddOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const q = propertyId ? `?property_id=${propertyId}` : "";
      const [tenantRes, gridRes, convoRes] = await Promise.allSettled([
        api.get<Tenant[]>(`/tenants${q}`),
        api.get<{ properties: GridProperty[] }>("/occupancy-grid"),
        api.get<{ contacts: Contact[] }>("/conversations"),
      ]);

      if (tenantRes.status === "fulfilled") setTenants(tenantRes.value);
      else setError((tenantRes.reason as any)?.message ?? "Failed to load tenants");

      if (gridRes.status === "fulfilled") {
        const props = gridRes.value.properties ?? [];
        setProperties(props);
        const map: Record<string, Location> = {};
        for (const prop of props)
          for (const floor of prop.floors ?? [])
            for (const room of floor.rooms ?? [])
              for (const bed of room.beds ?? []) {
                if (!bed.tenant_id) continue;
                map[bed.tenant_id] = {
                  propertyId: prop.id,
                  propertyName: prop.name,
                  floorId: floor.id,
                  floorName: floor.name,
                  roomId: room.id,
                  roomNumber: room.number,
                  bedId: bed.id,
                  bedLabel: bed.label,
                };
              }
        setLocations(map);
      }

      if (convoRes.status === "fulfilled") setContacts(convoRes.value.contacts ?? []);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const roomOptions = useMemo(() => {
    const rooms = new Set<string>();
    (tenants ?? []).forEach((t) => {
      const loc = locations[t.id];
      if (loc) rooms.add(loc.roomNumber);
    });
    return Array.from(rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [tenants, locations]);

  const filtered = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return (tenants ?? []).filter((t) => {
      if (roomFilter !== "__all__") {
        const loc = locations[t.id];
        if (!loc || loc.roomNumber !== roomFilter) return false;
      }
      if (!query) return true;
      const loc = locations[t.id];
      return (
        t.full_name.toLowerCase().includes(query) ||
        t.phone.includes(query) ||
        (loc ? `${loc.roomNumber} ${loc.bedLabel} ${loc.floorName} ${loc.propertyName}`.toLowerCase().includes(query) : false)
      );
    });
  }, [tenants, locations, roomFilter, searchText]);

  async function copyDefaultPassword() {
    try {
      await Clipboard.setStringAsync("password");
    } catch {
      // Clipboard can be unavailable in insecure web contexts.
    }
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  }

  function openChat(tenant: Tenant) {
    const contact = contacts.find(
      (c) => c.name.trim().toLowerCase() === tenant.full_name.trim().toLowerCase()
    );
    if (contact) {
      router.push({
        pathname: "/chat",
        params: { tenantUserId: contact.user_id, propertyId: contact.property_id },
      });
    } else {
      router.push("/chat");
    }
  }

  function openAdd() {
    setDraft({
      ...EMPTY_DRAFT,
      building: propertyId ?? (properties[0]?.id ?? null),
      start_date: new Date().toISOString().slice(0, 10),
    });
    setStep(1);
    setFormError(null);
    setAddOpen(true);
  }

  function nextStep() {
    setFormError(null);
    if (step === 1) {
      if (!draft.full_name.trim()) {
        setFormError("Enter the tenant's full name.");
        return;
      }
      if (!/^\d{10,15}$/.test(draft.phone)) {
        setFormError("Enter a valid 10-digit phone number.");
        return;
      }
    }
    setStep((s) => Math.min(3, s + 1));
  }

  const vacantRooms = useMemo(() => {
    const prop = properties.find((p) => p.id === draft.building);
    if (!prop) return [] as { id: string; label: string; floor: string; roomNumber: string; beds: GridBed[] }[];
    return (prop.floors ?? []).flatMap((floor) =>
      (floor.rooms ?? [])
        .map((room) => ({
          id: room.id,
          label: `Room ${room.number}`,
          floor: floor.name,
          roomNumber: room.number,
          beds: (room.beds ?? []).filter((b) => b.status === "vacant"),
        }))
        .filter((r) => r.beds.length > 0)
    );
  }, [properties, draft.building]);

  const selectedVacantRoom = vacantRooms.find((r) => r.id === draft.room) ?? null;

  async function saveTenant() {
    setFormError(null);
    if (draft.bed) {
      if (!draft.rent.trim()) {
        setFormError("Enter the agreed monthly rent for the selected bed.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.start_date.trim())) {
        setFormError("Move-in date must be YYYY-MM-DD.");
        return;
      }
    }

    setSaving(true);
    try {
      const created = await api.post<Tenant>("/tenants", {
        full_name: draft.full_name.trim(),
        phone: draft.phone,
        email: draft.email.trim() || undefined,
        id_number: draft.id_number.trim() || undefined,
        emergency_contact_name: draft.emergency_contact_name.trim() || undefined,
        emergency_contact_phone: draft.emergency_contact_phone.trim() || undefined,
        notes: draft.notes.trim() || undefined,
      });

      if (draft.bed) {
        await api.post("/stays", {
          tenant_id: created.id,
          bed_id: draft.bed,
          start_date: draft.start_date.trim(),
          agreed_rent_paise: (Number(draft.rent.replace(/\D/g, "")) || 0) * 100,
          deposit_paise: (Number(draft.deposit.replace(/\D/g, "")) || 0) * 100,
        });
      }

      setAddOpen(false);
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (e: any) {
      setFormError(e?.detail ?? e?.message ?? "Failed to add tenant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Sticky branded header + search */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>TENANT DIRECTORY</Text>
            <AppText variant="h2" color="#fff">
              Tenants
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.72)">
              {filtered.length} of {tenants?.length ?? 0} residents
            </AppText>
          </View>
          {role === "manager" || role === "owner" ? (
            <TouchableOpacity
              style={styles.heroIconBtn}
              onPress={() => router.push("/chat")}
              accessibilityLabel="Open chat"
            >
              <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.9}>
            <Ionicons name="person-add" size={17} color={design.colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={17} color={design.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone or room…"
            placeholderTextColor={design.colors.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText("")} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={design.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Room / floor chips */}
      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <FilterChip
            label="All rooms"
            active={roomFilter === "__all__"}
            onPress={() => setRoomFilter("__all__")}
          />
          {roomOptions.map((room) => (
            <FilterChip
              key={room}
              label={`Room ${room}`}
              active={roomFilter === room}
              onPress={() => setRoomFilter(room)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={design.colors.primary} />
        }
      >
        {loading && !tenants && (
          <View style={{ gap: 8 }}>
            <Skeleton height={72} radius={14} />
            <Skeleton height={72} radius={14} />
            <Skeleton height={72} radius={14} />
            <Skeleton height={72} radius={14} />
            <Skeleton height={72} radius={14} />
          </View>
        )}

        {tenants && filtered.length === 0 && (
          <EmptyState
            icon="people-outline"
            title={tenants.length === 0 ? "No tenants yet" : "No tenants match"}
            subtitle={
              tenants.length === 0
                ? "Add your first tenant and assign them a bed in one flow."
                : "Try a different name, phone number or room filter."
            }
            actionLabel={tenants.length === 0 ? "Add Tenant" : undefined}
            onAction={tenants.length === 0 ? openAdd : undefined}
          />
        )}

        <View style={{ gap: 10 }}>
          {filtered.map((tenant) => {
            const active = tenant.stays?.find((s) => s.active);
            const loc = locations[tenant.id];
            return (
              <TouchableOpacity
                key={tenant.id}
                style={styles.tenantCard}
                activeOpacity={0.9}
                onPress={() => router.push(`/tenant-profile/${tenant.id}`)}
              >
                <AppAvatar initials={initials(tenant.full_name) || "T"} size={42} variant="primary" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nameRow}>
                    <AppText variant="h4" color={design.colors.textPrimary} numberOfLines={1} style={{ flex: 1 }}>
                      {tenant.full_name}
                    </AppText>
                    <AppBadge variant={active ? "success" : "neutral"}>
                      {active ? "Active" : "No stay"}
                    </AppBadge>
                  </View>

                  <View style={styles.metaRow}>
                    <Ionicons name="bed-outline" size={12} color={design.colors.textMuted} />
                    <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                      {loc
                        ? `Room ${loc.roomNumber} · Bed ${loc.bedLabel}`
                        : active
                          ? "Bed assigned"
                          : "Not assigned"}
                      {loc ? ` · ${loc.propertyName}` : ""}
                    </AppText>
                  </View>

                  <View style={styles.metaRow}>
                    <Ionicons name="call-outline" size={12} color={design.colors.textMuted} />
                    <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                      {tenant.phone}
                    </AppText>
                    {active ? (
                      <>
                        <Text style={styles.dot}>·</Text>
                        <AppText variant="caption" color={design.colors.textSecondary}>
                          {rupeesFromPaise(active.agreed_rent_paise)}/mo
                        </AppText>
                      </>
                    ) : null}
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.messageBtn}
                  onPress={() => openChat(tenant)}
                  accessibilityLabel={`Message ${tenant.full_name}`}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={design.colors.primary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {/* Multi-step add tenant sheet */}
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)}>
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <AppText variant="h3" color={design.colors.textPrimary}>
              Add Tenant
            </AppText>
            <AppText variant="caption" color={design.colors.textSecondary}>
              Step {step} of 3 ·{" "}
              {step === 1 ? "Personal details" : step === 2 ? "ID & contacts" : "Room & deposit"}
            </AppText>
          </View>
          <TouchableOpacity onPress={() => setAddOpen(false)} hitSlop={8}>
            <Ionicons name="close" size={22} color={design.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.stepTrack}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={[styles.stepSegment, n <= step && styles.stepSegmentActive]} />
          ))}
        </View>

        <ScrollView style={{ maxHeight: 430 }} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <View style={{ gap: 2 }}>
              <AppInput
                label="Full name"
                placeholder="e.g. Priya Sharma"
                value={draft.full_name}
                onChangeText={(v) => setDraft({ ...draft, full_name: v })}
              />
              <AppInput
                label="Phone"
                placeholder="10-digit mobile number"
                keyboardType="phone-pad"
                value={draft.phone}
                onChangeText={(v) => setDraft({ ...draft, phone: v.replace(/\D/g, "") })}
              />
              <AppInput
                label="Email (optional)"
                placeholder="name@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={draft.email}
                onChangeText={(v) => setDraft({ ...draft, email: v })}
              />
              <TouchableOpacity
                style={styles.helperCard}
                onPress={copyDefaultPassword}
                activeOpacity={0.85}
                accessibilityLabel="Copy default tenant password"
              >
                <Ionicons
                  name={passwordCopied ? "checkmark-circle" : "information-circle-outline"}
                  size={16}
                  color={passwordCopied ? design.colors.success : design.colors.primary}
                />
                <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
                  Default password:{" "}
                  <Text style={{ fontWeight: "800", color: design.colors.primary }}>password</Text>
                  {" "}— {passwordCopied ? "copied!" : "tap to copy"}
                </AppText>
                <Ionicons
                  name={passwordCopied ? "checkmark" : "copy-outline"}
                  size={14}
                  color={passwordCopied ? design.colors.success : design.colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 2 }}>
              <AppInput
                label="ID proof number (optional)"
                placeholder="Aadhaar / driving licence / passport"
                value={draft.id_number}
                onChangeText={(v) => setDraft({ ...draft, id_number: v })}
              />
              <AppInput
                label="Emergency contact name"
                placeholder="e.g. Ramesh Sharma"
                value={draft.emergency_contact_name}
                onChangeText={(v) => setDraft({ ...draft, emergency_contact_name: v })}
              />
              <AppInput
                label="Emergency contact phone"
                placeholder="10-digit mobile number"
                keyboardType="phone-pad"
                value={draft.emergency_contact_phone}
                onChangeText={(v) =>
                  setDraft({ ...draft, emergency_contact_phone: v.replace(/\D/g, "") })
                }
              />
              <AppInput
                label="Notes (optional)"
                placeholder="Anything else worth remembering"
                multiline
                numberOfLines={3}
                value={draft.notes}
                onChangeText={(v) => setDraft({ ...draft, notes: v })}
              />
              <View style={styles.helperCard}>
                <Ionicons name="cloud-upload-outline" size={16} color={design.colors.primary} />
                <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
                  ID document uploads can be added later from the tenant profile.
                </AppText>
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={{ gap: 2 }}>
              <FieldLabel>BUILDING (OPTIONAL)</FieldLabel>
              <SelectRow
                value={draft.building}
                placeholder="Select building"
                options={properties.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) =>
                  setDraft({ ...draft, building: v, room: null, bed: null })
                }
              />

              {draft.building ? (
                <>
                  <FieldLabel>ROOM</FieldLabel>
                  <SelectRow
                    value={draft.room}
                    placeholder={vacantRooms.length ? "Select a room with vacant beds" : "No vacant beds"}
                    options={vacantRooms.map((r) => ({
                      value: r.id,
                      label: `${r.floor} · ${r.label}`,
                    }))}
                    onChange={(v) => setDraft({ ...draft, room: v, bed: null })}
                  />
                </>
              ) : null}

              {selectedVacantRoom ? (
                <>
                  <FieldLabel>BED</FieldLabel>
                  <SelectRow
                    value={draft.bed}
                    placeholder="Select a bed"
                    options={selectedVacantRoom.beds.map((b) => ({ value: b.id, label: `Bed ${b.label}` }))}
                    onChange={(v) => setDraft({ ...draft, bed: v })}
                  />
                </>
              ) : null}

              {draft.bed ? (
                <>
                  <AppInput
                    label="Move-in date (YYYY-MM-DD)"
                    value={draft.start_date}
                    onChangeText={(v) => setDraft({ ...draft, start_date: v })}
                  />
                  <AppInput
                    label="Agreed rent (Rs./month)"
                    placeholder="e.g. 6500"
                    keyboardType="numeric"
                    value={draft.rent}
                    onChangeText={(v) => setDraft({ ...draft, rent: v })}
                  />
                  <AppInput
                    label="Security deposit (Rs.)"
                    placeholder="e.g. 12000"
                    keyboardType="numeric"
                    value={draft.deposit}
                    onChangeText={(v) => setDraft({ ...draft, deposit: v })}
                  />
                </>
              ) : (
                <View style={styles.helperCard}>
                  <Ionicons name="bed-outline" size={16} color={design.colors.primary} />
                  <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
                    No bed selected — you can assign one any time from the occupancy map.
                  </AppText>
                </View>
              )}
            </View>
          )}

          {formError && <Text style={styles.formError}>{formError}</Text>}
        </ScrollView>

        <View style={styles.sheetFooter}>
          {step > 1 ? (
            <AppButton variant="ghost" size="md" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }}>
              Back
            </AppButton>
          ) : null}
          {step < 3 ? (
            <AppButton variant="primary" size="md" icon="arrow-forward" iconPosition="right" onPress={nextStep} style={{ flex: 1.4 }}>
              Continue
            </AppButton>
          ) : (
            <AppButton variant="primary" size="md" loading={saving} onPress={saveTenant} style={{ flex: 1.4 }}>
              Save Tenant
            </AppButton>
          )}
        </View>
      </Sheet>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <AppText
        variant="caption"
        color={active ? "#fff" : design.colors.textSecondary}
        style={{ fontWeight: "700" }}
      >
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <AppText variant="label" color={design.colors.textSecondary} style={{ marginTop: 8, marginBottom: 4 }}>
      {children}
    </AppText>
  );
}

function SelectRow({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <TouchableOpacity style={styles.selectBtn} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <AppText
          variant="body"
          color={current ? design.colors.textPrimary : design.colors.textMuted}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {current?.label ?? placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={16} color={design.colors.textMuted} />
      </TouchableOpacity>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={{ marginBottom: 10 }}>
          {placeholder}
        </AppText>
        {options.length === 0 && (
          <AppText variant="bodySmall" color={design.colors.textMuted} style={{ paddingVertical: 12 }}>
            Nothing available here.
          </AppText>
        )}
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.selectOption, option.value === value && styles.selectOptionActive]}
            onPress={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            <AppText
              variant="body"
              color={design.colors.textPrimary}
              style={{ flex: 1, fontWeight: option.value === value ? "700" : "500" }}
              numberOfLines={1}
            >
              {option.label}
            </AppText>
            {option.value === value && (
              <Ionicons name="checkmark-circle" size={19} color={design.colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  // Hero
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
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -60,
    right: -30,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, color: "rgba(255,255,255,0.72)", marginBottom: 3 },
  heroIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...getShadow("sm"),
  },
  searchInput: { flex: 1, color: design.colors.textPrimary, fontSize: 14, paddingVertical: 10 },

  // Chips
  chipsWrap: { paddingVertical: 12 },
  chipsRow: { paddingHorizontal: 16, gap: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: design.colors.primary, borderColor: design.colors.primary },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 100 },

  // Tenant cards
  tenantCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    ...getShadow("sm"),
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { color: design.colors.textMuted, fontSize: 11 },
  messageBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  error: { color: design.colors.danger, marginTop: 16, textAlign: "center", fontSize: 13 },

  // Sheet
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  stepTrack: { flexDirection: "row", gap: 6, marginBottom: 14 },
  stepSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: design.colors.surfaceVariant,
  },
  stepSegmentActive: { backgroundColor: design.colors.primary },
  helperCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: design.colors.primaryLight,
    marginTop: 8,
  },
  selectBtn: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    marginBottom: 2,
  },
  selectOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  selectOptionActive: { backgroundColor: design.colors.primaryLight },
  sheetFooter: { flexDirection: "row", gap: 10, marginTop: 14 },
  formError: { color: design.colors.danger, marginTop: 10, textAlign: "center", fontSize: 12 },
});
