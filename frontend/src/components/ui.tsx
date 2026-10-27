import { usePg } from "@/lib/pg";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type Option = { value: string; label: string; sublabel?: string };

export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function Select({
  value,
  options,
  onChange,
  placeholder = "Select…",
  title,
  compact,
}: {
  value: string | null;
  options: Option[];
  onChange: (v: string) => void;
  placeholder?: string;
  title?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <TouchableOpacity style={[styles.selectBtn, compact && styles.selectBtnCompact]} onPress={() => setOpen(true)}>
        <Text style={[styles.selectText, !current && { color: theme.textLight }]} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.textLight} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {title && <Text style={styles.sheetTitle}>{title}</Text>}
            <ScrollView style={{ maxHeight: 360 }}>
              {options.length === 0 && <Text style={styles.emptyText}>Nothing to pick yet</Text>}
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.optionRow, active && styles.optionRowActive]}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionText, active && { color: theme.accentText, fontWeight: "800" }]}>{o.label}</Text>
                      {o.sublabel ? <Text style={styles.optionSub}>{o.sublabel}</Text> : null}
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={18} color={theme.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.cancelRow} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.centerBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
            <TouchableOpacity style={[styles.dialogBtn, styles.dialogCancel]} onPress={onCancel} disabled={busy}>
              <Text style={[styles.dialogBtnText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dialogBtn, { backgroundColor: theme.danger }]}
              onPress={onConfirm}
              disabled={busy}
            >
              <Text style={[styles.dialogBtnText, { color: "#fff" }]}>{busy ? "Working…" : confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ActionSheet({
  visible,
  title,
  message,
  actions,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  actions: { label: string; icon?: string; destructive?: boolean; onPress: () => void }[];
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {message ? <Text style={styles.sheetMessage}>{message}</Text> : null}
          {actions.map((a) => (
            <TouchableOpacity
              key={a.label}
              style={styles.optionRow}
              onPress={() => {
                onCancel();
                setTimeout(a.onPress, 50);
              }}
            >
              {a.icon ? (
                <Ionicons name={a.icon as any} size={18} color={a.destructive ? theme.danger : theme.text} style={{ marginRight: 10 }} />
              ) : null}
              <Text style={[styles.optionText, a.destructive && { color: theme.danger }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelRow} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

export function PgSelector({ compact }: { compact?: boolean }) {
  const { properties, propertyId, setPropertyId } = usePg();
  const options: Option[] = [
    { value: "__all__", label: "All PGs", sublabel: "Aggregated stats across every PG" },
    ...properties.map((p) => ({ value: p.id, label: p.name, sublabel: p.address ?? undefined })),
  ];
  return (
    <Select
      value={propertyId ?? "__all__"}
      options={options}
      onChange={(v) => setPropertyId(v === "__all__" ? null : v)}
      title="Viewing"
      compact={compact}
    />
  );
}

export function TopBar() {
  return (
    <View style={styles.topBar}>
      <View style={styles.brand}>
        <View style={styles.brandDot}>
          <Ionicons name="bed" size={16} color="#fff" />
        </View>
        <Text style={styles.brandText}>PG Rent</Text>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ maxWidth: 220 }}>
        <PgSelector compact />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 14,
    backgroundColor: theme.bg,
    gap: 10,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandDot: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { fontSize: 17, fontWeight: "800", color: theme.text },
  backdrop: { flex: 1, backgroundColor: "#0f1e2944", justifyContent: "flex-end" },
  centerBackdrop: {
    flex: 1,
    backgroundColor: "#0f1e2955",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    paddingBottom: 26,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 6,
  },
  sheetTitle: { fontSize: 15, fontWeight: "800", color: theme.textLight, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  sheetMessage: { fontSize: 13, color: theme.textLight, marginBottom: 8 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  optionRowActive: { backgroundColor: theme.accentSoft },
  optionText: { fontSize: 15, fontWeight: "600", color: theme.text },
  optionSub: { fontSize: 11, color: theme.textLight, marginTop: 2 },
  emptyText: { fontSize: 13, color: theme.textLight, padding: 12 },
  cancelRow: { alignItems: "center", padding: 12, marginTop: 6, borderRadius: 14, backgroundColor: theme.chipBg },
  cancelText: { fontSize: 14, fontWeight: "800", color: theme.textLight },
  dialog: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    gap: 10,
  },
  dialogTitle: { fontSize: 18, fontWeight: "800", color: theme.text },
  dialogMessage: { fontSize: 13, color: theme.textLight, lineHeight: 20 },
  dialogBtn: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  dialogCancel: { backgroundColor: theme.chipBg },
  dialogBtnText: { fontSize: 14, fontWeight: "800" },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  selectBtnCompact: { paddingVertical: 7, paddingHorizontal: 12 },
  selectText: { fontSize: 13, fontWeight: "700", color: theme.text, flexShrink: 1 },
});
