export type BedStatus = "vacant" | "occupied" | "maintenance";
export type Role = "owner" | "manager" | "tenant";
export type InvoiceStatus = "pending" | "partial" | "paid" | "void";
export type BillingCycle = "advance" | "arrears";
export type PaymentMode = "cash" | "upi_manual" | "card" | "bank_transfer";

export type Payment = {
  id: string;
  amount_paise: number;
  mode: PaymentMode;
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

export type Feedback = {
  id: string;
  rating: number;
  category: string;
  comment: string | null;
  created_at: string;
};

export type SecurityDeposit = {
  id: string;
  amount_paise: number;
  status: string;
  held_by_user_id: string | null;
  refund_date: string | null;
  deductions_paise: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentReminder = {
  id: string;
  invoice_id: string;
  reminder_type: string;
  reminder_date: string;
  sent_at: string | null;
  channel: string;
  status: string;
  created_at: string;
};

export type InvoiceTemplate = {
  id: string;
  name: string;
  template_data: any;
  is_default: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomTenantField = {
  id: string;
  tenant_id: string;
  field_name: string;
  field_value: string;
  field_type: string;
  created_at: string;
  updated_at: string;
};

export type OccupancyMapEntry = {
  id: string;
  x_position: number;
  y_position: number;
  floor_number: number;
  room_number: string;
  bed_label: string;
  is_occupied: boolean;
  tenant_id: string | null;
};
