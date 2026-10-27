export type BedStatus = "vacant" | "occupied" | "maintenance";
export type Role = "owner" | "manager" | "tenant";
export type InvoiceStatus = "pending" | "partial" | "paid" | "void";
export type BillingCycle = "advance" | "arrears";

export type Payment = {
  id: string;
  amount_paise: number;
  mode: string;
  reference: string | null;
  paid_at: string;
};

export type Invoice = {
  id: string;
  stay_id: string;
  period_month: string;
  amount_paise: number;
  paid_paise: number;
  balance_paise: number;
  due_date: string;
  status: InvoiceStatus;
};
