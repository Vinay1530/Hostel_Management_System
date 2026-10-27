import io
import uuid
from datetime import date, datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A5, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.models.enums import PaymentMode


def rupee(paise: int) -> str:
    """Render paise as Rs. X.YZ with thousands separators."""
    if paise == 0:
        return "Rs. 0.00"
    sign = "-" if paise < 0 else ""
    rupees = abs(paise) // 100
    return f"{sign}Rs. {rupees:,}.{abs(paise) % 100:02d}"


def render_receipt_pdf(
    org_name: str,
    tenant_name: str,
    property_name: str,
    room: str,
    period: str,
    invoice_amount: int,
    payment_amount: int,
    mode: str,
    reference: str | None,
    paid_at: datetime,
    receipt_no: str,
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A5))
    w, h = landscape(A5)
    c.setTitle(f"Receipt {receipt_no}")

    c.setFillColor(colors.HexColor("#1e40af"))
    c.rect(0, h - 18 * mm, w, 18 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(15 * mm, h - 12 * mm, org_name)
    c.setFont("Helvetica", 9)
    c.drawRightString(w - 15 * mm, h - 12 * mm, "Rent Payment Receipt")

    c.setFillColor(colors.black)
    rows = [
        ("Receipt No", receipt_no),
        ("Date", paid_at.strftime("%d %b %Y %I:%M %p") if paid_at else "-"),
        ("Tenant", tenant_name),
        ("Property", property_name),
        ("Room / Bed", room),
        ("Billing Period", period),
        ("Invoice Amount", rupee(invoice_amount)),
        ("Payment Amount", rupee(payment_amount)),
        ("Payment Mode", mode.replace("_", " ").title()),
        ("Reference", reference or "-"),
    ]
    y = h - 28 * mm
    for label, value in rows:
        c.setFont("Helvetica", 10)
        c.setFillColor(colors.gray)
        c.drawString(15 * mm, y, label)
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(60 * mm, y, str(value))
        y -= 9 * mm

    c.setFillColor(colors.HexColor("#16a34a"))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(15 * mm, y - 4 * mm, f"Paid: {rupee(payment_amount)}")

    c.setFillColor(colors.gray)
    c.setFont("Helvetica", 8)
    c.drawCentredString(w / 2, 10 * mm, "Computer-generated receipt. Thank you for your payment.")
    c.showPage()
    c.save()
    return bytes(buf.getvalue())
