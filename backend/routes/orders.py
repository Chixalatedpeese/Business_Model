from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
from database import db, get_next_sequence
from auth import get_current_user

router = APIRouter(prefix="/api/orders", tags=["orders"])


class OrderItemInput(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit_price: float
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = ""


class OrderCreate(BaseModel):
    customer_id: str
    customer_name: str
    items: List[OrderItemInput]
    notes: Optional[str] = ""


class AssignSupplierInput(BaseModel):
    item_id: str
    supplier_id: str
    supplier_name: str


class UpdateStatusInput(BaseModel):
    status: str
    item_ids: Optional[List[str]] = None


async def sync_order_purchases(order_id: str):
    """Auto-create purchase records based on order item supplier assignments."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return

    # Remove old auto-generated purchases for this order
    await db.purchases.delete_many({"order_id": order_id, "auto_generated": True})

    # Group items by supplier
    supplier_items = {}
    for item in order["items"]:
        sid = item.get("supplier_id")
        if sid:
            if sid not in supplier_items:
                supplier_items[sid] = {"supplier_name": item.get("supplier_name", ""), "items": []}
            supplier_items[sid]["items"].append(item)

    # Create one purchase per supplier
    for supplier_id, data in supplier_items.items():
        items = []
        total = 0
        for oi in data["items"]:
            # Use snapshotted cost_price from order item (avoid drift on product price changes)
            cost_price = oi.get("cost_price")
            if cost_price is None:
                product = await db.products.find_one({"id": oi["product_id"]}, {"_id": 0})
                cost_price = product.get("cost_price", 0) if product else 0
            amount = oi["quantity"] * cost_price
            items.append({
                "id": str(uuid.uuid4()),
                "product_id": oi["product_id"],
                "product_name": oi["product_name"],
                "quantity": oi["quantity"],
                "cost_price": cost_price,
                "amount": amount
            })
            total += amount

        seq = await get_next_sequence("purchases")
        doc = {
            "id": str(uuid.uuid4()),
            "purchase_number": f"PUR-{seq:04d}",
            "supplier_id": supplier_id,
            "supplier_name": data["supplier_name"],
            "order_id": order_id,
            "order_number": order["order_number"],
            "items": items,
            "total_amount": total,
            "auto_generated": True,
            "notes": f"Auto from {order['order_number']}",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.purchases.insert_one(doc)


@router.get("")
async def list_orders(search: Optional[str] = None, status: Optional[str] = None, user=Depends(get_current_user)):
    query = {}
    conditions = []
    if search:
        conditions.append({"$or": [
            {"order_number": {"$regex": search, "$options": "i"}},
            {"customer_name": {"$regex": search, "$options": "i"}}
        ]})
    if status:
        conditions.append({"status": status})
    if conditions:
        query = {"$and": conditions} if len(conditions) > 1 else conditions[0]
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders


@router.get("/{order_id}")
async def get_order(order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Calculate profit per item
    total_profit = 0
    total_cost = 0
    for item in order["items"]:
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        cost_price = product.get("cost_price", 0) if product else 0
        item["cost_price"] = cost_price
        item["profit"] = round((item["unit_price"] - cost_price) * item["quantity"], 2)
        total_profit += item["profit"]
        total_cost += cost_price * item["quantity"]

    order["total_profit"] = round(total_profit, 2)
    order["total_cost"] = round(total_cost, 2)
    order["purchases"] = await db.purchases.find({"order_id": order_id}, {"_id": 0}).to_list(100)
    order["invoices"] = await db.invoices.find({"order_id": order_id}, {"_id": 0}).to_list(100)
    return order


@router.post("")
async def create_order(data: OrderCreate, user=Depends(get_current_user)):
    seq = await get_next_sequence("orders")
    order_number = f"ORD-{seq:04d}"

    items = []
    total = 0
    for item in data.items:
        # Snapshot current cost_price at order-creation time to prevent payable drift
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0, "cost_price": 1})
        cost_price = product.get("cost_price", 0) if product else 0
        item_doc = {
            "id": str(uuid.uuid4()),
            "product_id": item.product_id,
            "product_name": item.product_name,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "cost_price": cost_price,
            "amount": round(item.quantity * item.unit_price, 2),
            "supplier_id": item.supplier_id or "",
            "supplier_name": item.supplier_name or "",
            "status": "pending"
        }
        total += item_doc["amount"]
        items.append(item_doc)

    doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "customer_id": data.customer_id,
        "customer_name": data.customer_name,
        "items": items,
        "total_amount": round(total, 2),
        "status": "pending",
        "notes": data.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.insert_one(doc)
    doc.pop("_id", None)

    # Auto-create supplier payables
    await sync_order_purchases(doc["id"])

    return doc


@router.put("/{order_id}/assign-supplier")
async def assign_supplier(order_id: str, data: AssignSupplierInput, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    updated = False
    for item in order["items"]:
        if item["id"] == data.item_id:
            item["supplier_id"] = data.supplier_id
            item["supplier_name"] = data.supplier_name
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")

    await db.orders.update_one({"id": order_id}, {"$set": {"items": order["items"]}})

    # Re-sync supplier payables
    await sync_order_purchases(order_id)

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return order


@router.put("/{order_id}/status")
async def update_order_status(order_id: str, data: UpdateStatusInput, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if data.item_ids:
        for item in order["items"]:
            if item["id"] in data.item_ids:
                item["status"] = data.status
    else:
        for item in order["items"]:
            item["status"] = data.status

    statuses = [i["status"] for i in order["items"]]
    if all(s == "delivered" for s in statuses):
        overall = "delivered"
    elif all(s == "pending" for s in statuses):
        overall = "pending"
    else:
        overall = "ordered"

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"items": order["items"], "status": overall}}
    )
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return order


@router.delete("/{order_id}")
async def delete_order(order_id: str, user=Depends(get_current_user)):
    # Also remove auto-generated purchases
    await db.purchases.delete_many({"order_id": order_id, "auto_generated": True})
    result = await db.orders.delete_one({"id": order_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"message": "Order deleted"}
