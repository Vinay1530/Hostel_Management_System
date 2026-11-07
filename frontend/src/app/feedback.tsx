import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { fetchPublicPg, type PublicBuilding } from "@/lib/public";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  AppInput,
  Skeleton,
} from "@/components/ui-components";

type Feedback = {
  id: string;
  organization_id: string;
  tenant_id: string;
  stay_id: string | null;
  property_id: string;
  rating: number;
  category: string;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

const FEEDBACK_CATEGORIES = [
  { value: "overall", label: "Overall", icon: "sparkles-outline" },
  { value: "cleanliness", label: "Cleanliness", icon: "water-outline" },
  { value: "food", label: "Food", icon: "restaurant-outline" },
  { value: "staff", label: "Staff", icon: "people-outline" },
  { value: "maintenance", label: "Maintenance", icon: "construct-outline" },
  { value: "location", label: "Location", icon: "location-outline" },
  { value: "value", label: "Value", icon: "pricetag-outline" },
];

const RATING_LABELS: Record<number, string> = {
  1: "Very poor",
  2: "Could be better",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

function categoryMeta(value: string) {
  return FEEDBACK_CATEGORIES.find((c) => c.value === value) ?? FEEDBACK_CATEGORIES[0];
}

function prettyDate(value: string): string {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function FeedbackScreen() {
  const router = useRouter();
  const { orgId } = useAuth();
  const accent = roleAccents.tenant;

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [buildings, setBuildings] = useState<PublicBuilding[]>([]);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [category, setCategory] = useState("overall");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const [feedbackRes, pgRes] = await Promise.allSettled([
        api.get<Feedback[]>("/feedback"),
        orgId ? fetchPublicPg(orgId) : Promise.resolve(null),
      ]);

      if (feedbackRes.status === "fulfilled") {
        setFeedback(feedbackRes.value[0] ?? null);
      } else {
        setError((feedbackRes.reason as any)?.message ?? "Failed to load feedback");
      }

      if (pgRes.status === "fulfilled" && pgRes.value) {
        setBuildings(pgRes.value.buildings ?? []);
        setPropertyId((current) => current ?? pgRes.value!.buildings[0]?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (feedback) {
      setRating(feedback.rating);
      setCategory(feedback.category);
      setComment(feedback.comment ?? "");
      setPropertyId(feedback.property_id);
    }
  }, [feedback]);

  const selectedCategory = useMemo(() => categoryMeta(category), [category]);
  const showForm = !feedback || editing;

  function startEditing() {
    if (!feedback) return;
    setRating(feedback.rating);
    setCategory(feedback.category);
    setComment(feedback.comment ?? "");
    setFormError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setFormError(null);
    if (feedback) {
      setRating(feedback.rating);
      setCategory(feedback.category);
      setComment(feedback.comment ?? "");
    }
  }

  async function submit() {
    setFormError(null);
    if (!rating) {
      setFormError("Tap a star to rate your stay.");
      return;
    }
    if (!propertyId) {
      setFormError("No PG found for this account. Ask your manager to set up the property first.");
      return;
    }
    setSubmitting(true);
    try {
      if (feedback) {
        const updated = await api.patch<Feedback>(`/feedback/${feedback.id}`, {
          ...feedback,
          property_id: propertyId,
          rating,
          category,
          comment: comment.trim() || null,
        });
        setFeedback(updated);
        setEditing(false);
      } else {
        const created = await api.post<Feedback>("/feedback", {
          property_id: propertyId,
          rating,
          category,
          comment: comment.trim() || null,
        });
        setFeedback(created);
      }
      Alert.alert(
        feedback ? "Feedback updated" : "Thank you!",
        "Your feedback helps the manager improve the PG."
      );
    } catch (e: any) {
      setFormError(e?.detail ?? e?.message ?? "Could not save your feedback.");
    } finally {
      setSubmitting(false);
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
            <Text style={styles.eyebrow}>YOUR VOICE</Text>
            <AppText variant="h2" color="#fff">
              Feedback
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.74)">
              {feedback ? "Thanks for sharing your experience" : "Rate your stay and help us improve"}
            </AppText>
          </View>
          {feedback ? (
            <TouchableOpacity
              style={styles.headerAction}
              onPress={startEditing}
              accessibilityLabel="Edit feedback"
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={accent.accent} />
        }
      >
        {loading && !feedback && (
          <View style={{ gap: 10 }}>
            <Skeleton height={150} radius={16} />
            <Skeleton height={120} radius={16} />
          </View>
        )}

        {/* Already submitted */}
        {feedback && !editing && (
          <>
            <View style={styles.thanksCard}>
              <View style={[styles.thanksIcon, { backgroundColor: accent.accentSoft }]}>
                <Ionicons name="heart" size={24} color={accent.accent} />
              </View>
              <AppText variant="h3" color={design.colors.textPrimary} style={{ textAlign: "center" }}>
                Thank you!
              </AppText>
              <AppText
                variant="bodySmall"
                color={design.colors.textSecondary}
                style={{ textAlign: "center", lineHeight: 20 }}
              >
                Your feedback was shared with the manager. You can update it any time.
              </AppText>

              <View style={styles.starsDisplay}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons
                    key={n}
                    name={n <= feedback.rating ? "star" : "star-outline"}
                    size={28}
                    color={n <= feedback.rating ? "#F59E0B" : design.colors.border}
                  />
                ))}
              </View>
              <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "800" }}>
                {feedback.rating} / 5 · {RATING_LABELS[feedback.rating] ?? ""}
              </AppText>

              <View style={styles.metaRow}>
                <View style={[styles.categoryPill, { backgroundColor: accent.accentSoft }]}>
                  <Ionicons name={selectedCategory.icon as any} size={12} color={accent.accent} />
                  <AppText variant="caption" color={accent.accent} style={{ fontWeight: "800" }}>
                    {selectedCategory.label}
                  </AppText>
                </View>
                <AppText variant="caption" color={design.colors.textMuted}>
                  {prettyDate(feedback.updated_at)}
                </AppText>
              </View>

              {feedback.comment ? (
                <View style={styles.commentBox}>
                  <AppText variant="caption" color={design.colors.textMuted}>
                    YOUR COMMENT
                  </AppText>
                  <AppText
                    variant="bodySmall"
                    color={design.colors.textPrimary}
                    style={{ lineHeight: 20, marginTop: 3 }}
                  >
                    {feedback.comment}
                  </AppText>
                </View>
              ) : null}

              <TouchableOpacity style={styles.editLink} onPress={startEditing}>
                <Ionicons name="create-outline" size={14} color={accent.accent} />
                <AppText variant="caption" color={accent.accent} style={{ fontWeight: "800" }}>
                  Edit my feedback
                </AppText>
              </TouchableOpacity>
            </View>

            <View style={styles.tipCard}>
              <Ionicons name="bulb-outline" size={16} color={accent.accent} />
              <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
                Feedback is private to you and the manager. For urgent repairs, report a complaint
                instead so it can be tracked.
              </AppText>
              <TouchableOpacity onPress={() => router.push("/complaints/new")} hitSlop={8}>
                <Ionicons name="arrow-forward" size={15} color={accent.accent} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Form */}
        {showForm && (
          <View style={{ gap: 10 }}>
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { backgroundColor: accent.accentSoft }]}>
                  <Ionicons name="star-outline" size={17} color={accent.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h4" color={design.colors.textPrimary}>
                    How is your stay?
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary}>
                    Tap a star to rate from 1 to 5
                  </AppText>
                </View>
              </View>

              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = n <= rating;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[styles.starBtn, active && { backgroundColor: "#FFFBEB" }]}
                      onPress={() => setRating(n)}
                      activeOpacity={0.8}
                      accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
                    >
                      <Ionicons
                        name={active ? "star" : "star-outline"}
                        size={30}
                        color={active ? "#F59E0B" : design.colors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.ratingHint, { color: rating ? airColor(rating) : design.colors.textMuted }]}>
                {rating ? RATING_LABELS[rating] : "No rating selected yet"}
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { backgroundColor: accent.accentSoft }]}>
                  <Ionicons name="grid-outline" size={16} color={accent.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h4" color={design.colors.textPrimary}>
                    What is this about?
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary}>
                    Pick the closest topic
                  </AppText>
                </View>
              </View>

              <View style={styles.categoryGrid}>
                {FEEDBACK_CATEGORIES.map((option) => {
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
                        size={16}
                        color={active ? accent.accent : design.colors.textMuted}
                      />
                      <AppText
                        variant="caption"
                        color={active ? accent.accent : design.colors.textSecondary}
                        style={{ fontWeight: "700" }}
                      >
                        {option.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { backgroundColor: accent.accentSoft }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={accent.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h4" color={design.colors.textPrimary}>
                    Tell us more
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary}>
                    Optional, but details help a lot
                  </AppText>
                </View>
              </View>

              <View style={{ marginTop: 10 }}>
                <AppInput
                  placeholder="What did you like? What could be better?"
                  multiline
                  numberOfLines={4}
                  maxLength={1000}
                  value={comment}
                  onChangeText={setComment}
                />
              </View>

              {buildings.length > 1 && !feedback ? (
                <>
                  <AppText variant="label" color={design.colors.textSecondary} style={{ marginTop: 4 }}>
                    PG
                  </AppText>
                  <View style={styles.buildingRow}>
                    {buildings.map((building) => {
                      const active = propertyId === building.id;
                      return (
                        <TouchableOpacity
                          key={building.id}
                          style={[
                            styles.buildingChip,
                            active && { borderColor: accent.accent, backgroundColor: accent.accentSoft },
                          ]}
                          onPress={() => setPropertyId(building.id)}
                        >
                          <AppText
                            variant="caption"
                            color={active ? accent.accent : design.colors.textSecondary}
                            style={{ fontWeight: "700" }}
                            numberOfLines={1}
                          >
                            {building.name}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {formError && <Text style={styles.formError}>{formError}</Text>}

              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                {editing && (
                  <AppButton variant="ghost" onPress={cancelEditing} style={{ flex: 1 }} fullWidth>
                    Cancel
                  </AppButton>
                )}
                <AppButton
                  variant="primary"
                  onPress={submit}
                  loading={submitting}
                  fullWidth
                  icon="send"
                  style={{ flex: 1.4, backgroundColor: accent.accent }}
                >
                  {feedback ? "Update Feedback" : "Submit Feedback"}
                </AppButton>
              </View>
            </View>

            <View style={styles.privacyRow}>
              <Ionicons name="lock-closed-outline" size={12} color={design.colors.textMuted} />
              <AppText variant="caption" color={design.colors.textMuted} style={{ flex: 1 }}>
                Your rating and comment are visible only to the PG manager.
              </AppText>
            </View>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

function airColor(rating: number): string {
  if (rating >= 4) return "#047857";
  if (rating === 3) return "#B45309";
  return "#BE123C";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  hero: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
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
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 70, gap: 10 },

  thanksCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 18,
    alignItems: "center",
    gap: 6,
    ...getShadow("sm"),
  },
  thanksIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  starsDisplay: { flexDirection: "row", gap: 3, marginTop: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  commentBox: {
    width: "100%",
    marginTop: 10,
    padding: 11,
    borderRadius: 11,
    backgroundColor: design.colors.background,
    borderWidth: 1,
    borderColor: design.colors.border,
  },
  editLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    minHeight: 32,
  },

  tipCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 14,
    ...getShadow("sm"),
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  starsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 6,
  },
  starBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: design.colors.background,
  },
  ratingHint: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },

  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  categoryOption: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: design.colors.background,
  },
  buildingRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 6 },
  buildingChip: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: design.colors.background,
  },

  privacyRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 },
  formError: { color: design.colors.danger, marginTop: 8, fontSize: 12 },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
