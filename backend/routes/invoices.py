from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
from database import db, get_next_sequence
from auth import get_current_user

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


class InvoiceItemInput(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit_price: float


class InvoiceCreate(BaseModel):
    customer_id: str
    customer_name: str
    customer_shop_name: Optional[str] = ""
    order_id: Optional[str] = None
    order_number: Optional[str] = ""
    items: List[InvoiceItemInput]
    notes: Optional[str] = ""


@router.get("")
async def list_invoices(search: Optional[str] = None, customer_id: Optional[str] = None, status: Optional[str] = None, user=Depends(get_current_user)):
    query = {}
    conditions = []
    if search:
        conditions.append({"$or": [
            {"invoice_number": {"$regex": search, "$options": "i"}},
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"order_number": {"$regex": search, "$options": "i"}}
        ]})
    if customer_id:
        conditions.append({"customer_id": customer_id})
    if status:
        conditions.append({"status": status})
    if conditions:
        query = {"$and": conditions} if len(conditions) > 1 else conditions[0]

    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return invoices


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, user=Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Calculate paid amount from allocations
    pay_result = await db.payments.aggregate([
        {"$match": {"payment_type": "customer"}},
        {"$unwind": "$allocations"},
        {"$match": {"allocations.reference_id": invoice_id, "allocations.reference_type": "invoice"}},
        {"$group": {"_id": None, "total": {"$sum": "$allocations.amount"}}}
    ]).to_list(1)
    invoice["paid_amount"] = pay_result[0]["total"] if pay_result else 0
    invoice["balance"] = invoice["total_amount"] - invoice["paid_amount"]

    return invoice


@router.post("")
async def create_invoice(data: InvoiceCreate, user=Depends(get_current_user)):
    seq = await get_next_sequence("invoices")
    invoice_number = f"INV-{seq:04d}"

    items = []
    total = 0
    for item in data.items:
        item_doc = {
            "id": str(uuid.uuid4()),
            "product_id": item.product_id,
            "product_name": item.product_name,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "amount": item.quantity * item.unit_price
        }
        total += item_doc["amount"]
        items.append(item_doc)

    doc = {
        "id": str(uuid.uuid4()),
        "invoice_number": invoice_number,
        "customer_id": data.customer_id,
        "customer_name": data.customer_name,
        "customer_shop_name": data.customer_shop_name or "",
        "order_id": data.order_id or "",
        "order_number": data.order_number or "",
        "items": items,
        "total_amount": total,
        "status": "unpaid",
        "notes": data.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/from-order/{order_id}")
async def create_invoice_from_order(order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Check if invoice already exists for this order
    existing = await db.invoices.find_one({"order_id": order_id}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Invoice already exists for this order")

    seq = await get_next_sequence("invoices")
    invoice_number = f"INV-{seq:04d}"

    items = []
    total = 0
    for oi in order["items"]:
        item_doc = {
            "id": str(uuid.uuid4()),
            "product_id": oi["product_id"],
            "product_name": oi["product_name"],
            "quantity": oi["quantity"],
            "unit_price": oi["unit_price"],
            "amount": oi["quantity"] * oi["unit_price"]
        }
        total += item_doc["amount"]
        items.append(item_doc)

    # Fetch customer shop_name
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
    shop_name = customer.get("shop_name", "") if customer else ""

    doc = {
        "id": str(uuid.uuid4()),
        "invoice_number": invoice_number,
        "customer_id": order["customer_id"],
        "customer_name": order["customer_name"],
        "customer_shop_name": shop_name,
        "order_id": order_id,
        "order_number": order["order_number"],
        "items": items,
        "total_amount": total,
        "status": "unpaid",
        "notes": "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str, user=Depends(get_current_user)):
    result = await db.invoices.delete_one({"id": invoice_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"message": "Invoice deleted"}
