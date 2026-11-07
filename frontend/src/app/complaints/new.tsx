import { api } from "@/lib/api";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AppButton,
  AppText,
  AppInput,
} from "@/components/ui-components";

const CATEGORY_OPTIONS = [
  { value: "water", label: "Water", icon: "water-outline" },
  { value: "electricity", label: "Electricity", icon: "flash-outline" },
  { value: "wifi", label: "WiFi", icon: "wifi-outline" },
  { value: "food", label: "Food", icon: "restaurant-outline" },
  { value: "cleaning", label: "Cleaning", icon: "sparkles-outline" },
  { value: "maintenance", label: "Maintenance", icon: "construct-outline" },
  { value: "other", label: "Other", icon: "help-circle-outline" },
] as const;

const PRIORITY_OPTIONS = [
  {
    value: "low",
    label: "Low",
    description: "Can wait a few days",
    icon: "arrow-down-circle-outline",
    color: design.colors.textSecondary,
    bg: design.colors.surfaceVariant,
  },
  {
    value: "medium",
    label: "Medium",
    description: "Needs attention soon",
    icon: "remove-circle-outline",
    color: "#B45309",
    bg: design.colors.warningLight,
  },
  {
    value: "high",
    label: "High",
    description: "Urgent or unsafe",
    icon: "alert-circle-outline",
    color: design.colors.danger,
    bg: design.colors.dangerLight,
  },
] as const;

type Category = (typeof CATEGORY_OPTIONS)[number]["value"];
type Priority = (typeof PRIORITY_OPTIONS)[number]["value"];
type Photo = { uri: string; name: string; type: string; size?: number };

export default function ReportProblemScreen() {
  const router = useRouter();
  const accent = roleAccents.tenant;

  const [category, setCategory] = useState<Category>("maintenance");
  const [priority, setPriority] = useState<Priority>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choosePhotos() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const selected = result.assets.slice(0, 3 - photos.length);
      const valid = selected.filter(
        (asset) =>
          ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType ?? "") &&
          (asset.size === undefined || asset.size <= 5 * 1024 * 1024)
      );
      if (valid.length !== selected.length) {
        Alert.alert("Photo not added", "Choose JPEG, PNG, or WebP photos up to 5 MB each.");
      }
      setPhotos(
        (current) =>
          [
            ...current,
            ...valid.map((asset) => ({
              uri: asset.uri,
              name: asset.name,
              type: asset.mimeType ?? "image/jpeg",
              size: asset.size,
            })),
          ].slice(0, 3)
      );
    } catch (e: any) {
      Alert.alert("Could not choose photos", e?.message ?? "Please try again.");
    }
  }

  async function submit() {
    setError(null);
    if (!title.trim() || !description.trim()) {
      setError("Add a short title and a description of the problem.");
      return;
    }
    setBusy(true);
    try {
      const complaint = await api.uploadFiles<{ id: string }>("/complaints", photos, {
        category,
        title: title.trim(),
        description: description.trim(),
        priority,
      });
      router.replace({ pathname: "/complaints/[id]", params: { id: complaint.id } });
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Could not report the problem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: accent.accent }]}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>MAINTENANCE REQUEST</Text>
            <AppText variant="h2" color="#fff">
              Report a Problem
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.74)">
              Your PG manager will be notified instantly
            </AppText>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Category */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIcon, { backgroundColor: accent.accentSoft }]}>
              <Ionicons name="grid-outline" size={16} color={accent.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h4" color={design.colors.textPrimary}>
                What's the issue?
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                Pick the closest category
              </AppText>
            </View>
          </View>

          <View style={styles.categoryGrid}>
            {CATEGORY_OPTIONS.map((option) => {
              const active = category === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.categoryOption,
                    active && { backgroundColor: accent.accentSoft, borderColor: accent.accent },
                  ]}
                  onPress={() => setCategory(option.value)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={19}
                    color={active ? accent.accent : design.colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.categoryLabel,
                      active && { color: accent.accent, fontWeight: "800" },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Details */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIcon, { backgroundColor: accent.accentSoft }]}>
              <Ionicons name="create-outline" size={16} color={accent.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h4" color={design.colors.textPrimary}>
                Describe it
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                Specific details help resolve it faster
              </AppText>
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            <AppInput
              label="Title"
              placeholder="e.g. Bathroom tap leaking"
              maxLength={200}
              value={title}
              onChangeText={setTitle}
            />
            <AppInput
              label="Description"
              placeholder="When did it start? Which room or area is affected? Anything the manager should know?"
              multiline
              numberOfLines={5}
              maxLength={5000}
              value={description}
              onChangeText={setDescription}
            />
          </View>
        </View>

        {/* Priority */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIcon, { backgroundColor: accent.accentSoft }]}>
              <Ionicons name="flag-outline" size={16} color={accent.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h4" color={design.colors.textPrimary}>
                How urgent is it?
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                Urgent issues are surfaced first
              </AppText>
            </View>
          </View>

          <View style={styles.priorityRow}>
            {PRIORITY_OPTIONS.map((option) => {
              const active = priority === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.priorityOption,
                    active && { borderColor: option.color, backgroundColor: option.bg },
                  ]}
                  onPress={() => setPriority(option.value)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={option.icon as any} size={18} color={option.color} />
                  <Text style={[styles.priorityLabel, { color: option.color }]}>
                    {option.label}
                  </Text>
                  <Text style={styles.priorityDesc} numberOfLines={2}>
                    {option.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Photos */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIcon, { backgroundColor: accent.accentSoft }]}>
              <Ionicons name="camera-outline" size={16} color={accent.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h4" color={design.colors.textPrimary}>
                Photos
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                Optional · up to 3 images
              </AppText>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
          >
            {photos.map((photo) => (
              <View key={`${photo.uri}-${photo.name}`} style={styles.photoWrap}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                <TouchableOpacity
                  style={styles.removePhoto}
                  onPress={() =>
                    setPhotos((current) => current.filter((item) => item !== photo))
                  }
                  accessibilityLabel="Remove photo"
                >
                  <Ionicons name="close" size={13} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < 3 && (
              <TouchableOpacity
                style={[styles.addPhoto, { borderColor: accent.accent }]}
                onPress={choosePhotos}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={22} color={accent.accent} />
                <Text style={[styles.addPhotoText, { color: accent.accent }]}>
                  Add photo
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <AppButton
          variant="primary"
          fullWidth
          size="lg"
          loading={busy}
          onPress={submit}
          icon="send"
          iconPosition="right"
          style={{ backgroundColor: accent.accent, marginTop: 4 }}
        >
          Send Report
        </AppButton>

        <AppText
          variant="caption"
          color={design.colors.textMuted}
          style={{ textAlign: "center", marginTop: 10 }}
        >
          You'll get updates in the app as your complaint progresses.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  hero: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
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
    marginBottom: 2,
  },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 60, gap: 10 },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 14,
    ...getShadow("sm"),
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  categoryOption: {
    width: "31.4%",
    minHeight: 62,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: design.colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: design.colors.textSecondary,
  },

  priorityRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  priorityOption: {
    flex: 1,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: design.colors.background,
    padding: 10,
    alignItems: "center",
    gap: 3,
  },
  priorityLabel: { fontSize: 12, fontWeight: "800" },
  priorityDesc: {
    fontSize: 9,
    color: design.colors.textMuted,
    textAlign: "center",
    lineHeight: 13,
  },

  photoRow: { gap: 8, paddingTop: 12 },
  photoWrap: { position: "relative" },
  photo: { width: 88, height: 88, borderRadius: 12, backgroundColor: design.colors.surfaceVariant },
  removePhoto: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: design.colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  addPhoto: {
    width: 88,
    height: 88,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: design.colors.background,
  },
  addPhotoText: { fontSize: 9, fontWeight: "800" },

  error: { color: design.colors.danger, textAlign: "center", fontSize: 12 },
});
