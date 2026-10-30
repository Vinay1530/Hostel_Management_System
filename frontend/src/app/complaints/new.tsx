import { api } from "@/lib/api";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const categoryOptions = ["water", "electricity", "wifi", "food", "cleaning", "maintenance", "other"] as const;
const priorityOptions = ["low", "medium", "high"] as const;
type Photo = { uri: string; name: string; type: string; size?: number };

export default function ReportProblemScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof categoryOptions)[number]>("maintenance");
  const [priority, setPriority] = useState<(typeof priorityOptions)[number]>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);

  async function choosePhotos() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const selected = result.assets.slice(0, 3 - photos.length);
      const valid = selected.filter((asset) =>
        ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType ?? "")
        && (asset.size === undefined || asset.size <= 5 * 1024 * 1024)
      );
      if (valid.length !== selected.length) {
        Alert.alert("Photo not added", "Choose JPEG, PNG, or WebP photos up to 5 MB each.");
      }
      setPhotos((current) => [
        ...current,
        ...valid.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType ?? "image/jpeg",
          size: asset.size,
        })),
      ].slice(0, 3));
    } catch (e: any) {
      Alert.alert("Could not choose photos", e?.message ?? "Please try again.");
    }
  }

  async function submit() {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Missing details", "Enter a title and description.");
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
      Alert.alert("Could not report problem", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color={theme.accentText} />
        <Text style={styles.backText}>My complaints</Text>
      </Pressable>
      <Text style={styles.title}>Report a problem</Text>
      <Text style={styles.subtitle}>Your property manager will be notified.</Text>

      <Text style={styles.label}>Category</Text>
      <View style={styles.wrap}>
        {categoryOptions.map((item) => (
          <Pressable key={item} style={[styles.chip, category === item && styles.chipOn]} onPress={() => setCategory(item)}>
            <Text style={[styles.chipText, category === item && styles.chipTextOn]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} placeholder="Briefly describe the issue" maxLength={200} value={title} onChangeText={setTitle} />
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.descriptionInput]}
        placeholder="Add helpful details"
        multiline
        maxLength={5000}
        textAlignVertical="top"
        value={description}
        onChangeText={setDescription}
      />
      <Text style={styles.label}>Priority</Text>
      <View style={styles.wrap}>
        {priorityOptions.map((item) => (
          <Pressable key={item} style={[styles.chip, priority === item && styles.chipOn]} onPress={() => setPriority(item)}>
            <Text style={[styles.chipText, priority === item && styles.chipTextOn]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Photos · up to 3</Text>
      <View style={styles.photoRow}>
        {photos.map((photo) => (
          <Pressable key={`${photo.uri}-${photo.name}`} style={styles.photoChip} onPress={() => setPhotos((current) => current.filter((item) => item !== photo))}>
            <Ionicons name="image-outline" size={16} color={theme.accentText} />
            <Text style={styles.photoName} numberOfLines={1}>{photo.name}</Text>
            <Ionicons name="close-circle" size={16} color={theme.textLight} />
          </Pressable>
        ))}
      </View>
      {photos.length < 3 && (
        <Pressable style={styles.photoButton} onPress={choosePhotos}>
          <Ionicons name="add" size={18} color={theme.accentText} />
          <Text style={styles.photoButtonText}>Choose photos</Text>
        </Pressable>
      )}
      <Pressable style={[styles.submit, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send report</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 18, paddingBottom: 38 },
  back: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  backText: { color: theme.accentText, fontWeight: "700" },
  title: { color: theme.text, fontSize: 25, fontWeight: "800" },
  subtitle: { color: theme.textLight, fontSize: 13, marginTop: 3, marginBottom: 16 },
  label: { color: theme.text, fontSize: 13, fontWeight: "700", marginTop: 12, marginBottom: 7 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: "#fff" },
  chipOn: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { color: theme.text, fontSize: 12, textTransform: "capitalize" },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  input: { borderWidth: 1, borderColor: theme.border, backgroundColor: "#fff", borderRadius: 12, padding: 12, fontSize: 14, color: theme.text },
  descriptionInput: { minHeight: 115 },
  photoRow: { gap: 6 },
  photoChip: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff" },
  photoName: { flex: 1, color: theme.text, fontSize: 12 },
  photoButton: { flexDirection: "row", gap: 6, alignItems: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 10, alignSelf: "flex-start", backgroundColor: "#fff" },
  photoButtonText: { color: theme.accentText, fontWeight: "700", fontSize: 12 },
  submit: { backgroundColor: theme.accent, borderRadius: 12, alignItems: "center", padding: 14, marginTop: 22 },
  submitText: { color: "#fff", fontWeight: "800" },
});
