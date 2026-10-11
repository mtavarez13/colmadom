
"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { 
  Package, 
  Clock, 
  CheckCircle2, 
  Truck, 
  XCircle, 
  MapPin, 
  User, 
  Phone,
  Loader2,
  Receipt,
  Search,
  ChevronRight,
  MoreVertical,
  Printer,
  Banknote,
  UserPlus,
  Send,
  MessageSquare,
  PlayCircle,
  Zap,
  BellRing,
  Calendar,
  History,
  Filter,
  Plus,
  Minus,
  Trash2
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, getDocs, increment, orderBy, writeBatch } from "firebase/firestore";
import { setDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export const dynamic = 'force-dynamic';

function orderDate(value: unknown): Date | null {
  if (!value) return null;
  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function')
    date = value.toDate() as Date;
  else if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number')
    date = new Date(value.seconds * 1000);
  else return null;
  return Number.isNaN(date.getTime()) ? null : date;
}

function orderDateKey(value: unknown): string {
  const date = orderDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function orderDateLabel(value: unknown): string {
  return orderDate(value)?.toLocaleString() || '-';
}

export default function OrdersPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<any>(null);
  const [orderItemsForPrint, setOrderItemsForPrint] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);
  const [isAutoPrintEnabled, setIsAutoPrintEnabled] = useState(false);
  const [isManualOrderOpen, setIsManualOrderOpen] = useState(false);
  const [isSavingManualOrder, setIsSavingManualOrder] = useState(false);
  const [manualProductSearch, setManualProductSearch] = useState('');
  const [manualItems, setManualItems] = useState<{ productId: string; quantity: number }[]>([]);
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerPhone, setManualCustomerPhone] = useState('');
  const [manualCustomerAddress, setManualCustomerAddress] = useState('');
  const [manualCustomerNotes, setManualCustomerNotes] = useState('');
  const [manualDriverId, setManualDriverId] = useState('');
  const [manualDeliveryFee, setManualDeliveryFee] = useState('0');
  
  const lastOrderCount = useRef<number>(0);

  useEffect(() => {
    setMounted(true);
    
    // Inicializar rango de fechas: hoy y hace 7 días
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    setStartDate(lastWeek.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);

    // Cargar preferencia de auto-impresión si existe
    const saved = localStorage.getItem('auto_print_orders');
    if (saved === 'true') setIsAutoPrintEnabled(true);
  }, []);

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);

  const { data: profile, isLoading: isProfileLoading } = useDoc(profileRef);

  const colmadoRef = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);

  const { data: colmado, isLoading: isColmadoLoading } = useDoc(colmadoRef);

  const ordersQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return query(
      collection(db, "colmados", profile.colmadoId, "orders"),
      orderBy("createdAt", "desc")
    );
  }, [db, profile?.colmadoId]);

  const { data: orders, isLoading: isOrdersLoading } = useCollection(ordersQuery);

  const productsQuery = useMemoFirebase(() => profile?.colmadoId
    ? collection(db, 'colmados', profile.colmadoId, 'products') : null,
    [db, profile?.colmadoId]);
  const driversQuery = useMemoFirebase(() => profile?.colmadoId
    ? collection(db, 'colmados', profile.colmadoId, 'drivers') : null,
    [db, profile?.colmadoId]);
  const { data: manualProducts } = useCollection(productsQuery);
  const { data: manualDrivers } = useCollection(driversQuery);
  const availableManualProducts = useMemo(() => (manualProducts || [])
    .filter(product => Number(product.salePrice) > 0 && Number(product.quantityInStock) > 0 && !product.isCombo && !product.isExtra)
    .filter(product => `${product.name || ''} ${product.barcode || ''}`.toLowerCase().includes(manualProductSearch.toLowerCase()))
    .slice(0, 25), [manualProducts, manualProductSearch]);
  const manualOrderLines = useMemo(() => manualItems.map(item => {
    const product = (manualProducts || []).find(candidate => candidate.id === item.productId);
    return product ? { ...item, product, lineTotal: Math.round(Number(product.salePrice) * item.quantity * 100) / 100 } : null;
  }).filter(Boolean) as { productId: string; quantity: number; product: any; lineTotal: number }[], [manualItems, manualProducts]);
  const manualSubtotal = Math.round(manualOrderLines.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
  const manualFee = Number(manualDeliveryFee) || 0;
  const manualTotal = Math.round((manualSubtotal + manualFee) * 100) / 100;

  const addManualProduct = (product: any) => {
    setManualItems(previous => {
      const current = previous.find(item => item.productId === product.id);
      if (current) return previous.map(item => item.productId === product.id
        ? { ...item, quantity: Math.min(Number(product.quantityInStock), item.quantity + 1) } : item);
      return [...previous, { productId: product.id, quantity: 1 }];
    });
  };

  const saveManualOrder = async () => {
    if (!profile?.colmadoId || !user || isSavingManualOrder) return;
    const phone = manualCustomerPhone.replace(/\D/g, '');
    if (!manualOrderLines.length || manualOrderLines.length !== manualItems.length || !manualCustomerName.trim() ||
        !manualCustomerAddress.trim() || phone.length < 10 || !manualDriverId ||
        !(manualDrivers || []).some(driver => driver.id === manualDriverId) ||
        !Number.isFinite(manualFee) || manualFee < 0 || manualTotal <= 0 ||
        manualOrderLines.some(item => item.quantity <= 0 || item.quantity > Number(item.product.quantityInStock))) {
      toast({ variant: 'destructive', title: 'Revisa el pedido', description: 'Completa mercancías, cliente, teléfono, dirección y repartidor; verifica las cantidades.' });
      return;
    }
    setIsSavingManualOrder(true);
    try {
      const orderRef = doc(collection(db, 'colmados', profile.colmadoId, 'orders'));
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      batch.set(orderRef, {
        id: orderRef.id, colmadoId: profile.colmadoId, source: 'manual', createdBy: user.uid,
        customerName: manualCustomerName.trim(), customerPhone: phone,
        customerAddress: manualCustomerAddress.trim(), customerNotes: manualCustomerNotes.trim(),
        subtotalAmount: manualSubtotal, deliveryFee: manualFee, totalAmount: manualTotal,
        status: 'Assigned', assignedDriverId: manualDriverId, assignedAt: now,
        createdAt: now, updatedAt: now
      });
      manualOrderLines.forEach(item => {
        const itemRef = doc(collection(db, 'colmados', profile.colmadoId, 'orders', orderRef.id, 'items'));
        batch.set(itemRef, {
          id: itemRef.id, orderId: orderRef.id, productId: item.productId,
          productName: item.product.name, quantity: item.quantity,
          unitPrice: Number(item.product.salePrice), lineTotal: item.lineTotal, isBreakdown: false
        });
      });
      await batch.commit();
      setIsManualOrderOpen(false); setManualProductSearch(''); setManualItems([]);
      setManualCustomerName(''); setManualCustomerPhone(''); setManualCustomerAddress('');
      setManualCustomerNotes(''); setManualDriverId(''); setManualDeliveryFee('0');
      toast({ title: 'Pedido manual asignado', description: 'El repartidor ya puede verlo en Mi Ruta (Delivery).' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo crear el pedido', description: error instanceof Error ? error.message : '' });
    } finally { setIsSavingManualOrder(false); }
  };

  // Lógica de Notificación
  useEffect(() => {
    if (mounted && orders && orders.length > lastOrderCount.current) {
      const newOrder = orders[0]; // La más reciente
      if (newOrder.status === 'Pending' && lastOrderCount.current > 0) {
        toast({ title: "¡Nuevo Pedido!", description: `Has recibido un pedido de ${newOrder.customerName}.` });
        if (isAutoPrintEnabled) {
          handlePrintTicket(newOrder);
        }
      }
    }
    if (orders) {
      lastOrderCount.current = orders.length;
    }
  }, [orders, isAutoPrintEnabled, mounted, toast]);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(o => {
      const dateStr = orderDateKey(o.createdAt);
      const isInRange = dateStr >= startDate && dateStr <= endDate;
      const matchesSearch = String(o.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          String(o.id || '').toLowerCase().includes(searchTerm.toLowerCase());
      return isInRange && matchesSearch;
    }).sort((a, b) => (orderDate(b.createdAt)?.getTime() || 0) - (orderDate(a.createdAt)?.getTime() || 0));
  }, [orders, searchTerm, startDate, endDate]);

  const handlePrintTicket = async (order: any) => {
    if (!profile?.colmadoId) return;
    try {
      const itemsSnap = await getDocs(collection(db, "colmados", profile.colmadoId, "orders", order.id, "items"));
      const items: any[] = [];
      itemsSnap.forEach(d => items.push(d.data()));
      setOrderItemsForPrint(items);
      setSelectedOrderForPrint(order);
      
      toast({ title: "Ticket Preparado", description: "El ticket está listo para imprimir." });
    } catch (e) {
      toast({ title: "Error", description: "No se pudieron cargar los artículos.", variant: "destructive" });
    }
  };

  const triggerPrint = () => {
    if (selectedOrderForPrint) {
      window.print();
    }
  };

  const handleToggleAutoPrint = (val: boolean) => {
    setIsAutoPrintEnabled(val);
    localStorage.setItem('auto_print_orders', String(val));
    toast({ title: val ? "Notificación Activa" : "Notificación Silenciosa" });
  };

  const handleStartPreparation = (orderId: string) => {
    if (!profile?.colmadoId) return;
    updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "orders", orderId), {
      status: "Preparing",
      updatedAt: new Date().toISOString()
    });
    toast({ title: "Preparando Orden" });
  };

  const handleDispatchOrder = (orderId: string) => {
    if (!profile?.colmadoId) return;
    updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "orders", orderId), {
      status: "Dispatched",
      updatedAt: new Date().toISOString()
    });
    toast({ title: "Orden Despachada" });
  };

  const handleMarkAsDelivered = async (order: any) => {
    if (!profile?.colmadoId) return;
    setIsProcessing(true);
    const colmadoId = profile.colmadoId;

    try {
      const itemsSnapshot = await getDocs(collection(db, "colmados", colmadoId, "orders", order.id, "items"));
      const itemsForReceipt: any[] = [];
      let calculatedTotalCost = 0;

      const productsSnapshot = await getDocs(collection(db, "colmados", colmadoId, "products"));
      const currentProducts = new Map();
      productsSnapshot.forEach(p => currentProducts.set(p.id, p.data()));

      itemsSnapshot.forEach((itemDoc) => {
        const itemData = itemDoc.data();
        const productInfo = currentProducts.get(itemData.productId);
        const costPrice = productInfo?.basePrice || 0;
        
        itemsForReceipt.push({
          ...itemData,
          costPrice: costPrice
        });
        
        calculatedTotalCost += (costPrice * itemData.quantity);

        updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "products", itemData.productId), {
          quantityInStock: increment(-itemData.quantity)
        });
      });

      updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "orders", order.id), {
        status: "Delivered",
        updatedAt: new Date().toISOString()
      });

      const transactionId = `txn_order_${order.id}`;
      const now = new Date().toISOString();
      setDocumentNonBlocking(doc(db, "colmados", colmadoId, "transactions", transactionId), {
        id: transactionId,
        colmadoId,
        transactionType: "OrderDelivery",
        userId: user?.uid,
        cashierName: profile?.firstName || "Cajero",
        totalAmount: order.totalAmount,
        totalCost: calculatedTotalCost,
        paymentMethod: "Efectivo",
        paidAmount: order.totalAmount,
        changeGiven: 0,
        isComplete: true,
        customerName: order.customerName,
        createdAt: now,
        orderId: order.id,
        cashRegisterSessionId: "active_session",
        items: itemsForReceipt
      }, { merge: true });

      toast({ title: "Orden Entregada", description: "Venta registrada como efectivo en caja." });
      setOrderItemsForPrint(itemsForReceipt);
      setSelectedOrderForPrint(order);
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isUserLoading || isProfileLoading || isColmadoLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-muted/30">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="font-bold text-primary">Cargando Pedidos...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 print:p-0">
      <style jsx global>{`
        @media print {
          @page { size: ${colmado?.printerPaperWidth === '58mm' ? '58mm' : '80mm'} auto; margin: 0; }
          body * { visibility: hidden !important; }
          .ticket-print-area, .ticket-print-area * { visibility: visible !important; }
          .ticket-print-area {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${colmado?.printerPaperWidth === '58mm' ? '52mm' : '74mm'} !important;
            padding: 2mm !important;
            font-family: 'Courier New', Courier, monospace !important;
            background: white !important;
            color: black !important;
            z-index: 9999 !important;
          }
        }
      `}</style>

      {/* TICKET DE IMPRESION PROFESIONAL */}
      {selectedOrderForPrint && colmado && (
        <div className="ticket-print-area hidden print:block">
          <div className="text-center mb-4">
            <h2 className="text-lg font-black uppercase">{colmado.name}</h2>
            <p className="text-[10px] leading-tight">{colmado.address}</p>
            <div className="border-b-2 border-black my-2" />
            <h3 className="font-bold uppercase text-xs">ORDEN DE PEDIDO</h3>
            <p className="text-[9px]">{mounted ? orderDateLabel(selectedOrderForPrint.createdAt) : ''}</p>
          </div>
          
          <div className="mb-4 text-[10px] space-y-1">
            <div className="bg-black/5 p-2 rounded mb-2">
              <p className="font-black">{selectedOrderForPrint.customerName}</p>
              <p>Dir: {selectedOrderForPrint.customerAddress}</p>
            </div>

            <div className="flex justify-between border-b border-black/20 pb-1 mb-1 font-bold mt-2">
              <span className="w-1/2 text-left">ARTÍCULO</span>
              <span className="w-1/4 text-right">CANT</span>
              <span className="w-1/4 text-right">TOTAL</span>
            </div>
            {orderItemsForPrint.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between py-0.5 border-b border-black/5 last:border-0">
                <span className="w-1/2 overflow-hidden whitespace-nowrap overflow-ellipsis">{item.productName}</span>
                <span className="w-1/4 text-right">{item.quantity.toFixed(1)}</span>
                <span className="w-1/4 text-right">RD${item.lineTotal.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="border-t-2 border-black pt-2 font-black text-sm flex justify-between">
            <span>TOTAL:</span>
            <span>RD${selectedOrderForPrint.totalAmount?.toLocaleString()}</span>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="p-3 bg-primary/10 rounded-2xl">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight text-primary">Pedidos Digitales</h1>
            <p className="text-muted-foreground mt-1 font-bold">Gestión de órdenes recibidas por el catálogo.</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3"><Button className="gap-2" onClick={() => setIsManualOrderOpen(true)}><Plus className="h-4 w-4" /> Crear pedido manual</Button><div className="flex items-center gap-4 bg-white p-3 rounded-2xl border shadow-sm">
          <div className="flex items-center gap-2">
            <BellRing className={`h-4 w-4 ${isAutoPrintEnabled ? 'text-accent animate-bounce' : 'text-muted-foreground'}`} />
            <div className="flex flex-col">
              <Label htmlFor="auto-print" className="text-[10px] font-black uppercase tracking-widest leading-none">Alertas</Label>
              <span className="text-[9px] text-muted-foreground font-bold">{isAutoPrintEnabled ? 'ON' : 'OFF'}</span>
            </div>
          </div>
          <Switch 
            id="auto-print" 
            checked={isAutoPrintEnabled} 
            onCheckedChange={handleToggleAutoPrint}
          />
        </div></div>
      </header>

      <Dialog open={isManualOrderOpen} onOpenChange={open => { if (!isSavingManualOrder) setIsManualOrderOpen(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Crear pedido manual</DialogTitle><DialogDescription>Selecciona mercancías, completa los datos del cliente y asigna el repartidor.</DialogDescription></DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2"><Label htmlFor="manual-product-search">Mercancías</Label><Input id="manual-product-search" placeholder="Buscar por nombre o código de barras" value={manualProductSearch} onChange={event => setManualProductSearch(event.target.value)} /><div className="max-h-44 overflow-y-auto rounded-xl border divide-y">{availableManualProducts.map(product => <button type="button" key={product.id} className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50" onClick={() => addManualProduct(product)}><span className="min-w-0"><span className="block truncate font-bold">{product.name}</span><span className="text-xs text-muted-foreground">Disponible: {Number(product.quantityInStock).toLocaleString()}</span></span><span className="shrink-0 font-bold">RD${Number(product.salePrice).toLocaleString()} <Plus className="inline h-4 w-4" /></span></button>)}{!availableManualProducts.length && <p className="p-4 text-sm text-muted-foreground">No hay mercancías disponibles.</p>}</div></div>
            <div className="space-y-2"><Label>Artículos del pedido</Label>{manualOrderLines.length ? manualOrderLines.map(item => <div key={item.productId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><div className="font-bold">{item.product.name}<p className="text-xs text-muted-foreground">RD${Number(item.product.salePrice).toLocaleString()} c/u</p></div><div className="flex items-center gap-2"><Button type="button" size="icon" variant="outline" onClick={() => setManualItems(previous => previous.map(line => line.productId === item.productId ? { ...line, quantity: Math.max(1, line.quantity - 1) } : line))}><Minus className="h-4 w-4" /></Button><span className="w-8 text-center font-bold">{item.quantity}</span><Button type="button" size="icon" variant="outline" onClick={() => addManualProduct(item.product)}><Plus className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" onClick={() => setManualItems(previous => previous.filter(line => line.productId !== item.productId))}><Trash2 className="h-4 w-4" /></Button></div><span className="font-bold">RD${item.lineTotal.toLocaleString()}</span></div>) : <p className="text-sm text-muted-foreground">Agrega al menos un artículo.</p>}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label htmlFor="manual-customer-name">Nombre del cliente</Label><Input id="manual-customer-name" value={manualCustomerName} onChange={event => setManualCustomerName(event.target.value)} /></div><div><Label htmlFor="manual-customer-phone">Teléfono del cliente</Label><Input id="manual-customer-phone" type="tel" value={manualCustomerPhone} onChange={event => setManualCustomerPhone(event.target.value)} /></div><div className="sm:col-span-2"><Label htmlFor="manual-customer-address">Dirección de entrega</Label><Input id="manual-customer-address" value={manualCustomerAddress} onChange={event => setManualCustomerAddress(event.target.value)} /></div><div className="sm:col-span-2"><Label htmlFor="manual-customer-notes">Notas para el repartidor (opcional)</Label><Input id="manual-customer-notes" value={manualCustomerNotes} onChange={event => setManualCustomerNotes(event.target.value)} /></div></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label htmlFor="manual-driver">Asignar Delivery</Label><select id="manual-driver" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={manualDriverId} onChange={event => setManualDriverId(event.target.value)}><option value="">Selecciona un repartidor</option>{(manualDrivers || []).map(driver => <option key={driver.id} value={driver.id}>{driver.fullName || driver.phoneNumber} {driver.isAvailable ? '· Disponible' : '· Fuera de línea'}</option>)}</select></div><div><Label htmlFor="manual-delivery-fee">Costo de entrega (RD$)</Label><Input id="manual-delivery-fee" type="number" min="0" step="0.01" value={manualDeliveryFee} onChange={event => setManualDeliveryFee(event.target.value)} /></div></div>
            <div className="rounded-xl bg-primary/5 p-4 font-bold"><div className="flex justify-between"><span>Mercancías</span><span>RD${manualSubtotal.toLocaleString()}</span></div><div className="flex justify-between"><span>Entrega</span><span>RD${manualFee.toLocaleString()}</span></div><div className="flex justify-between border-t pt-2 mt-2 text-lg"><span>Total a cobrar</span><span>RD${manualTotal.toLocaleString()}</span></div></div>
          </div><DialogFooter><Button variant="outline" onClick={() => setIsManualOrderOpen(false)} disabled={isSavingManualOrder}>Cancelar</Button><Button onClick={saveManualOrder} disabled={isSavingManualOrder || !manualOrderLines.length || !manualDriverId}>{isSavingManualOrder ? 'Guardando…' : 'Asignar pedido'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FILTRO POR RANGO DE FECHA */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-2xl border shadow-sm no-print">
        <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-widest">
          <Filter className="h-4 w-4" /> Periodo:
        </div>
        <div className="flex gap-2 bg-muted/30 p-1 rounded-xl w-full md:w-auto">
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
            className="bg-transparent text-sm font-bold p-2 outline-none" 
          />
          <span className="flex items-center text-muted-foreground font-black px-1">-</span>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
            className="bg-transparent text-sm font-bold p-2 outline-none" 
          />
        </div>
        <div className="flex-1 relative w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por cliente o ID..." 
            className="pl-11 h-11 bg-muted/10 rounded-xl font-bold border-none" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
        </div>
      </div>

      <Card className="shadow-2xl border-none overflow-hidden print:hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-black h-14 px-6">Cliente</TableHead>
                <TableHead className="font-black h-14">Dirección</TableHead>
                <TableHead className="font-black h-14 text-right">Monto</TableHead>
                <TableHead className="font-black h-14 text-center">Estado</TableHead>
                <TableHead className="text-right font-black h-14 px-6">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isOrdersLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-12 w-12 text-primary" /></TableCell></TableRow>
              ) : filteredOrders.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground font-black italic">No hay pedidos registrados.</TableCell></TableRow>
              ) : filteredOrders.map((order) => {
                const statusInfo = {
                  Pending: { label: 'Recibido', color: 'bg-orange-100 text-orange-700', icon: Clock },
                  Preparing: { label: 'Preparando', color: 'bg-blue-100 text-blue-700 animate-pulse', icon: PlayCircle },
                  Dispatched: { label: 'En Camino', color: 'bg-purple-100 text-purple-700 animate-pulse', icon: Truck },
                  Assigned: { label: 'Asignado', color: 'bg-accent/10 text-accent', icon: Truck },
                  Accepted: { label: 'Aceptado por Delivery', color: 'bg-blue-100 text-blue-700', icon: Truck },
                  Delivered: { label: 'Entregado', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 }
                }[order.status as 'Pending' | 'Preparing' | 'Dispatched' | 'Assigned' | 'Accepted' | 'Delivered'] || { label: order.status, color: 'bg-muted', icon: Package };

                return (
                  <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="px-6 py-5">
                      <p className="font-black text-md text-primary">{order.customerName}</p>
                      <p className="text-[9px] text-muted-foreground font-bold">{mounted ? orderDateLabel(order.createdAt) : '-'}</p>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[200px] truncate text-xs font-bold text-muted-foreground">{order.customerAddress}</p>
                    </TableCell>
                    <TableCell className="text-right font-black text-primary">
                       RD${order.totalAmount?.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`font-black uppercase text-[9px] border-none px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right px-6">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-9 w-9"
                          onClick={() => handlePrintTicket(order)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="font-black h-9">Detalles</Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle className="text-2xl font-black">Detalle de Orden</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="p-4 bg-muted/30 rounded-2xl">
                                 <p className="font-black text-lg">{order.customerName}</p>
                                 <p className="text-xs text-muted-foreground">{order.customerAddress}</p>
                                 {!!order.customerPhone && <p className="text-xs font-bold">Tel: {order.customerPhone}</p>}
                                 {!!order.customerNotes && <p className="mt-2 text-xs">Nota: {order.customerNotes}</p>}
                              </div>

                              <ScrollArea className="h-48 border rounded-xl p-4 bg-white">
                                 <OrderItemsFetcher orderId={order.id} colmadoId={profile.colmadoId} />
                              </ScrollArea>

                              <div className="flex justify-between items-center p-4 bg-primary/5 rounded-xl border-2 border-primary/10">
                                <span className="font-black text-primary uppercase text-xs">Total a Cobrar</span>
                                <span className="text-2xl font-black text-primary">RD${order.totalAmount?.toLocaleString()}</span>
                              </div>
                              
                              <div className="grid grid-cols-1 gap-2">
                                {order.status === 'Pending' && (
                                  <Button className="w-full h-14 font-black bg-blue-600 rounded-xl" onClick={() => handleStartPreparation(order.id)}>
                                    Preparar Pedido
                                  </Button>
                                )}
                                {order.status === 'Preparing' && (
                                  <Button className="w-full h-14 font-black bg-accent rounded-xl" onClick={() => handleDispatchOrder(order.id)}>
                                    Despachar Pedido
                                  </Button>
                                )}
                                {order.status === 'Dispatched' && !order.assignedDriverId && (
                                  <Button className="w-full h-14 font-black bg-emerald-600 rounded-xl" onClick={() => handleMarkAsDelivered(order)} disabled={isProcessing}>
                                    Confirmar Entrega
                                  </Button>
                                )}
                                {order.assignedDriverId && ['Assigned', 'Accepted', 'Dispatched'].includes(order.status) && <p className="rounded-xl bg-accent/10 p-3 text-sm font-bold text-accent">El repartidor asignado confirma la entrega y el cobro desde su panel.</p>}
                                <Button variant="outline" className="w-full h-12 font-black rounded-xl" onClick={() => { handlePrintTicket(order); setTimeout(triggerPrint, 500); }}>
                                  <Printer className="h-4 w-4 mr-2" /> Imprimir Ticket Manual
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function OrderItemsFetcher({ orderId, colmadoId }: { orderId: string; colmadoId: string }) {
  const db = useFirestore();
  const itemsRef = useMemoFirebase(() => {
    if (!colmadoId || !orderId) return null;
    return collection(db, "colmados", colmadoId, "orders", orderId, "items");
  }, [colmadoId, orderId]);
  
  const { data: items, isLoading } = useCollection(itemsRef);

  if (isLoading) return <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto h-8 w-8 text-primary" /></div>;
  if (!items || items.length === 0) return <p className="text-xs text-center py-4 opacity-50">Sin artículos.</p>;

  return (
    <div className="space-y-2">
      {items.map((item: any) => (
        <div key={item.id} className="flex justify-between items-center text-xs py-1 border-b last:border-0">
          <div className="flex-1 min-w-0 pr-2">
            <p className="font-bold truncate uppercase">{item.productName}</p>
            <p className="text-[10px] text-muted-foreground">{item.quantity?.toFixed(1)} x RD${item.unitPrice?.toLocaleString()}</p>
          </div>
          <span className="font-black">RD${item.lineTotal?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
