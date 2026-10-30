import enum


class Role(str, enum.Enum):
    owner = "owner"
    manager = "manager"
    tenant = "tenant"


class BedStatus(str, enum.Enum):
    """Occupancy states of a bed.

    `occupied` is derived at read time from active stays (never stored)."""
    vacant = "vacant"
    occupied = "occupied"
    maintenance = "maintenance"


class BillingCycle(str, enum.Enum):
    advance = "advance"
    arrears = "arrears"


class DocType(str, enum.Enum):
    kyc_id = "kyc_id"
    agreement = "agreement"
    other = "other"


class ChargeType(str, enum.Enum):
    electricity = "electricity"
    food = "food"
    late_fee = "late_fee"
    other = "other"


class InvoiceStatus(str, enum.Enum):
    pending = "pending"
    partial = "partial"
    paid = "paid"
    void = "void"


class PaymentMode(str, enum.Enum):
    cash = "cash"
    upi_manual = "upi_manual"
    card = "card"
    bank_transfer = "bank_transfer"
