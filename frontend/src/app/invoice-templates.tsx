import { api } from "@/lib/api";
import { design, getShadow } from "@/lib/design";
import { ConfirmDialog, Sheet } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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
  AppInput,
  Skeleton,
} from "@/components/ui-components";

type InvoiceTemplate = {
  id: string;
  name: string;
  template_data: any;
  is_default: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type TemplateForm = {
  name: string;
  brand_name: string;
  brand_color: string;
  tax_label: string;
  tax_number: string;
  footer_note: string;
  payment_note: string;
};

const BRAND_COLORS = [
  { value: "#4F46E5", label: "Indigo" },
  { value: "#0284C7", label: "Sky" },
  { value: "#0D9488", label: "Teal" },
  { value: "#334155", label: "Slate" },
  { value: "#E11D48", label: "Rose" },
  { value: "#B45309", label: "Amber" },
];

const EMPTY_FORM: TemplateForm = {
  name: "",
  brand_name: "",
  brand_color: "#4F46E5",
  tax_label: "GSTIN",
  tax_number: "",
  footer_note: "Thank you for paying on time.",
  payment_note: "Pay via UPI or bank transfer. Include the invoice number in the reference.",
};

function dataString(template: InvoiceTemplate | null, key: string, fallback: string): string {
  const value = template?.template_data?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function InvoiceTemplates() {
  const [templates, setTemplates] = useState<InvoiceTemplate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceTemplate | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      setTemplates(await api.get<InvoiceTemplate[]>("/invoice-templates"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setMakeDefault((templates ?? []).length === 0);
    setFormError(null);
    setEditorOpen(true);
  }

  function openEdit(template: InvoiceTemplate) {
    setEditing(template);
    setForm({
      name: template.name,
      brand_name: dataString(template, "brand_name", ""),
      brand_color: dataString(template, "brand_color", "#4F46E5"),
      tax_label: dataString(template, "tax_label", "GSTIN"),
      tax_number: dataString(template, "tax_number", ""),
      footer_note: dataString(template, "footer_note", EMPTY_FORM.footer_note),
      payment_note: dataString(template, "payment_note", EMPTY_FORM.payment_note),
    });
    setMakeDefault(template.is_default);
    setFormError(null);
    setEditorOpen(true);
  }

  async function saveTemplate() {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("Give this template a name.");
      return;
    }
    const template_data = {
      brand_name: form.brand_name.trim(),
      brand_color: form.brand_color,
      tax_label: form.tax_label.trim(),
      tax_number: form.tax_number.trim(),
      footer_note: form.footer_note.trim(),
      payment_note: form.payment_note.trim(),
    };

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/invoice-templates/${editing.id}`, {
          ...editing,
          name: form.name.trim(),
          template_data,
          is_default: makeDefault || editing.is_default,
        });
        if (makeDefault && !editing.is_default) {
          await api.patch(`/invoice-templates/${editing.id}`, {
            ...editing,
            name: form.name.trim(),
            template_data,
            is_default: true,
          });
        }
      } else {
        const created = await api.post<InvoiceTemplate>("/invoice-templates", {
          name: form.name.trim(),
          template_data,
        });
        if (makeDefault) {
          await api.patch(`/invoice-templates/${created.id}`, {
            ...created,
            template_data,
            is_default: true,
          });
        }
      }
      setEditorOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e?.detail ?? e?.message ?? "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(template: InvoiceTemplate) {
    if (template.is_default) return;
    try {
      await api.patch(`/invoice-templates/${template.id}`, {
        ...template,
        is_default: true,
      });
      await load();
    } catch (e: any) {
      Alert.alert("Failed", e?.detail ?? e?.message ?? "Could not set default");
    }
  }

  async function deleteTemplate(template: InvoiceTemplate) {
    setDeleteTarget(null);
    try {
      await api.delete(`/invoice-templates/${template.id}`);
      await load();
    } catch (e: any) {
      Alert.alert("Delete failed", e?.detail ?? e?.message ?? "Could not delete template");
    }
  }

  const defaultTemplate = (templates ?? []).find((t) => t.is_default) ?? null;

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>INVOICE STUDIO</Text>
            <AppText variant="h2" color="#fff">
              Invoice Templates
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.72)">
              Brand every rent bill with your PG identity
            </AppText>
          </View>
          <TouchableOpacity style={styles.headerAction} onPress={openAdd} accessibilityLabel="Add template">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{templates?.length ?? 0}</Text>
            <Text style={styles.heroStatLabel}>TEMPLATES</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue} numberOfLines={1}>
              {defaultTemplate ? defaultTemplate.name : "None"}
            </Text>
            <Text style={styles.heroStatLabel}>DEFAULT</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.createCta} onPress={openAdd} activeOpacity={0.9}>
          <Ionicons name="document-text-outline" size={17} color={design.colors.primary} />
          <Text style={styles.createCtaText}>New Template</Text>
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
        {loading && !templates && (
          <View style={{ gap: 12 }}>
            <Skeleton height={190} radius={16} />
            <Skeleton height={190} radius={16} />
          </View>
        )}

        {templates && templates.length === 0 && (
          <EmptyState
            icon="document-text-outline"
            title="No invoice templates"
            subtitle="Create a branded template with your logo, tax number and payment note."
            actionLabel="Create Template"
            onAction={openAdd}
          />
        )}

        <View style={{ gap: 14 }}>
          {(templates ?? []).map((template) => {
            const color = dataString(template, "brand_color", "#4F46E5");
            const brand = dataString(template, "brand_name", template.name);
            const taxLabel = dataString(template, "tax_label", "GSTIN");
            const taxNumber = dataString(template, "tax_number", "");
            const paymentNote = dataString(template, "payment_note", "");
            return (
              <View key={template.id} style={styles.templateCard}>
                {/* Live preview */}
                <View style={[styles.preview, { borderColor: `${color}22` }]}>
                  <View style={[styles.previewStripe, { backgroundColor: color }]} />
                  <View style={styles.previewHead}>
                    <View style={[styles.previewLogo, { backgroundColor: `${color}14` }]}>
                      <Text style={[styles.previewLogoText, { color }]}>
                        {initials(brand) || "PG"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText
                        variant="body"
                        color={design.colors.textPrimary}
                        style={{ fontWeight: "800" }}
                        numberOfLines={1}
                      >
                        {brand || template.name}
                      </AppText>
                      <AppText variant="caption" color={design.colors.textMuted} numberOfLines={1}>
                        RENT INVOICE · AUG 2026
                      </AppText>
                    </View>
                    <View style={[styles.previewBadge, { backgroundColor: `${color}14` }]}>
                      <Text style={[styles.previewBadgeText, { color }]}>PAID</Text>
                    </View>
                  </View>

                  <View style={styles.previewRows}>
                    <PreviewRow label="Room rent · August" value="Rs. 8,500" />
                    <PreviewRow label="Electricity share" value="Rs. 450" />
                    <View style={[styles.previewDivider, { backgroundColor: `${color}22` }]} />
                    <PreviewRow label="Total due" value="Rs. 8,950" strong />
                  </View>

                  <View style={styles.previewFoot}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="caption" color={design.colors.textMuted} numberOfLines={1}>
                        {taxLabel}
                        {taxNumber ? ` · ${taxNumber}` : " · not set"}
                      </AppText>
                      <AppText
                        variant="caption"
                        color={design.colors.textSecondary}
                        numberOfLines={2}
                        style={{ marginTop: 2 }}
                      >
                        {paymentNote || "Add a payment note for tenants."}
                      </AppText>
                    </View>
                    <View style={[styles.qrPh, { borderColor: `${color}44` }]}>
                      <Ionicons name="qr-code-outline" size={24} color={color} />
                    </View>
                  </View>
                </View>

                {/* Card footer */}
                <View style={styles.templateMeta}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.templateNameRow}>
                      <AppText
                        variant="h4"
                        color={design.colors.textPrimary}
                        numberOfLines={1}
                        style={{ flexShrink: 1 }}
                      >
                        {template.name}
                      </AppText>
                      {template.is_default ? <AppBadge variant="success">Default</AppBadge> : null}
                    </View>
                    <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                      {template.is_default
                        ? "Used automatically for new invoices"
                        : "Custom template · not default"}
                    </AppText>
                  </View>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {!template.is_default && (
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => setDefault(template)}
                        accessibilityLabel="Set default template"
                      >
                        <Ionicons name="star-outline" size={17} color={design.colors.primary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => openEdit(template)}
                      accessibilityLabel="Edit template"
                    >
                      <Ionicons name="create-outline" size={17} color={design.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconBtn, { backgroundColor: design.colors.dangerLight }]}
                      onPress={() => setDeleteTarget(template)}
                      accessibilityLabel="Delete template"
                    >
                      <Ionicons name="trash-outline" size={16} color={design.colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.hintCard}>
          <Ionicons name="color-palette-outline" size={16} color={design.colors.primary} />
          <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
            Logo uploads and QR generation are coming soon. Templates currently control the invoice
            header, brand colour, tax details and footer notes.
          </AppText>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {/* Editor */}
      <Sheet visible={editorOpen} onClose={() => setEditorOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary}>
          {editing ? "Edit Template" : "New Invoice Template"}
        </AppText>
        <AppText variant="caption" color={design.colors.textSecondary} style={styles.sheetHint}>
          Changes appear on the preview card instantly.
        </AppText>

        <ScrollView style={{ maxHeight: 430 }} keyboardShouldPersistTaps="handled">
          <AppInput
            label="Template name"
            placeholder="e.g. Standard Rent Invoice"
            value={form.name}
            onChangeText={(v) => setForm({ ...form, name: v })}
          />
          <AppInput
            label="Brand / PG name"
            placeholder="e.g. Sunrise PG"
            value={form.brand_name}
            onChangeText={(v) => setForm({ ...form, brand_name: v })}
          />

          <AppText variant="label" color={design.colors.textSecondary} style={styles.fieldLabel}>
            BRAND COLOUR
          </AppText>
          <View style={styles.colorRow}>
            {BRAND_COLORS.map((color) => {
              const active = form.brand_color === color.value;
              return (
                <TouchableOpacity
                  key={color.value}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: color.value },
                    active && styles.colorSwatchActive,
                  ]}
                  onPress={() => setForm({ ...form, brand_color: color.value })}
                  accessibilityLabel={color.label}
                >
                  {active && <Ionicons name="checkmark" size={15} color="#fff" />}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 0.42 }}>
              <AppInput
                label="Tax label"
                placeholder="GSTIN"
                value={form.tax_label}
                onChangeText={(v) => setForm({ ...form, tax_label: v })}
              />
            </View>
            <View style={{ flex: 0.58 }}>
              <AppInput
                label="Tax number"
                placeholder="29ABCDE1234F1Z5"
                autoCapitalize="characters"
                value={form.tax_number}
                onChangeText={(v) => setForm({ ...form, tax_number: v })}
              />
            </View>
          </View>

          <AppInput
            label="Payment note"
            placeholder="UPI ID, bank details or payment instructions"
            multiline
            numberOfLines={2}
            value={form.payment_note}
            onChangeText={(v) => setForm({ ...form, payment_note: v })}
          />
          <AppInput
            label="Footer note"
            placeholder="A short thank-you or policy note"
            value={form.footer_note}
            onChangeText={(v) => setForm({ ...form, footer_note: v })}
          />

          <TouchableOpacity
            style={styles.defaultToggle}
            onPress={() => setMakeDefault(!makeDefault)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={makeDefault ? "checkbox" : "square-outline"}
              size={21}
              color={makeDefault ? design.colors.primary : design.colors.textMuted}
            />
            <View style={{ flex: 1 }}>
              <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
                Use as default template
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                Applied automatically when generating invoices
              </AppText>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {formError && <Text style={styles.formError}>{formError}</Text>}
        <AppButton
          variant="primary"
          fullWidth
          loading={saving}
          onPress={saveTemplate}
          style={{ marginTop: 10 }}
        >
          {editing ? "Save Changes" : "Create Template"}
        </AppButton>
      </Sheet>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete template?"
        message={deleteTarget ? `"${deleteTarget.name}" will be permanently removed.` : ""}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteTemplate(deleteTarget)}
      />
    </View>
  );
}

function PreviewRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.previewRow}>
      <AppText
        variant="caption"
        color={strong ? design.colors.textPrimary : design.colors.textSecondary}
        style={{ fontWeight: strong ? "800" : "500", flex: 1 }}
        numberOfLines={1}
      >
        {label}
      </AppText>
      <AppText
        variant={strong ? "body" : "caption"}
        color={design.colors.textPrimary}
        style={{ fontWeight: strong ? "800" : "600" }}
      >
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
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  heroStat: { flex: 1 },
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

  templateCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 12,
    ...getShadow("sm"),
  },
  preview: {
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: design.colors.background,
    padding: 12,
    overflow: "hidden",
  },
  previewStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  previewHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  previewLogo: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  previewLogoText: { fontSize: 14, fontWeight: "800" },
  previewBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  previewBadgeText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.6 },
  previewRows: { marginTop: 11, gap: 5 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewDivider: { height: 1, marginVertical: 3 },
  previewFoot: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },
  qrPh: {
    width: 44,
    height: 44,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  templateMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 11,
  },
  templateNameRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
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

  sheetHint: { marginBottom: 12, lineHeight: 19 },
  fieldLabel: { marginBottom: 6 },
  colorRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchActive: { borderWidth: 3, borderColor: design.colors.textPrimary },
  defaultToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 11,
    borderRadius: 11,
    backgroundColor: design.colors.background,
    borderWidth: 1,
    borderColor: design.colors.border,
    marginTop: 2,
    marginBottom: 8,
  },
  formError: { color: design.colors.danger, marginTop: 6, textAlign: "center", fontSize: 12 },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
