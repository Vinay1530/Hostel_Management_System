import { LocationPicker, selectionLabel, emptySel, type LocationSel } from "@/components/LocationPicker";
import { ConfirmDialog, Sheet } from "@/components/ui";
import { api, rupeesFromPaise } from "@/lib/api";
import { fetchPublicPg, type PublicPgDetail } from "@/lib/public";
import { getShadow } from "@/lib/design";
import { FACILITY_OPTIONS, facilityIcon, facilityLabel, palette, roleAccents, theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useState } from "react";

const accent = roleAccents.guest;

type RoomOffer = {
  buildingId: string;
  buildingName: string;
  floorId: string;
  floorName: string;
  roomId: string;
  roomNumber: string;
  vacantCount: number;
  rentPaise: number | null;
  bedLabels: string[];
};

export default function GuestPg() {
  const router = useRouter();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const [pg, setPg] = useState<PublicPgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sel, setSel] = useState<LocationSel>(emptySel);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedBuilding, setExpandedBuilding] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    fetchPublicPg(orgId)
      .then((data) => {
        setPg(data);
        setExpandedBuilding(data.buildings[0]?.id ?? null);
      })
      .catch((e: any) => setError(e?.message ?? "Failed to load this PG"));
  }, [orgId]);

  const amenities = useMemo(() => {
    if (!pg) return [];
    const keys = new Set<string>();
    for (const building of pg.buildings)
      for (const key of building.facilities ?? []) keys.add(key.toLowerCase());
    const ordered: string[] = FACILITY_OPTIONS.filter((option) => keys.has(option.key)).map((option) => option.key);
    const extras = Array.from(keys).filter((key) => !ordered.includes(key));
    return [...ordered, ...extras];
  }, [pg]);

  const roomOffers = useMemo<RoomOffer[]>(() => {
    if (!pg) return [];
    const offers: RoomOffer[] = [];
    for (const building of pg.buildings)
      for (const floor of building.floors)
        for (const room of floor.rooms) {
          if (room.vacant_count <= 0) continue;
          const rents = room.vacant_beds.map((bed) => bed.rent_paise).filter((n) => n > 0);
          offers.push({
            buildingId: building.id,
            buildingName: building.name,
            floorId: floor.id,
            floorName: floor.name,
            roomId: room.id,
            roomNumber: room.number,
            vacantCount: room.vacant_count,
            rentPaise: rents.length > 0 ? Math.min(...rents) : null,
            bedLabels: room.vacant_beds.map((bed) => bed.label),
          });
        }
    return offers;
  }, [pg]);

  const vacantTotal = pg?.buildings.reduce((sum, b) => sum + b.vacant_count, 0) ?? 0;
  const minRent = pg?.buildings.reduce<number | null>((min, b) => {
    if (b.rent_min_paise == null) return min;
    return min == null ? b.rent_min_paise : Math.min(min, b.rent_min_paise);
  }, null) ?? null;
  const locationLabel = pg
    ? Array.from(
        new Set(
          pg.buildings
            .map((b) => [b.locality, b.city].filter(Boolean).join(", "))
            .filter(Boolean)
        )
      ).join(" · ")
    : "";

  if (!orgId) return <Redirect href="/guest" />;

  interface GuestBookingIn {
    org_id: string;
    guest_name: string;
    guest_phone: string;
    building_id?: string | null;
    floor_id?: string | null;
    room_id?: string | null;
    bed_id?: string | null;
    note?: string | null;
  }

  function openEnquiry(offer?: RoomOffer) {
    if (offer) {
      setSel({
        building: offer.buildingId,
        floor: offer.floorId,
        room: offer.roomId,
        bed: null,
      });
    }
    setDone(false);
    setSheetOpen(true);
  }

  async function submit() {
    if (!pg) return;
    if (!guestName.trim() || !/^\d{10,15}$/.test(guestPhone.trim())) {
      setFormError("Please enter your name and a valid phone number.");
      return;
    }
    const preferredDate = moveInDate.trim();
    if (preferredDate) {
      const parsed = new Date(`${preferredDate}T00:00:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || isNaN(parsed.getTime())) {
        setFormError("Enter your preferred move-in date as YYYY-MM-DD, or leave it blank.");
        return;
      }
    }
    setBusy(true);
    setFormError(null);
    try {
      const noteParts: string[] = [];
      if (preferredDate) noteParts.push(`Preferred move-in: ${preferredDate}`);
      if (note.trim()) noteParts.push(note.trim());
      const body: GuestBookingIn = {
        org_id: orgId as string,
        guest_name: guestName.trim(),
        guest_phone: guestPhone.trim(),
        building_id: sel.building,
        floor_id: sel.floor,
        room_id: sel.room,
        bed_id: sel.bed,
        note: noteParts.length > 0 ? noteParts.join("\n") : null,
      };
      await api.post("/public/booking-requests", body);
      setSheetOpen(false);
      setDone(true);
    } catch (e: any) {
      setFormError(e?.message ?? "Failed to send request");
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setDone(false);
    setSel(emptySel);
    setGuestName("");
    setGuestPhone("");
    setMoveInDate("");
    setNote("");
    setFormError(null);
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={accent.accentText} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>GUEST PORTAL</Text>
          <Text style={styles.h1} numberOfLines={1}>
            {pg?.name ?? "…"}
          </Text>
        </View>
        {pg?.contact_phone && (
          <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${pg.contact_phone}`)}>
            <Ionicons name="call" size={16} color="#fff" />
          </Pressable>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {!pg && !error && (
        <View style={{ padding: 16, gap: 12 }}>
          <View style={styles.coverSkeleton} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={[styles.skeletonBlock, { width: 74, height: 74 }]} />
            <View style={[styles.skeletonBlock, { width: 74, height: 74 }]} />
            <View style={[styles.skeletonBlock, { width: 74, height: 74 }]} />
          </View>
          <View style={[styles.skeletonBlock, { height: 160 }]} />
        </View>
      )}

      {pg && (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Cover */}
            <View style={styles.cover}>
              <View style={styles.coverGlowA} />
              <View style={styles.coverGlowB} />
              <View style={styles.coverIcon}>
                <Ionicons name="business" size={26} color={accent.accent} />
              </View>
              <Text style={styles.coverTitle}>{pg.name}</Text>
              {locationLabel ? (
                <View style={styles.locationRow}>
                  <Ionicons name="location" size={12} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.coverSub}>{locationLabel}</Text>
                </View>
              ) : null}
              <View style={styles.coverStats}>
                <View style={styles.coverStat}>
                  <Ionicons name="bed" size={13} color="#fff" />
                  <Text style={styles.coverStatText}>
                    {vacantTotal} bed{vacantTotal === 1 ? "" : "s"} vacant
                  </Text>
                </View>
                {minRent != null && (
                  <View style={styles.coverStat}>
                    <Ionicons name="cash" size={13} color="#fff" />
                    <Text style={styles.coverStatText}>
                      from {rupeesFromPaise(minRent)}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Amenities */}
            {amenities.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>KEY AMENITIES</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.amenityRow}
                >
                  {amenities.map((key) => (
                    <View key={key} style={styles.amenityItem}>
                      <View style={styles.amenityCircle}>
                        <Ionicons name={facilityIcon(key) as any} size={20} color={accent.accent} />
                      </View>
                      <Text style={styles.amenityLabel} numberOfLines={2}>
                        {facilityLabel(key)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Room types / offers */}
            {roomOffers.length > 0 && (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>AVAILABLE ROOMS</Text>
                  <Text style={styles.sectionHint}>{roomOffers.length} room{roomOffers.length === 1 ? "" : "s"}</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.offerRow}
                >
                  {roomOffers.map((offer) => (
                    <Pressable
                      key={offer.roomId}
                      style={styles.offerCard}
                      onPress={() => openEnquiry(offer)}
                    >
                      <Text style={styles.offerBuilding} numberOfLines={1}>
                        {offer.buildingName}
                      </Text>
                      <Text style={styles.offerRoom}>Room {offer.roomNumber}</Text>
                      <Text style={styles.offerMeta}>
                        {offer.floorName} · {offer.vacantCount} bed{offer.vacantCount === 1 ? "" : "s"} free
                      </Text>
                      <View style={styles.offerBeds}>
                        {offer.bedLabels.slice(0, 4).map((label) => (
                          <View key={label} style={styles.offerBedChip}>
                            <Ionicons name="bed-outline" size={11} color={accent.accentText} />
                            <Text style={styles.offerBedText}>{label}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={{ flex: 1 }} />
                      <Text style={styles.offerRent}>
                        {offer.rentPaise != null ? rupeesFromPaise(offer.rentPaise) : "Ask for rent"}
                      </Text>
                      <Text style={styles.offerRentSub}>per month / bed</Text>
                      <View style={styles.offerCta}>
                        <Text style={styles.offerCtaText}>Enquire</Text>
                        <Ionicons name="arrow-forward" size={13} color={accent.accentText} />
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Buildings */}
            <Text style={styles.sectionLabel}>BUILDINGS</Text>
            {pg.buildings.length === 0 && (
              <View style={styles.emptyCard}>
                <Ionicons name="business-outline" size={26} color={theme.textMuted} />
                <Text style={styles.emptyText}>This PG hasn't published buildings yet.</Text>
              </View>
            )}
            {pg.buildings.map((building) => {
              const expanded = expandedBuilding === building.id;
              const address = [building.locality, building.city].filter(Boolean).join(", ");
              return (
                <View key={building.id} style={styles.buildingCard}>
                  <Pressable
                    style={styles.buildingHeader}
                    onPress={() => setExpandedBuilding(expanded ? null : building.id)}
                  >
                    <View style={styles.buildingIcon}>
                      <Ionicons name="business" size={18} color={accent.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.buildingName}>{building.name}</Text>
                      <Text style={styles.buildingMeta} numberOfLines={1}>
                        {address || "Address not added"}
                      </Text>
                    </View>
                    <View style={styles.vacantChip}>
                      <Text style={styles.vacantChipText}>
                        {building.vacant_count}/{building.beds_count}
                      </Text>
                    </View>
                    <Ionicons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={17}
                      color={theme.textMuted}
                    />
                  </Pressable>

                  <View style={styles.buildingFacts}>
                    <Fact icon="layers-outline" text={`${building.floors_count} floors`} />
                    <Fact icon="grid-outline" text={`${building.rooms_count} rooms`} />
                    <Fact
                      icon="cash-outline"
                      text={
                        building.rent_min_paise != null
                          ? `from ${rupeesFromPaise(building.rent_min_paise)}`
                          : "Rent on ask"
                      }
                    />
                  </View>

                  {expanded && (
                    <View style={styles.buildingBody}>
                      {building.floors.map((floor) => (
                        <View key={floor.id} style={styles.floorBlock}>
                          <View style={styles.floorRow}>
                            <Text style={styles.floorName}>{floor.name}</Text>
                            <Text style={styles.floorVacancy}>
                              {floor.vacant_count}/{floor.total_beds} vacant
                            </Text>
                          </View>
                          {floor.rooms
                            .filter((room) => room.vacant_count > 0)
                            .map((room) => (
                              <Pressable
                                key={room.id}
                                style={styles.roomRow}
                                onPress={() =>
                                  openEnquiry({
                                    buildingId: building.id,
                                    buildingName: building.name,
                                    floorId: floor.id,
                                    floorName: floor.name,
                                    roomId: room.id,
                                    roomNumber: room.number,
                                    vacantCount: room.vacant_count,
                                    rentPaise:
                                      room.vacant_beds.length > 0
                                        ? Math.min(...room.vacant_beds.map((bed) => bed.rent_paise))
                                        : null,
                                    bedLabels: room.vacant_beds.map((bed) => bed.label),
                                  })
                                }
                              >
                                <Text style={styles.roomRowText}>
                                  Room {room.number}
                                </Text>
                                <Text style={styles.roomRowBeds}>
                                  {room.vacant_beds.map((bed) => bed.label).join(" · ")}
                                </Text>
                                <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
                              </Pressable>
                            ))}
                          {floor.vacant_count === 0 && (
                            <Text style={styles.floorFull}>Fully occupied</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            <View style={{ height: 16 }} />
          </ScrollView>

          {/* Sticky enquiry bar */}
          <View style={styles.bottomBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bottomTitle}>Interested in {pg.name}?</Text>
              <Text style={styles.bottomSub}>Talk to the manager — no brokerage</Text>
            </View>
            <Pressable style={styles.primaryCta} onPress={() => openEnquiry()}>
              <Text style={styles.primaryCtaText}>Send Enquiry</Text>
            </Pressable>
          </View>
        </>
      )}

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={styles.sheetTitle}>Send an enquiry</Text>
        <Text style={styles.sheetSub}>
          The manager will call you back. This is not an automated booking.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={theme.textMuted}
          value={guestName}
          onChangeText={setGuestName}
        />
        <TextInput
          style={styles.input}
          placeholder="Phone number (10 digits)"
          placeholderTextColor={theme.textMuted}
          value={guestPhone}
          onChangeText={setGuestPhone}
          keyboardType="phone-pad"
        />
        <Text style={styles.prefLabel}>PREFERRED MOVE-IN DATE</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD (optional)"
          placeholderTextColor={theme.textMuted}
          value={moveInDate}
          onChangeText={setMoveInDate}
          maxLength={10}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.fieldHelp}>
          Helps the manager check availability for the right month.
        </Text>
        <Text style={styles.prefLabel}>ROOM PREFERENCE (OPTIONAL)</Text>
        <LocationPicker buildings={pg?.buildings ?? []} value={sel} onChange={setSel} withBed />
        <TextInput
          style={[styles.input, styles.noteInput]}
          placeholder={`Anything else? e.g. “${selectionLabel(sel, pg?.buildings ?? [])} works for me”`}
          placeholderTextColor={theme.textMuted}
          value={note}
          onChangeText={setNote}
          multiline
        />
        {formError && <Text style={styles.error}>{formError}</Text>}
        <Pressable style={styles.primaryCtaFull} onPress={submit} disabled={busy}>
          <Text style={styles.primaryCtaText}>{busy ? "Sending…" : "Send request"}</Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={() => setSheetOpen(false)}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </Sheet>

      <ConfirmDialog
        visible={done}
        title="Request sent!"
        message="The manager has been notified and will call you back. Check with them for confirmation."
        confirmLabel="OK"
        onCancel={resetForm}
        onConfirm={resetForm}
      />
    </View>
  );
}

function Fact({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon as any} size={12} color={accent.accentText} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    ...getShadow("sm"),
  },
  headerEyebrow: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: accent.accent, marginBottom: 1 },
  h1: { fontSize: 18, fontWeight: "800", color: theme.text },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: accent.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 16, paddingTop: 4, paddingBottom: 20, gap: 14 },

  // Cover
  cover: {
    backgroundColor: accent.accent,
    borderRadius: 20,
    padding: 18,
    overflow: "hidden",
    ...getShadow("md"),
  },
  coverGlowA: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.09)",
    top: -70,
    right: -40,
  },
  coverGlowB: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.07)",
    bottom: -40,
    left: -16,
  },
  coverIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  coverTitle: { color: "#fff", fontSize: 24, fontWeight: "800", letterSpacing: -0.4 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  coverSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  coverStats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  coverStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  coverStatText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  // Sections
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: theme.textLight,
  },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionHint: { fontSize: 11, color: theme.textMuted, fontWeight: "600" },

  // Amenities
  amenityRow: { gap: 14, paddingRight: 8, paddingTop: 10 },
  amenityItem: { width: 70, alignItems: "center", gap: 6 },
  amenityCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  amenityLabel: { fontSize: 10, fontWeight: "700", color: theme.textLight, textAlign: "center", lineHeight: 13 },

  // Room offers
  offerRow: { gap: 10, paddingRight: 8, paddingTop: 10 },
  offerCard: {
    width: 178,
    minHeight: 188,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    padding: 13,
    ...getShadow("sm"),
  },
  offerBuilding: { fontSize: 10, fontWeight: "800", color: accent.accentText, letterSpacing: 0.3 },
  offerRoom: { fontSize: 17, fontWeight: "800", color: theme.text, marginTop: 2 },
  offerMeta: { fontSize: 11, color: theme.textLight, marginTop: 1 },
  offerBeds: { flexDirection: "row", gap: 4, marginTop: 8, flexWrap: "wrap" },
  offerBedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: accent.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  offerBedText: { fontSize: 9, fontWeight: "800", color: accent.accentText },
  offerRent: { fontSize: 15, fontWeight: "800", color: theme.text, marginTop: 8 },
  offerRentSub: { fontSize: 9, color: theme.textMuted, fontWeight: "600" },
  offerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  offerCtaText: { fontSize: 11, fontWeight: "800", color: accent.accentText },

  // Buildings
  buildingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 13,
    gap: 8,
    ...getShadow("sm"),
  },
  buildingHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  buildingIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  buildingName: { fontSize: 14, fontWeight: "800", color: theme.text },
  buildingMeta: { fontSize: 11, color: theme.textLight, marginTop: 1 },
  vacantChip: {
    backgroundColor: accent.accentSoft,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  vacantChipText: { fontSize: 10, fontWeight: "800", color: accent.accentText },
  buildingFacts: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingLeft: 2 },
  fact: { flexDirection: "row", alignItems: "center", gap: 4 },
  factText: { fontSize: 10, fontWeight: "600", color: theme.textLight },
  buildingBody: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 12,
  },
  floorBlock: { gap: 6 },
  floorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  floorName: { fontSize: 12, fontWeight: "800", color: theme.text },
  floorVacancy: { fontSize: 10, fontWeight: "600", color: theme.textLight },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.cardSoft,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 8,
    paddingHorizontal: 9,
  },
  roomRowText: { flex: 1, fontSize: 12, fontWeight: "700", color: theme.text },
  roomRowBeds: { fontSize: 10, fontWeight: "700", color: accent.accentText },
  floorFull: { fontSize: 10, color: theme.textMuted, fontStyle: "italic" },

  // Empty
  emptyCard: {
    alignItems: "center",
    gap: 8,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.border,
    backgroundColor: theme.cardSoft,
  },
  emptyText: { fontSize: 12, color: theme.textLight, textAlign: "center" },

  // Bottom CTA
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: theme.border,
    ...getShadow("lg"),
  },
  bottomTitle: { fontSize: 12, fontWeight: "800", color: theme.text },
  bottomSub: { fontSize: 10, color: theme.textLight, marginTop: 1 },
  primaryCta: {
    backgroundColor: accent.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  primaryCtaFull: {
    backgroundColor: accent.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 6,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },

  // Sheet
  sheetTitle: { fontSize: 18, fontWeight: "800", color: theme.text, marginBottom: 2 },
  sheetSub: { fontSize: 12, color: theme.textLight, marginBottom: 10 },
  input: {
    backgroundColor: theme.cardSoft,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: theme.text,
    minHeight: 48,
  },
  noteInput: { minHeight: 64, textAlignVertical: "top" },
  fieldHelp: {
    fontSize: 10,
    color: theme.textMuted,
    marginTop: -4,
    marginBottom: 2,
    lineHeight: 14,
  },
  prefLabel: { fontSize: 9, fontWeight: "800", color: theme.textMuted, letterSpacing: 0.6, marginTop: 4 },
  cancelBtn: {
    alignItems: "center",
    padding: 12,
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: theme.chipBg,
  },
  cancelText: { fontSize: 13, fontWeight: "800", color: theme.textLight },
  error: { color: theme.danger, fontSize: 12, paddingHorizontal: 4 },

  // Skeleton
  coverSkeleton: { height: 172, borderRadius: 20, backgroundColor: palette.surfaceAlt, opacity: 0.8 },
  skeletonBlock: { borderRadius: 16, backgroundColor: palette.surfaceAlt, opacity: 0.8 },
});
