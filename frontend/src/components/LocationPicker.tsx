import type { Option } from "@/components/ui";
import { Select } from "@/components/ui";
import type { PublicBuilding } from "@/lib/public";
import { theme } from "@/lib/theme";
import { View } from "react-native";

export type LocationSel = {
  building: string | null;
  floor: string | null;
  room: string | null;
  bed: string | null;
};

export type LocationBed = { value: string; label: string };

export const emptySel: LocationSel = { building: null, floor: null, room: null, bed: null };

/** Cascading Building → Floor → Room → Bed picker (with "Any" at every level). */
export function LocationPicker({
  buildings,
  value,
  onChange,
  withBed = true,
}: {
  buildings: PublicBuilding[];
  value: LocationSel;
  onChange: (sel: LocationSel) => void;
  withBed?: boolean;
}) {
  const building = buildings.find((b) => b.id === value.building) ?? null;
  const floors = building?.floors ?? [];
  const floor = floors.find((f) => f.id === value.floor) ?? null;
  const rooms = floor?.rooms ?? [];
  const room = rooms.find((r) => r.id === value.room) ?? null;
  const beds = room?.vacant_beds ?? [];

  function set(next: LocationSel) {
    onChange(next);
  }

  const buildingOptions: Option[] = [
    { value: "__any__", label: "All buildings" },
    ...buildings.map((b) => ({ value: b.id, label: b.name })),
  ];
  const floorOptions: Option[] = [
    { value: "__any__", label: "All floors" },
    ...floors.map((f) => ({ value: f.id, label: `${f.name}`, sublabel: `${f.vacant_count}/${f.total_beds} vacant` })),
  ];
  const roomOptions: Option[] = [
    { value: "__any__", label: "All rooms" },
    ...rooms.map((r) => ({ value: r.id, label: r.number, sublabel: `${r.vacant_count} vacant` })),
  ];
  const bedOptions: Option[] = [
    { value: "__any__", label: "Any bed" },
    ...beds.map((b) => ({
      value: b.id,
      label: b.label,
      sublabel: budgetLabel(b),
    })),
  ];

  function budgetLabel(b: { rent_paise: number }): string {
    const rupees = b.rent_paise / 100;
    return `Rs. ${rupees.toLocaleString("en-IN")}`;
  }

  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Select
        compact
        value={value.building ?? "__any__"}
        options={buildingOptions}
        placeholder={"All buildings"}
        title="Building"
        onChange={(v) => set({ building: v === "__any__" ? null : v, floor: null, room: null, bed: null })}
      />
      <Select
        compact
        value={value.floor ?? "__any__"}
        options={floorOptions}
        placeholder={"All floors"}
        title="Floor"
        onChange={(v) => set({ ...value, floor: v === "__any__" ? null : v, room: null, bed: null })}
      />
      <Select
        compact
        value={value.room ?? "__any__"}
        options={roomOptions}
        placeholder={"All rooms"}
        title="Room"
        onChange={(v) => set({ ...value, room: v === "__any__" ? null : v, bed: null })}
      />
      {withBed && (
        <Select
          compact
          value={value.bed ?? "__any__"}
          options={bedOptions}
          placeholder={"Any bed"}
          title="Bed"
          onChange={(v) => set({ ...value, bed: v === "__any__" ? null : v })}
        />
      )}
    </View>
  );
}

export function selectionLabel(sel: LocationSel, buildings: PublicBuilding[]): string {
  const parts: string[] = [];
  const b = buildings.find((x) => x.id === sel.building);
  if (b) {
    parts.push(b.name);
    const f = b.floors.find((x) => x.id === sel.floor);
    if (f) {
      parts.push(f.name);
      const r = f.rooms.find((x) => x.id === sel.room);
      if (r) {
        parts.push(`Room ${r.number}`);
        const bd = r.vacant_beds.find((x) => x.id === sel.bed);
        if (bd) parts.push(`Bed ${bd.label}`);
      }
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "Anywhere";
}
