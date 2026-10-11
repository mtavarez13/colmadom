
"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Truck, 
  MapPin, 
  ToggleLeft, 
  ToggleRight, 
  Navigation, 
  Loader2, 
  UserPlus,
  Plus,
  ShieldCheck,
  Package,
  CheckCircle2,
  Phone,
  ArrowRight,
  ExternalLink,
  Locate,
  Clock,
  XCircle,
  BellRing,
  Zap,
  DollarSign,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  History,
  Wallet,
  TrendingUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, getDocs, increment, runTransaction } from "firebase/firestore";
import { setDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const dynamic = 'force-dynamic';

export default function DriverDashboard() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isAvailable, setIsAvailable] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [collectingOrder, setCollectingOrder] = useState<any>(null);
  const [cashReceived, setCashReceived] = useState('');

  useEffect(() => { setMounted(true); }, []);

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc(profileRef);

  const driverRef = useMemoFirebase(() => {
    if (!profile?.driverId || !profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId, "drivers", profile.driverId);
  }, [db, profile?.driverId, profile?.colmadoId]);
  const { data: driverProfile } = useDoc(driverRef);

  const ordersQuery = useMemoFirebase(() => {
    if (!profile?.driverId || !profile?.colmadoId) return null;
    return query(
      collection(db, "colmados", profile.colmadoId, "orders"),
      where("assignedDriverId", "==", profile.driverId)
    );
  }, [db, profile?.driverId, profile?.colmadoId]);
  const { data: assignedOrders, isLoading: isOrdersLoading } = useCollection(ordersQuery);
  const myOrders = useMemo(() => (assignedOrders || []).filter(order => ['Assigned', 'Accepted'].includes(order.status))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))), [assignedOrders]);

  // Historial de hoy para resumen de recaudación
  const historyQuery = useMemoFirebase(() => {
    if (!user?.uid || !profile?.driverId || !profile?.colmadoId) return null;
    return query(
      collection(db, "colmados", profile.colmadoId, "transactions"),
      where("driverUid", "==", user.uid)
    );
  }, [db, user?.uid, profile?.driverId, profile?.colmadoId]);
  const { data: driverTransactions } = useCollection(historyQuery);
  const todayTransactions = useMemo(() => (driverTransactions || []).filter(tx => String(tx.createdAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [driverTransactions]);
  const heldTransactions = useMemo(() => (driverTransactions || []).filter(tx => tx.transactionType === 'OrderDelivery' && tx.cashSettlementStatus === 'Held'), [driverTransactions]);
  const availableCash = heldTransactions.reduce((sum, tx) => sum + (Number(tx.cashAmount) || 0), 0);
  const awaitingCash = (driverTransactions || []).filter(tx => tx.cashSettlementStatus === 'Pending').reduce((sum, tx) => sum + (Number(tx.cashAmount) || 0), 0);

  const colmadoRef = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);
  const { data: colmado } = useDoc(colmadoRef);

  const earnings = useMemo(() => {
    if (!todayTransactions) return { total: 0, count: 0 };
    return todayTransactions.reduce((acc, tx) => ({
      total: acc.total + (Number(tx.totalAmount) || 0),
      count: acc.count + 1
    }), { total: 0, count: 0 });
  }, [todayTransactions]);

  useEffect(() => {
    if (driverProfile) setIsAvailable(!!driverProfile.isAvailable);
  }, [driverProfile]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAvailable && profile?.driverId && profile?.colmadoId) {
      interval = setInterval(() => backgroundUpdateLocation(), 120000);
    }
    return () => clearInterval(interval);
  }, [isAvailable, profile?.driverId, profile?.colmadoId]);

  const backgroundUpdateLocation = () => {
    if (!profile?.driverId || !profile?.colmadoId || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "drivers", profile.driverId), {
        currentLatitude: pos.coords.latitude,
        currentLongitude: pos.coords.longitude,
        lastLocationUpdate: new Date().toISOString()
      });
    }, () => {});
  };

  const toggleAvailability = () => {
    if (!profile?.driverId || !profile?.colmadoId) return;
    const newStatus = !isAvailable;
    setIsAvailable(newStatus);
    updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "drivers", profile.driverId), {
      isAvailable: newStatus,
      updatedAt: new Date().toISOString()
    });
    toast({ title: newStatus ? "Estás en línea" : "Estás fuera de línea" });
    if (newStatus) updateCurrentLocation();
  };

  const updateCurrentLocation = () => {
    if (!profile?.driverId || !profile?.colmadoId || !navigator.geolocation) return;
    setIsUpdatingLocation(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "drivers", profile.driverId), {
        currentLatitude: pos.coords.latitude,
        currentLongitude: pos.coords.longitude,
        lastLocationUpdate: new Date().toISOString()
      });
      toast({ title: "Ubicación Sincronizada" });
      setIsUpdatingLocation(false);
    }, (error) => {
      setIsUpdatingLocation(false);
      toast({ variant: "destructive", title: "Error GPS" });
    }, { enableHighAccuracy: true });
  };

  const handleAcceptOrder = (orderId: string) => {
    if (!profile?.colmadoId) return;
    setIsProcessingAction(true);
    updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "orders", orderId), {
      status: "Accepted",
      acceptedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    toast({ title: "Pedido Aceptado" });
    setIsProcessingAction(false);
  };

  const handleDeclineOrder = (orderId: string) => {
    if (!profile?.colmadoId) return;
    setIsProcessingAction(true);
    updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "orders", orderId), {
      status: "Pending",
      assignedDriverId: null,
      updatedAt: new Date().toISOString()
    });
    toast({ variant: "destructive", title: "Pedido Rechazado" });
    setIsProcessingAction(false);
  };

  const handleMarkAsDelivered = async (order: any) => {
    if (!profile?.colmadoId || !profile?.driverId || !user) return;
    const total = Number(order.totalAmount) || 0;
    const received = Number(cashReceived);
    if (total <= 0 || !Number.isFinite(received) || received < total) {
      toast({ variant: 'destructive', title: 'Indica el efectivo recibido', description: 'Debe cubrir el total de la orden.' });
      return;
    }
    setIsProcessingAction(true);
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
        itemsForReceipt.push({ ...itemData, costPrice });
        calculatedTotalCost += (costPrice * itemData.quantity);

      });
      const transactionId = `txn_drv_${order.id}`;
      const now = new Date().toISOString();
      const orderRef = doc(db, 'colmados', colmadoId, 'orders', order.id);
      const transactionRef = doc(db, 'colmados', colmadoId, 'transactions', transactionId);
      await runTransaction(db, async transaction => {
        const currentOrder = await transaction.get(orderRef);
        const currentSale = await transaction.get(transactionRef);
        if (!currentOrder.exists() || currentOrder.data().assignedDriverId !== profile.driverId || currentOrder.data().status !== 'Accepted' || currentSale.exists())
          throw new Error('Esta orden ya cambió de estado. Actualiza la pantalla.');
        transaction.update(orderRef, { status: 'Delivered', deliveredAt: now, updatedAt: now });
        transaction.set(transactionRef, {
        id: transactionId, colmadoId, transactionType: "OrderDelivery", userId: user.uid,
        cashierName: driverProfile?.fullName || "Repartidor", totalAmount: order.totalAmount,
        totalCost: calculatedTotalCost, paymentMethod: "Efectivo", paidAmount: total, cashAmount: total,
        receivedAmount: received, changeGiven: received - total, isComplete: true, customerName: order.customerName,
        cashRegisterSessionId: 'delivery_pending', cashSettlementStatus: 'Held', createdAt: now, orderId: order.id,
        driverId: profile.driverId, driverUid: user.uid, items: itemsForReceipt
        });
        itemsSnapshot.forEach(itemDoc => {
          const item = itemDoc.data();
          if (item.productId) transaction.update(doc(db, 'colmados', colmadoId, 'products', item.productId), { quantityInStock: increment(-(Number(item.quantity) || 0)) });
        });
      });

      setCollectingOrder(null); setCashReceived('');
      toast({ title: 'Entrega cobrada', description: `RD$${total.toLocaleString()} quedaron en tu cartera Delivery hasta el desembolso.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Error en entrega", description: e instanceof Error ? e.message : '' });
    } finally { setIsProcessingAction(false); }
  };

  const requestSettlement = async () => {
    if (!user || availableCash <= 0) return;
    setIsProcessingAction(true);
    try {
      const response = await fetch('/api/delivery-settlements', { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}`
      }, body: JSON.stringify({ action: 'request' }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo desembolsar.');
      toast({ title: 'Desembolso enviado a caja', description: `RD$${Number(result.amount).toLocaleString()} esperan aceptación del cajero.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo desembolsar', description: error instanceof Error ? error.message : '' });
    } finally { setIsProcessingAction(false); }
  };

  const openInMaps = (address: string) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, "_blank");
  };

  if (isUserLoading || isOrdersLoading || !mounted) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-muted/30">
      <Loader2 className="animate-spin h-10 w-10 text-primary" />
      <p className="font-black text-primary uppercase">Sincronizando Hoja de Ruta...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto space-y-6 pb-32">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="h-14 w-14 bg-accent rounded-2xl flex items-center justify-center text-white shadow-xl rotate-3">
               <Truck className="h-8 w-8" />
             </div>
             <div>
               <h1 className="text-xl font-black text-primary leading-tight">{driverProfile?.fullName}</h1>
               <p className="text-[10px] text-muted-foreground font-bold uppercase">{colmado?.name}</p>
             </div>
           </div>
           <Button 
            variant={isAvailable ? "default" : "secondary"} 
            className={cn(
              "rounded-xl font-black h-12 gap-2 shadow-lg",
              isAvailable ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100' : 'bg-muted opacity-50'
            )}
            onClick={toggleAvailability}
          >
            {isAvailable ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
            {isAvailable ? "EN LÍNEA" : "OFFLINE"}
          </Button>
        </div>
      </header>

      {/* RESUMEN DEL DÍA */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-primary text-white border-none rounded-[2rem] overflow-hidden relative shadow-xl">
           <div className="absolute right-[-10px] top-[-10px] opacity-10 rotate-12"><TrendingUp className="h-16 w-16" /></div>
           <CardContent className="p-5 space-y-1">
              <p className="text-[8px] font-black uppercase opacity-60 tracking-widest leading-none">Recaudado Hoy</p>
              <p className="text-xl font-black">RD${earnings.total.toLocaleString()}</p>
           </CardContent>
        </Card>
        <Card className="bg-white border-2 border-primary/10 rounded-[2rem] overflow-hidden shadow-lg">
           <CardContent className="p-5 space-y-1">
              <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest leading-none">Viajes Realizados</p>
              <p className="text-xl font-black text-primary">{earnings.count} entregas</p>
           </CardContent>
        </Card>
      </div>

      <Card className="rounded-[2rem] border-2 border-accent/20 bg-accent/5 shadow-lg">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 font-black text-primary"><Wallet className="h-5 w-5" /> Efectivo Delivery</div>
          <div className="grid grid-cols-2 gap-4"><div><p className="text-xs text-muted-foreground">Por desembolsar</p><p className="text-2xl font-black">RD${availableCash.toLocaleString()}</p></div><div><p className="text-xs text-muted-foreground">Esperando al cajero</p><p className="text-2xl font-black">RD${awaitingCash.toLocaleString()}</p></div></div>
          <Button className="w-full h-12 font-black" disabled={availableCash <= 0 || isProcessingAction} onClick={requestSettlement}>Desembolsar a caja</Button>
          <p className="text-xs text-muted-foreground">Al solicitarlo, tu efectivo por desembolsar queda en cero. El cajero debe aceptarlo para que entre a su cuadre.</p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
           <h2 className="text-lg font-black text-primary flex items-center gap-2">
              <BellRing className={cn("h-5 w-5", myOrders?.length && "text-accent animate-bounce")} />
              Pendientes ({myOrders?.length || 0})
           </h2>
           <Badge variant="outline" className="text-[8px] font-black h-5 uppercase">Ruta Activa</Badge>
        </div>

        {(!myOrders || myOrders.length === 0) ? (
          <Card className="border-dashed border-4 py-20 text-center rounded-[2.5rem] opacity-30">
             <div className="space-y-4">
                <Package className="h-12 w-12 mx-auto" />
                <p className="text-sm font-black uppercase tracking-widest">Esperando pedidos...</p>
             </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {myOrders.map(order => (
              <Card key={order.id} className={cn(
                "rounded-[2.5rem] border-none shadow-2xl overflow-hidden transition-all",
                order.status === 'Assigned' ? 'ring-4 ring-accent bg-accent/5' : 'bg-white'
              )}>
                <CardHeader className="bg-muted/30 p-6 flex flex-row items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black uppercase">{order.customerName[0]}</div>
                      <div>
                         <CardTitle className="text-md font-black uppercase leading-none">{order.customerName}</CardTitle>
                         <p className="text-[9px] font-bold text-muted-foreground mt-1 uppercase">RD${order.totalAmount?.toLocaleString()}</p>
                      </div>
                   </div>
                   <Badge className={cn(
                     "text-[8px] font-black uppercase px-2 py-0.5 border-none",
                     order.status === 'Assigned' ? 'bg-accent' : 'bg-emerald-500'
                   )}>
                      {order.status === 'Assigned' ? 'NUEVO' : 'ACEPTADO'}
                   </Badge>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                   <div className="space-y-3 bg-muted/10 p-4 rounded-2xl border">
                      <div className="flex items-start gap-2">
                         <MapPin className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                         <p className="text-xs font-bold leading-relaxed">{order.customerAddress}</p>
                      </div>
                      {!!order.customerNotes && <p className="rounded-xl bg-accent/10 p-3 text-xs font-bold">Nota del cliente: {order.customerNotes}</p>}
                      <Button variant="link" className="p-0 h-auto text-[10px] font-black text-accent gap-1" onClick={() => openInMaps(order.customerAddress)}>
                         <ExternalLink className="h-3 w-3" /> VER RUTA EN MAPA
                      </Button>
                   </div>

                   <div className="space-y-3">
                      <div 
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                      >
                         <h3 className="font-black text-xs uppercase tracking-widest text-primary flex items-center gap-2">
                            <Package className="h-4 w-4" /> Detalle de Carga
                         </h3>
                         {expandedOrderId === order.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                      
                      {expandedOrderId === order.id && (
                        <div className="animate-in slide-in-from-top-2 duration-300">
                           <ScrollArea className="h-40 border-2 border-dashed rounded-xl bg-muted/5 p-2">
                              <OrderItemsFetcher orderId={order.id} colmadoId={profile?.colmadoId} />
                           </ScrollArea>
                        </div>
                      )}
                   </div>

                   <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 flex-1">
                         <Phone className="h-3.5 w-3.5 text-emerald-500" />
                         <span className="text-xs font-black font-mono">{order.customerPhone}</span>
                      </div>
                      {order.customerPhone && (
                        <Button size="sm" variant="outline" className="h-9 px-4 rounded-xl border-emerald-500 text-emerald-600 font-black text-[10px]" onClick={() => window.open(`https://wa.me/${order.customerPhone.replace(/\D/g, "")}`, "_blank")}>
                           WHATSAPP
                        </Button>
                      )}
                   </div>

                   <Separator className="opacity-50" />

                   <div className="flex gap-3">
                      {order.status === 'Assigned' ? (
                        <>
                           <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black text-destructive hover:bg-destructive/5" onClick={() => handleDeclineOrder(order.id)} disabled={isProcessingAction}>
                              <XCircle className="mr-2 h-4 w-4" /> RECHAZAR
                           </Button>
                           <Button className="flex-[2] h-14 rounded-2xl bg-accent font-black text-lg shadow-lg gap-2" onClick={() => handleAcceptOrder(order.id)} disabled={isProcessingAction}>
                              <Zap className="h-5 w-5" /> ACEPTAR
                           </Button>
                        </>
                      ) : (
                        <Button className="w-full h-16 rounded-2xl bg-emerald-600 font-black text-xl shadow-xl gap-3" onClick={() => { setCollectingOrder(order); setCashReceived(''); }} disabled={isProcessingAction}>
                           <CheckCircle2 className="h-7 w-7" /> ENTREGAR Y COBRAR
                        </Button>
                      )}
                   </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!collectingOrder} onOpenChange={open => { if (!open && !isProcessingAction) setCollectingOrder(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Confirmar entrega y cobro</DialogTitle><DialogDescription>Cuenta el efectivo recibido antes de registrar la entrega.</DialogDescription></DialogHeader>
          <div className="space-y-3"><p className="font-bold">Total de la orden: RD${Number(collectingOrder?.totalAmount || 0).toLocaleString()}</p><Label htmlFor="delivery-cash-received">Efectivo recibido</Label><Input id="delivery-cash-received" type="number" min="0" step="0.01" value={cashReceived} onChange={event => setCashReceived(event.target.value)} /><p>Devuelta: RD${Math.max(0, Number(cashReceived || 0) - Number(collectingOrder?.totalAmount || 0)).toLocaleString()}</p></div>
          <DialogFooter><Button disabled={isProcessingAction || !collectingOrder || Number(cashReceived) < Number(collectingOrder.totalAmount)} onClick={() => handleMarkAsDelivered(collectingOrder)}>Confirmar entrega</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HISTORIAL RECIENTE */}
      <div className="space-y-4">
         <h3 className="font-black text-xs uppercase tracking-[0.2em] text-muted-foreground px-2 flex items-center gap-2">
            <History className="h-4 w-4" /> Entregas Recientes
         </h3>
         <div className="space-y-2">
            {todayTransactions?.slice(0, 3).map(tx => (
               <Card key={tx.id} className="rounded-2xl border-none shadow-md bg-white p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="h-8 w-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center"><CheckCircle2 className="h-4 w-4" /></div>
                     <div>
                        <p className="text-[10px] font-black uppercase text-primary leading-none">{tx.customerName}</p>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase">{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                     </div>
                  </div>
                  <p className="font-black text-xs">RD${tx.totalAmount.toLocaleString()}</p>
               </Card>
            ))}
         </div>
      </div>
    </div>
  );
}

function OrderItemsFetcher({ orderId, colmadoId }: { orderId: string; colmadoId: string | undefined }) {
  const db = useFirestore();
  const itemsRef = useMemoFirebase(() => {
    if (!colmadoId || !orderId) return null;
    return collection(db, "colmados", colmadoId, "orders", orderId, "items");
  }, [colmadoId, orderId]);
  
  const { data: items, isLoading } = useCollection(itemsRef);

  if (isLoading) return <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto h-5 w-5 text-primary opacity-20" /></div>;
  if (!items || items.length === 0) return <p className="text-[10px] text-center py-4 opacity-50 font-bold uppercase">Sin artículos.</p>;

  return (
    <div className="space-y-2">
      {items.map((item: any) => (
        <div key={item.id} className="flex justify-between items-center text-[10px] py-1 border-b last:border-0 border-primary/5">
          <div className="flex-1 min-w-0 pr-2">
            <p className="font-black truncate uppercase text-primary">{item.productName}</p>
            <p className="text-[8px] text-muted-foreground font-bold">{item.quantity?.toFixed(1)} x RD${item.unitPrice?.toLocaleString()}</p>
          </div>
          <span className="font-black">RD${item.lineTotal?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
