'use client';

import { useState, useEffect, useRef, useCallback } from "react";
import { useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, onSnapshot, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

/**
 * Componente global que escucha señales de impresión y pedidos en tiempo real.
 * Funciona en todos los módulos de la aplicación.
 * El Super Admin controla si el colmado puede usar la impresión remota mediante 'allowRemotePrinting'.
 */
export function KioskoPrintManager() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [printType, setPrintType] = useState<'sale' | 'closing' | 'order' | null>(null);
  const [saleData, setSaleData] = useState<any>(null);
  const [closingData, setClosingData] = useState<any>(null);
  const [orderData, setOrderData] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  
  const processedRequestsRef = useRef<Set<string>>(new Set());
  const notifiedSettlementsRef = useRef<Set<string>>(new Set());
  const soundCooldownRef = useRef<boolean>(false);

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc(profileRef);

  const colmadoRef = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);
  const { data: colmado } = useDoc(colmadoRef);

  const playAlertSound = useCallback(() => {
    if (soundCooldownRef.current || typeof window === 'undefined') return;
    try {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      audio.volume = 0.7;
      audio.play().catch(() => console.warn("Interacción necesaria para audio."));
      soundCooldownRef.current = true;
      setTimeout(() => { soundCooldownRef.current = false; }, 3000);
    } catch (e) {
      console.error("Audio error:", e);
    }
  }, []);

  useEffect(() => {
    if (!profile?.colmadoId || !['Cajero', 'Admin'].includes(String(profile.role))) return;
    notifiedSettlementsRef.current.clear();
    const pendingQuery = query(collection(db, 'colmados', profile.colmadoId, 'deliverySettlements'), where('status', '==', 'Pending'));
    return onSnapshot(pendingQuery, snapshot => {
      const fresh = snapshot.docs.filter(item => !notifiedSettlementsRef.current.has(item.id));
      snapshot.docs.forEach(item => notifiedSettlementsRef.current.add(item.id));
      if (fresh.length) toast({ title: 'Desembolso Delivery pendiente', description: `${fresh.length} entrega(s) de efectivo esperan tu aceptación en Cuadre de Caja.` });
    }, error => { if (error.code !== 'permission-denied') console.error('Error al escuchar desembolsos:', error); });
  }, [db, profile?.colmadoId, profile?.role, toast]);

  useEffect(() => {
    // Solo escuchar si el colmado tiene habilitada la impresión remota por el Super Admin
    if (!profile?.colmadoId || !colmado || colmado.allowRemotePrinting === false) return;

    const startTime = Date.now();

    // 1. ESCUCHA DE SOLICITUDES DE IMPRESIÓN (REIMPRESIONES Y CIERRES)
    const printQ = query(
      collection(db, "colmados", profile.colmadoId, "printRequests"),
      where("status", "==", "pending")
    );

    const unsubPrint = onSnapshot(printQ, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const req = { id: change.doc.id, ...change.doc.data() } as any;
          
          if (new Date(req.createdAt).getTime() < startTime - 30000) return;
          if (processedRequestsRef.current.has(req.id)) return;
          processedRequestsRef.current.add(req.id);

          try {
            playAlertSound();

            if (req.type === 'sale') {
              const snap = await getDoc(doc(db, "colmados", profile.colmadoId, "transactions", req.docId));
              if (snap.exists()) {
                toast({ title: "REIMPRESIÓN REMOTA", description: "Imprimiendo Factura..." });
                setSaleData({ ...snap.data(), colmadoName: colmado?.name, colmadoAddress: colmado?.address });
                setPrintType('sale');
                setTimeout(() => { window.print(); setPrintType(null); setSaleData(null); }, 1500);
              }
            } else if (req.type === 'closing') {
              const snap = await getDoc(doc(db, "colmados", profile.colmadoId, "cashRegisterSessions", req.docId));
              if (snap.exists()) {
                toast({ title: "CIERRE DE CAJA REMOTO", description: "Imprimiendo Reporte de Auditoría..." });
                setClosingData({ ...snap.data(), colmadoName: colmado?.name });
                setPrintType('closing');
                setTimeout(() => { window.print(); setPrintType(null); setClosingData(null); }, 1500);
              }
            }

            await updateDoc(doc(db, "colmados", profile.colmadoId, "printRequests", req.id), {
              status: "printed",
              printedAt: new Date().toISOString()
            });
          } catch (e) {
            console.error("Kiosko Print Error:", e);
          }
        }
      });
    }, (error) => {
      if (error.code !== 'permission-denied') console.error('Error al escuchar impresiones:', error);
    });

    // 2. ESCUCHA DE NUEVOS PEDIDOS (AUTOPRINT)
    const ordersQ = query(
      collection(db, "colmados", profile.colmadoId, "orders"),
      where("status", "==", "Pending")
    );

    const unsubOrders = onSnapshot(ordersQ, (snapshot) => {
      const isAutoPrint = localStorage.getItem('auto_print_orders') === 'true';
      if (!isAutoPrint) return;

      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const order = { id: change.doc.id, ...change.doc.data() } as any;
          
          if (new Date(order.createdAt).getTime() < startTime - 30000) return;
          if (processedOrdersRef.current.has(order.id)) return;
          processedOrdersRef.current.add(order.id);

          try {
            playAlertSound();
            toast({ title: "NUEVO PEDIDO", description: `Imprimiendo orden de ${order.customerName}` });

            const itemsSnap = await getDocs(collection(db, "colmados", profile.colmadoId, "orders", order.id, "items"));
            const items: any[] = [];
            itemsSnap.forEach(d => items.push(d.data()));
            
            setOrderItems(items);
            setOrderData({ ...order, colmadoName: colmado?.name, colmadoAddress: colmado?.address });
            setPrintType('order');
            
            setTimeout(() => { window.print(); setPrintType(null); setOrderData(null); setOrderItems([]); }, 1500);
          } catch (e) {
            console.error("Auto Order Print Error:", e);
          }
        }
      });
    }, (error) => {
      if (error.code !== 'permission-denied') console.error('Error al escuchar pedidos:', error);
    });

    return () => {
      unsubPrint();
      unsubOrders();
    };
  }, [profile?.colmadoId, colmado, db, playAlertSound, toast]);

  const processedOrdersRef = useRef<Set<string>>(new Set());

  // Solo renderizar el contenedor si hay algo activo para imprimir, para evitar impresiones vacías
  if (!printType) return null;

  return (
    <div id="kiosko-global-print-area">
      <style jsx global>{`@media print { @page { size: ${colmado?.printerPaperWidth === '58mm' ? '58mm' : '80mm'} auto; margin: 0; } }`}</style>
      {/* TICKET DE VENTA / REIMPRESIÓN */}
      {printType === 'sale' && saleData && (
        <div>
          <div className="text-center mb-4">
            <h2 className="text-xl font-black uppercase">{saleData.colmadoName}</h2>
            <p className="text-[12px]">{saleData.colmadoAddress}</p>
            <div className="border-b-2 border-black my-2" />
            <h3 className="font-bold uppercase text-sm">RECIBO DE VENTA</h3>
            <p className="text-[10px]">{new Date(saleData.createdAt).toLocaleString()}</p>
            <p className="text-[10px] font-black uppercase mt-1">CAJERO: {saleData.cashierName}</p>
          </div>
          {saleData.customerName && saleData.customerName !== "Venta General" && (
            <div className="bg-black/5 p-2 rounded mb-2 text-[10px]">
              <p className="font-black text-sm uppercase">CLIENTE: {saleData.customerName}</p>
              {saleData.customerDebt !== undefined && (
                <p className="font-black text-sm mt-1 border-t border-black/20 pt-1">DEUDA TOTAL: RD${saleData.customerDebt.toLocaleString()}</p>
              )}
            </div>
          )}
          <div className="mb-4 text-[12px] space-y-1">
            <div className="flex justify-between font-bold border-b border-black/10 pb-1">
              <span className="w-1/2">DETALLE</span>
              <span className="w-1/4 text-right">CANT</span>
              <span className="w-1/4 text-right">TOTAL</span>
            </div>
            {saleData.items?.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between border-b border-black/5 py-1">
                <span className="w-1/2 truncate uppercase">{item.name}</span>
                <span className="w-1/4 text-right">{item.quantity.toFixed(1)}</span>
                <span className="w-1/4 text-right">RD${(item.amountInDop || item.price * item.quantity).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="border-t-2 border-black pt-2 font-black text-2xl flex justify-between">
            <span>TOTAL:</span><span>RD${saleData.totalAmount.toLocaleString()}</span>
          </div>
          <div className="mt-4 text-center text-[8px] opacity-60">
             <p>IMPRESIÓN REPRODUCIDA - COLMADOM CLOUD</p>
          </div>
        </div>
      )}

      {/* TICKET DE CIERRE / AUDITORÍA */}
      {printType === 'closing' && closingData && (
        <div className="text-[10px] space-y-3">
          <div className="text-center">
            <h2 className="text-lg font-black uppercase">{closingData.colmadoName}</h2>
            <h3 className="font-bold underline">AUDITORÍA DE CAJA</h3>
            <p>{new Date().toLocaleString()}</p>
          </div>
          <Separator className="bg-black my-1" />
          <div className="space-y-1">
            <p className="font-black">CAJERO: {closingData.staffName}</p>
            <div className="flex justify-between"><span>(+) FONDO INICIAL:</span><span>RD${closingData.initialCash.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>(+) VENTAS CASH:</span><span>RD${closingData.cashSales.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>(+) VENTAS TARJETA:</span><span>RD${closingData.cardSales.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>(+) VENTAS FIADO:</span><span>RD${closingData.fiadoSales.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>(-) EGRESOS:</span><span>RD${closingData.totalExpenses.toLocaleString()}</span></div>
            <Separator className="bg-black/20 my-1" />
            <div className="flex justify-between font-black text-sm"><span>ESPERADO CASH:</span><span>RD${closingData.closingBalanceExpected.toLocaleString()}</span></div>
            <div className="flex justify-between font-black text-sm"><span>FÍSICO CASH:</span><span>RD${closingData.closingBalanceActual.toLocaleString()}</span></div>
            <div className="flex justify-between font-black text-sm"><span>DIFERENCIA:</span><span>RD${closingData.discrepancy.toLocaleString()}</span></div>
          </div>
          <div className="mt-12 space-y-12 text-center">
            <div className="border-t border-black pt-1"><p className="font-bold">FIRMA CAJERO</p></div>
            <div className="border-t border-black pt-1"><p className="font-bold">FIRMA DUEÑO</p></div>
          </div>
        </div>
      )}

      {/* TICKET DE PEDIDO DEL CATÁLOGO */}
      {printType === 'order' && orderData && (
        <div>
          <div className="text-center mb-4">
            <h2 className="text-lg font-black uppercase">{orderData.colmadoName}</h2>
            <div className="border-b-2 border-black my-2" />
            <h3 className="font-bold uppercase text-xs">NUEVO PEDIDO DIGITAL</h3>
            <p className="text-[9px]">{new Date().toLocaleString()}</p>
          </div>
          <div className="bg-black/5 p-2 rounded mb-4 text-[10px]">
            <p className="font-black">CLIENTE: {orderData.customerName}</p>
            <p>DIR: {orderData.customerAddress}</p>
            <p>TEL: {orderData.customerPhone}</p>
          </div>
          <div className="mb-4 text-[10px] space-y-1">
            <div className="flex justify-between border-b border-black font-bold pb-1">
              <span className="w-1/2">PRODUCTO</span>
              <span className="w-1/4 text-right">CANT</span>
              <span className="w-1/4 text-right">TOTAL</span>
            </div>
            {orderItems.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between py-1 border-b border-black/5 last:border-0">
                <span className="w-1/2 truncate">{item.productName}</span>
                <span className="w-1/4 text-right">{item.quantity.toFixed(1)}</span>
                <span className="w-1/4 text-right">RD${item.lineTotal.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="border-t-2 border-black pt-2 space-y-1 text-[10px]">
             <div className="flex justify-between"><span>SUBTOTAL:</span><span>RD${(orderData.subtotalAmount || 0).toLocaleString()}</span></div>
             <div className="flex justify-between italic"><span>DELIVERY:</span><span>RD${(orderData.deliveryFee || 0).toLocaleString()}</span></div>
             <div className="flex justify-between font-black text-lg pt-2 border-t"><span>TOTAL:</span><span>RD${orderData.totalAmount.toLocaleString()}</span></div>
          </div>
          <div className="text-center mt-8 pt-4 border-t border-dashed border-black/20 text-[8px]">
            <p>ESTE PEDIDO DEBE SER DESPACHADO</p>
          </div>
        </div>
      )}
    </div>
  );
}
