import { api } from "./api";

export type PublicBed = { id: string; label: string; rent_paise: number; deposit_paise: number };
export type PublicRoom = { id: string; number: string; vacant_beds: PublicBed[]; vacant_count: number };
export type PublicFloor = {
  id: string; name: string; total_rooms: number; total_beds: number; vacant_count: number; rooms: PublicRoom[];
};
export type PublicBuilding = {
  id: string; name: string; address: string | null; city: string | null; locality: string | null;
  facilities: string[] | null; floors_count: number; rooms_count: number; beds_count: number; vacant_count: number;
  rent_min_paise: number | null; rent_max_paise: number | null; floors: PublicFloor[];
};
export type PublicPgDetail = { id: string; name: string; contact_phone: string | null; buildings: PublicBuilding[] };
export type PublicPgSummary = {
  id: string; name: string; buildings_count: number; beds_count: number; vacant_count: number;
  rent_min_paise: number | null; rent_max_paise: number | null; city: string | null;
};

export function fetchPublicPgs(): Promise<PublicPgSummary[]> {
  return api.get<PublicPgSummary[]>("/public/pgs");
}

export function fetchPublicPg(orgId: string): Promise<PublicPgDetail> {
  return api.get<PublicPgDetail>(`/public/pgs/${orgId}`);
}

export type Notification = {
  id: string;
  title: string;
  body: string;
  complaint_id: string | null;
  request_id: string | null;
  created_at: string;
  read_at: string | null;
};
