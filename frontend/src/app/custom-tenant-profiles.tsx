import { api } from "@/lib/api";
import { design, getShadow } from "@/lib/design";
import { ConfirmDialog, Sheet } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
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
  AppAvatar,
  EmptyState,
  AppInput,
  Skeleton,
} from "@/components/ui-components";

type CustomField = {
  id: string;
  tenant_id: string;
  field_name: string;
  field_value: string;
  field_type: string;
  created_at: string;
  updated_at: string;
};

type Tenant = {
  id: string;
  full_name: string;
  phone: string;
  stays: { id: string; bed_id: string; active: boolean }[];
};

type GridBed = { id: string; label: string };
type GridRoom = { id: string; number: string; beds: GridBed[] };
type GridFloor = { id: string; name: string; rooms: GridRoom[] };
type GridProperty = { id: string; name: string; floors: GridFloor[] };

type TenantOption = {
  id: string;
  name: string;
  phone: string;
  room: string;
  bed: string;
  property: string;
  active: boolean;
};

const FIELD_TYPES: { value: string; label: string; icon: string }[] = [
  { value: "text", label: "Text", icon: "text-outline" },
  { value: "number", label: "Number", icon: "calculator-outline" },
  { value: "date", label: "Date", icon: "calendar-outline" },
  { value: "boolean", label: "Yes / No", icon: "toggle-outline" },
];

function typeMeta(type: string) {
  return FIELD_TYPES.find((t) => t.value === type) ?? FIELD_TYPES[0];
}

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function CustomTenantProfiles() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [fields, setFields] = useState<CustomField[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [form, setForm] = useState({ field_name: "", field_value: "", field_type: "text" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomField | null>(null);

  const loadTenants = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const [tenantRes, gridRes] = await Promise.allSettled([
        api.get<Tenant[]>("/tenants"),
        api.get<{ properties: GridProperty[] }>("/occupancy-grid"),
      ]);

      const bedLocation: Record<string, { room: string; bed: string; property: string }> = {};
      if (gridRes.status === "fulfilled") {
        for (const property of gridRes.value.properties ?? [])
          for (const floor of property.floors ?? [])
            for (const room of floor.rooms ?? [])
              for (const bed of room.beds ?? [])
                bedLocation[bed.id] = {
                  room: room.number,
                  bed: bed.label,
                  property: property.name,
                };
      }

      if (tenantRes.status === "fulfilled") {
        const options: TenantOption[] = tenantRes.value.map((tenant) => {
          const active = tenant.stays?.find((s) => s.active);
          const loc = active ? bedLocation[active.bed_id] : undefined;
          return {
            id: tenant.id,
            name: tenant.full_name,
            phone: tenant.phone,
            room: loc?.room ?? "—",
            bed: loc?.bed ?? "—",
            property: loc?.property ?? "—",
            active: !!active,
          };
        });
        options.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
        setTenants(options);
        setTenantId((current) => current ?? options[0]?.id ?? null);
      } else {
        setError((tenantRes.reason as any)?.message ?? "Failed to load tenants");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTenants();
    }, [loadTenants])
  );

  const loadFields = useCallback(async (id: string) => {
    try {
      setFieldsLoading(true);
      setFields(await api.get<CustomField[]>(`/custom-tenant-fields/${id}`));
    } catch (e: any) {
      setFields([]);
      setError(e?.detail ?? e?.message ?? "Failed to load custom fields");
    } finally {
      setFieldsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tenantId) loadFields(tenantId);
    else setFields(null);
  }, [tenantId, loadFields]);

  const selectedTenant = tenants.find((t) => t.id === tenantId) ?? null;

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { text: 0, number: 0, date: 0, boolean: 0 };
    for (const field of fields ?? []) counts[field.field_type] = (counts[field.field_type] ?? 0) + 1;
    return counts;
  }, [fields]);

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.phone.includes(q) ||
        t.room.toLowerCase().includes(q)
    );
  }, [tenants, search]);

  function openAdd() {
    setEditing(null);
    setForm({ field_name: "", field_value: "", field_type: "text" });
    setFormError(null);
    setEditorOpen(true);
  }

  function openEdit(field: CustomField) {
    setEditing(field);
    setForm({
      field_name: field.field_name,
      field_value: field.field_value,
      field_type: field.field_type,
    });
    setFormError(null);
    setEditorOpen(true);
  }

  async function saveField() {
    setFormError(null);
    if (!tenantId) {
      setFormError("Select a tenant first.");
      return;
    }
    if (!form.field_name.trim()) {
      setFormError("Give the field a name.");
      return;
    }
    if (!form.field_value.trim()) {
      setFormError("Enter a value for this tenant.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/custom-tenant-fields/${editing.id}`, {
          ...editing,
          field_name: form.field_name.trim(),
          field_value: form.field_value.trim(),
          field_type: form.field_type,
        });
      } else {
        await api.post("/custom-tenant-fields", {
          tenant_id: tenantId,
          field_name: form.field_name.trim(),
          field_value: form.field_value.trim(),
          field_type: form.field_type,
        });
      }
      setEditorOpen(false);
      await loadFields(tenantId);
    } catch (e: any) {
      setFormError(e?.detail ?? e?.message ?? "Failed to save field");
    } finally {
      setSaving(false);
    }
  }

  async function deleteField(field: CustomField) {
    if (!tenantId) return;
    setDeleteTarget(null);
    try {
      await api.delete(`/custom-tenant-fields/${field.id}`);
      await loadFields(tenantId);
    } catch (e: any) {
      Alert.alert("Delete failed", e?.detail ?? e?.message ?? "Could not delete field");
    }
  }

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>EXTENDED PROFILES</Text>
            <AppText variant="h2" color="#fff">
              Custom Fields
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.72)">
              Store details beyond the standard tenant form
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={openAdd}
            disabled={!tenantId}
            accessibilityLabel="Add custom field"
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.tenantSelector}
          onPress={() => setTenantPickerOpen(true)}
          activeOpacity={0.9}
        >
          <AppAvatar
            initials={initials(selectedTenant?.name ?? "T") || "T"}
            size={38}
            variant="primary"
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText
              variant="caption"
              color="rgba(255,255,255,0.68)"
              style={{ fontWeight: "700" }}
            >
              TENANT
            </AppText>
            <AppText variant="body" color="#fff" style={{ fontWeight: "800" }} numberOfLines={1}>
              {selectedTenant?.name ?? "Select a tenant"}
            </AppText>
            {selectedTenant ? (
              <AppText
                variant="caption"
                color="rgba(255,255,255,0.72)"
                numberOfLines={1}
                style={{ fontSize: 10 }}
              >
                {selectedTenant.property} · Room {selectedTenant.room} · Bed {selectedTenant.bed}
              </AppText>
            ) : null}
          </View>
          <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              loadTenants();
              if (tenantId) loadFields(tenantId);
            }}
            tintColor={design.colors.primary}
          />
        }
      >
        {loading && tenants.length === 0 && <Skeleton height={120} radius={16} />}

        {!loading && tenants.length === 0 && (
          <EmptyState
            icon="people-outline"
            title="No tenants yet"
            subtitle="Add tenants first, then extend their profile with custom details."
          />
        )}

        {selectedTenant && (
          <>
            <View style={styles.statsRow}>
              <MiniStat label="Fields" value={fields?.length ?? 0} icon="albums-outline" />
              <MiniStat
                label="Text"
                value={typeCounts.text ?? 0}
                icon="text-outline"
                tint={design.colors.info}
                bg={design.colors.infoLight}
              />
              <MiniStat
                label="Other"
                value={(fields?.length ?? 0) - (typeCounts.text ?? 0)}
                icon="options-outline"
                tint="#B45309"
                bg={design.colors.warningLight}
              />
            </View>

            <View style={styles.sectionRow}>
              <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                PROFILE DETAILS
              </AppText>
              <TouchableOpacity onPress={openAdd} style={styles.inlineAdd}>
                <Ionicons name="add" size={14} color={design.colors.primary} />
                <AppText variant="caption" color={design.colors.primary} style={{ fontWeight: "800" }}>
                  Add field
                </AppText>
              </TouchableOpacity>
            </View>

            {fieldsLoading && !fields && (
              <View style={{ gap: 8 }}>
                <Skeleton height={70} radius={14} />
                <Skeleton height={70} radius={14} />
              </View>
            )}

            {fields && fields.length === 0 && (
              <EmptyState
                icon="create-outline"
                title="No custom fields yet"
                subtitle={`Add details like room preference, food choice or guardian info for ${selectedTenant.name}.`}
                actionLabel="Add First Field"
                onAction={openAdd}
              />
            )}

            <View style={{ gap: 8 }}>
              {(fields ?? []).map((field) => {
                const meta = typeMeta(field.field_type);
                return (
                  <View key={field.id} style={styles.fieldCard}>
                    <View style={[styles.typeIcon, { backgroundColor: design.colors.primaryLight }]}>
                      <Ionicons name={meta.icon as any} size={17} color={design.colors.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.fieldNameRow}>
                        <AppText
                          variant="caption"
                          color={design.colors.textMuted}
                          numberOfLines={1}
                          style={{ flex: 1, textTransform: "uppercase", letterSpacing: 0.4 }}
                        >
                          {field.field_name}
                        </AppText>
                        <AppBadge variant="neutral">{meta.label}</AppBadge>
                      </View>
                      <AppText
                        variant="body"
                        color={design.colors.textPrimary}
                        style={{ fontWeight: "700", marginTop: 2 }}
                        numberOfLines={2}
                      >
                        {field.field_value}
                      </AppText>
                    </View>
                    <TouchableOpacity
                      style={styles.fieldAction}
                      onPress={() => openEdit(field)}
                      accessibilityLabel={`Edit ${field.field_name}`}
                    >
                      <Ionicons name="create-outline" size={17} color={design.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.fieldAction, { backgroundColor: design.colors.dangerLight }]}
                      onPress={() => setDeleteTarget(field)}
                      accessibilityLabel={`Delete ${field.field_name}`}
                    >
                      <Ionicons name="trash-outline" size={16} color={design.colors.danger} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            <View style={styles.hintCard}>
              <Ionicons name="bulb-outline" size={16} color={design.colors.primary} />
              <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
                Custom fields appear on the tenant profile and are searchable from the directory.
                Use them for preferences, KYC extras or emergency notes.
              </AppText>
            </View>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {/* Tenant picker */}
      <Sheet visible={tenantPickerOpen} onClose={() => setTenantPickerOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={{ marginBottom: 10 }}>
          Select tenant
        </AppText>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={design.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone or room"
            placeholderTextColor={design.colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>
        <ScrollView style={{ maxHeight: 430 }}>
          {filteredTenants.map((tenant) => {
            const active = tenant.id === tenantId;
            return (
              <TouchableOpacity
                key={tenant.id}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => {
                  setTenantId(tenant.id);
                  setTenantPickerOpen(false);
                  setSearch("");
                }}
              >
                <AppAvatar initials={initials(tenant.name) || "T"} size={36} variant="primary" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText
                    variant="body"
                    color={design.colors.textPrimary}
                    style={{ fontWeight: "700" }}
                    numberOfLines={1}
                  >
                    {tenant.name}
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                    Room {tenant.room} · Bed {tenant.bed}
                    {tenant.active ? "" : " · no active stay"}
                  </AppText>
                </View>
                {active && <Ionicons name="checkmark-circle" size={19} color={design.colors.primary} />}
              </TouchableOpacity>
            );
          })}
          {filteredTenants.length === 0 && (
            <AppText variant="bodySmall" color={design.colors.textMuted} style={{ paddingVertical: 14 }}>
              No tenants match your search.
            </AppText>
          )}
        </ScrollView>
      </Sheet>

      {/* Editor */}
      <Sheet visible={editorOpen} onClose={() => setEditorOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary}>
          {editing ? "Edit field" : "Add custom field"}
        </AppText>
        <AppText variant="caption" color={design.colors.textSecondary} style={{ marginBottom: 12 }}>
          {selectedTenant ? `Saved to ${selectedTenant.name}'s profile.` : "Select a tenant first."}
        </AppText>

        <AppInput
          label="Field name"
          placeholder="e.g. Food preference"
          value={form.field_name}
          onChangeText={(v) => setForm({ ...form, field_name: v })}
        />

        <AppText variant="label" color={design.colors.textSecondary} style={styles.fieldLabel}>
          FIELD TYPE
        </AppText>
        <View style={styles.typeGrid}>
          {FIELD_TYPES.map((type) => {
            const active = form.field_type === type.value;
            return (
              <TouchableOpacity
                key={type.value}
                style={[styles.typeOption, active && styles.typeOptionActive]}
                onPress={() => {
                  setForm({
                    ...form,
                    field_type: type.value,
                    field_value:
                      type.value === "boolean" && !["Yes", "No"].includes(form.field_value)
                        ? "Yes"
                        : form.field_value,
                  });
                }}
              >
                <Ionicons
                  name={type.icon as any}
                  size={16}
                  color={active ? design.colors.primary : design.colors.textMuted}
                />
                <AppText
                  variant="caption"
                  color={active ? design.colors.primary : design.colors.textSecondary}
                  style={{ fontWeight: "800" }}
                >
                  {type.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        {form.field_type === "boolean" ? (
          <View style={styles.booleanRow}>
            {["Yes", "No"].map((option) => {
              const active = form.field_value === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.booleanOption, active && styles.booleanOptionActive]}
                  onPress={() => setForm({ ...form, field_value: option })}
                >
                  <Ionicons
                    name={active ? "checkmark-circle" : "ellipse-outline"}
                    size={18}
                    color={active ? design.colors.primary : design.colors.textMuted}
                  />
                  <AppText
                    variant="body"
                    color={design.colors.textPrimary}
                    style={{ fontWeight: "700" }}
                  >
                    {option}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <AppInput
            label="Value"
            placeholder={
              form.field_type === "date"
                ? "YYYY-MM-DD"
                : form.field_type === "number"
                  ? "e.g. 2"
                  : "Enter the detail"
            }
            keyboardType={form.field_type === "number" ? "numeric" : "default"}
            value={form.field_value}
            onChangeText={(v) => setForm({ ...form, field_value: v })}
          />
        )}

        {formError && <Text style={styles.formError}>{formError}</Text>}
        <AppButton
          variant="primary"
          fullWidth
          loading={saving}
          onPress={saveField}
          style={{ marginTop: 8 }}
        >
          {editing ? "Save Changes" : "Add Field"}
        </AppButton>
      </Sheet>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete field?"
        message={
          deleteTarget
            ? `"${deleteTarget.field_name}" will be removed from this tenant's profile.`
            : ""
        }
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteField(deleteTarget)}
      />
    </View>
  );
}

function MiniStat({
  label,
  value,
  icon,
  tint,
  bg,
}: {
  label: string;
  value: string | number;
  icon: string;
  tint?: string;
  bg?: string;
}) {
  return (
    <View style={styles.statCard}>
      <View
        style={[
          styles.statIcon,
          { backgroundColor: bg ?? design.colors.primaryLight },
        ]}
      >
        <Ionicons
          name={icon as any}
          size={15}
          color={tint ?? design.colors.primary}
        />
      </View>
      <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="h4" color={design.colors.textPrimary}>
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
  tenantSelector: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderRadius: 13,
    padding: 10,
  },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 100 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 11,
    ...getShadow("sm"),
  },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  inlineAdd: { flexDirection: "row", alignItems: "center", gap: 3 },

  fieldCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    ...getShadow("sm"),
  },
  typeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  fieldAction: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  hintCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: design.colors.primaryLight,
    marginTop: 14,
  },

  searchBar: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: design.colors.background,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: design.colors.textPrimary, fontSize: 14, paddingVertical: 8 },

  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  optionActive: { backgroundColor: design.colors.primaryLight },

  fieldLabel: { marginBottom: 6 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  typeOption: {
    width: "48.5%",
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  typeOptionActive: {
    backgroundColor: design.colors.primaryLight,
    borderColor: design.colors.primary,
  },
  booleanRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  booleanOption: {
    flex: 1,
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
  booleanOptionActive: {
    borderColor: design.colors.primary,
    backgroundColor: design.colors.primaryLight,
  },
  formError: { color: design.colors.danger, marginTop: 6, textAlign: "center", fontSize: 12 },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
