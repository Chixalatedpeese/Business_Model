import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import API from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import { Plus, Search, Trash2, ShoppingCart, X, Truck } from "lucide-react";

const fmt = (n) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const STATUS_COLORS = { pending: "bg-amber-100 text-amber-800", ordered: "bg-blue-100 text-blue-800", delivered: "bg-emerald-100 text-emerald-800" };

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [form, setForm] = useState({ customer_id: "", customer_name: "", items: [], notes: "" });

  const fetchOrders = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter !== "all") params.status = statusFilter;
      const { data } = await API.get("/orders", { params });
      setOrders(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  const fetchMasterData = useCallback(async () => {
    try {
      const [c, p, s] = await Promise.all([
        API.get("/customers"), API.get("/products"), API.get("/suppliers")
      ]);
      setCustomers(c.data);
      setProducts(p.data);
      setSuppliers(s.data);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchOrders(); fetchMasterData(); }, [fetchOrders, fetchMasterData]);

  // Auto-open create dialog when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setForm({ customer_id: "", customer_name: "", items: [], notes: "" });
      setDialogOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const customerOptions = customers.map(c => ({ value: c.id, label: `${c.name}${c.shop_name ? ` (${c.shop_name})` : ""}` }));
  const productOptions = products.map(p => ({ value: p.id, label: `${p.name} - Rs. ${fmt(p.selling_price)}` }));
  const supplierOptions = suppliers.map(s => ({ value: s.id, label: `${s.name}${s.is_primary ? " (Primary)" : ""}` }));

  const openNew = () => {
    setForm({ customer_id: "", customer_name: "", items: [], notes: "" });
    setDialogOpen(true);
  };

  const addItem = () => {
    setForm(f => ({ ...f, items: [...f.items, { product_id: "", product_name: "", quantity: 1, unit_price: "", supplier_id: "", supplier_name: "" }] }));
  };

  const updateItem = (idx, field, value) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === "product_id") {
        const prod = products.find(p => p.id === value);
        if (prod) { items[idx].product_name = prod.name; items[idx].unit_price = prod.selling_price; }
      }
      if (field === "supplier_id") {
        const sup = suppliers.find(s => s.id === value);
        if (sup) items[idx].supplier_name = sup.name;
      }
      return { ...f, items };
    });
  };

  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const selectCustomer = (id) => {
    const cust = customers.find(c => c.id === id);
    setForm(f => ({ ...f, customer_id: id, customer_name: cust?.name || "" }));
  };

  const orderTotal = form.items.reduce((s, i) => s + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0)), 0);

  const handleCreate = async () => {
    if (!form.customer_id) { toast.error("Select a customer"); return; }
    if (form.items.length === 0) { toast.error("Add at least one item"); return; }
    if (form.items.some(i => !i.product_id)) { toast.error("Select a product for all items"); return; }
    try {
      await API.post("/orders", form);
      toast.success("Order created");
      setDialogOpen(false);
      fetchOrders();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to create order"); }
  };

  const viewDetail = async (orderId) => {
    try {
      const { data } = await API.get(`/orders/${orderId}`);
      setSelectedOrder(data);
      setDetailOpen(true);
    } catch (err) { toast.error("Failed to load order"); }
  };

  const assignSupplier = async (orderId, itemId, supplierId, supplierName) => {
    try {
      const { data } = await API.put(`/orders/${orderId}/assign-supplier`, { item_id: itemId, supplier_id: supplierId, supplier_name: supplierName });
      setSelectedOrder(data);
      toast.success("Supplier assigned");
      fetchOrders();
    } catch (err) { toast.error("Failed to assign supplier"); }
  };

  const updateStatus = async (orderId, status, itemIds = null) => {
    try {
      const { data } = await API.put(`/orders/${orderId}/status`, { status, item_ids: itemIds });
      setSelectedOrder(data);
      toast.success("Status updated");
      fetchOrders();
    } catch (err) { toast.error("Failed to update status"); }
  };

  const generateInvoice = async (orderId) => {
    try {
      await API.post(`/invoices/from-order/${orderId}`);
      toast.success("Invoice generated");
      fetchOrders();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to generate invoice"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this order?")) return;
    try {
      await API.delete(`/orders/${id}`);
      toast.success("Order deleted");
      fetchOrders();
    } catch (err) { toast.error("Failed to delete"); }
  };

  return (
    <div className="space-y-6" data-testid="orders-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>Orders</h1>
        <Button onClick={openNew} className="bg-[#0F172A] hover:bg-[#1E293B] rounded-sm gap-2" data-testid="create-order-button">
          <Plus size={16} /> New Order
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="order-search-input" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="order-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="ordered">Ordered</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
              No orders found. Create your first order.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead><tr><th>Order #</th><th>Customer</th><th>Items</th><th>Amount</th><th>Status</th><th>Date</th><th className="w-32">Actions</th></tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="cursor-pointer" onClick={() => viewDetail(o.id)}>
                      <td className="font-medium">{o.order_number}</td>
                      <td>{o.customer_name}</td>
                      <td>{o.items?.length || 0}</td>
                      <td>{"Rs. "}{fmt(o.total_amount)}</td>
                      <td><Badge variant="secondary" className={`${STATUS_COLORS[o.status]} text-xs rounded-full`}>{o.status}</Badge></td>
                      <td className="text-muted-foreground">{o.created_at?.slice(0, 10)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => generateInvoice(o.id)} data-testid={`generate-invoice-${o.id}`}>Invoice</Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(o.id)} data-testid={`delete-order-${o.id}`}><Trash2 size={14} /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Order Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>New Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Customer *</Label>
              <SearchableSelect options={customerOptions} value={form.customer_id} onSelect={selectCustomer} placeholder="Select customer..." searchPlaceholder="Search customers..." />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider">Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1 text-xs rounded-sm" data-testid="add-order-item-button">
                  <Plus size={14} /> Add Item
                </Button>
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} className="border rounded-sm p-3 space-y-3 bg-[#F8FAFC]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">ITEM {idx + 1}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(idx)}><X size={14} /></Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Product</Label>
                      <SearchableSelect options={productOptions} value={item.product_id} onSelect={v => updateItem(idx, "product_id", v)} placeholder="Select product..." />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Supplier (optional)</Label>
                      <SearchableSelect options={supplierOptions} value={item.supplier_id} onSelect={v => updateItem(idx, "supplier_id", v)} placeholder="Assign supplier..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Quantity</Label>
                      <Input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value === "" ? "" : parseFloat(e.target.value))} data-testid={`order-item-qty-${idx}`} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Unit Price</Label>
                      <Input type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", e.target.value === "" ? "" : parseFloat(e.target.value))} data-testid={`order-item-price-${idx}`} />
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium">Amount: {"Rs. "}{fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))}</div>
                </div>
              ))}
              {form.items.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm border border-dashed rounded-sm">
                  Click "Add Item" to start adding products
                </div>
              )}
            </div>

            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Order notes (optional)" className="min-h-[60px]" data-testid="order-notes-input" />

            <div className="text-right text-lg font-semibold border-t pt-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Total: {"Rs. "}{fmt(orderTotal)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-sm">Cancel</Button>
            <Button onClick={handleCreate} className="bg-[#0F172A] hover:bg-[#1E293B] rounded-sm" data-testid="submit-order-button">Create Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>
              {selectedOrder?.order_number} — {selectedOrder?.customer_name}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="secondary" className={`${STATUS_COLORS[selectedOrder.status]} text-xs rounded-full`}>{selectedOrder.status}</Badge>
                <span className="text-sm text-muted-foreground">{selectedOrder.created_at?.slice(0, 10)}</span>
                <span className="text-sm font-semibold ml-auto">{"Rs. "}{fmt(selectedOrder.total_amount)}</span>
              </div>

              {typeof selectedOrder.total_profit === "number" && (
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-sm text-sm">
                  <span className="text-muted-foreground">Estimated Profit</span>
                  <span className="font-semibold text-emerald-700" data-testid="order-total-profit">Rs. {fmt(selectedOrder.total_profit)}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Items</Label>
                {selectedOrder.items?.map((item, idx) => (
                  <div key={item.id} className="border rounded-sm p-3 bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{item.product_name}</span>
                      <Badge variant="secondary" className={`${STATUS_COLORS[item.status]} text-xs rounded-full`}>{item.status}</Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm text-muted-foreground">
                      <span>Qty: {item.quantity}</span>
                      <span>Price: {"Rs. "}{fmt(item.unit_price)}</span>
                      <span>Amount: {"Rs. "}{fmt(item.amount)}</span>
                      <span className="flex items-center gap-1">
                        <Truck size={12} /> {item.supplier_name || "Not assigned"}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {!item.supplier_id && (
                        <SearchableSelect
                          options={supplierOptions}
                          value=""
                          onSelect={v => {
                            const sup = suppliers.find(s => s.id === v);
                            if (sup) assignSupplier(selectedOrder.id, item.id, v, sup.name);
                          }}
                          placeholder="Assign supplier..."
                          className="h-7 text-xs"
                        />
                      )}
                      {item.status === "pending" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs rounded-sm" onClick={() => updateStatus(selectedOrder.id, "ordered", [item.id])} data-testid={`mark-ordered-${item.id}`}>
                          Mark Ordered
                        </Button>
                      )}
                      {item.status === "ordered" && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs rounded-sm" onClick={() => updateStatus(selectedOrder.id, "delivered", [item.id])} data-testid={`mark-delivered-${item.id}`}>
                            Mark Delivered
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs rounded-sm text-muted-foreground" onClick={() => updateStatus(selectedOrder.id, "pending", [item.id])} data-testid={`undo-ordered-${item.id}`}>
                            ↶ Undo
                          </Button>
                        </>
                      )}
                      {item.status === "delivered" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs rounded-sm text-muted-foreground" onClick={() => updateStatus(selectedOrder.id, "ordered", [item.id])} data-testid={`undo-delivered-${item.id}`}>
                          ↶ Undo
                        </Button>
                      )}
                      {typeof item.profit === "number" && (
                        <span className="ml-auto text-xs font-semibold text-emerald-600">Profit: Rs. {fmt(item.profit)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {selectedOrder.notes && (
                <div><Label className="text-xs font-bold uppercase tracking-wider">Notes</Label><p className="text-sm mt-1">{selectedOrder.notes}</p></div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                {selectedOrder.status !== "delivered" && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-xs" onClick={() => updateStatus(selectedOrder.id, "delivered")} data-testid="mark-all-delivered">
                    Mark All Delivered
                  </Button>
                )}
                <Button size="sm" variant="outline" className="rounded-sm text-xs" onClick={() => generateInvoice(selectedOrder.id)} data-testid="generate-invoice-from-detail">
                  Generate Invoice
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
