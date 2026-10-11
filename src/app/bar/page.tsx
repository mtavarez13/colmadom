
"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Beer, 
  Plus, 
  Search, 
  Loader2, 
  Trash2, 
  Receipt, 
  CheckCircle2, 
  X, 
  UserPlus, 
  UtensilsCrossed, 
  Clock, 
  ShoppingCart,
  Banknote,
  Scissors,
  ArrowRightCircle,
  Printer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
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
import { doc, collection, query, where, increment, getDocs } from "firebase/firestore";
import { setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { useToast } from "@/hooks/use-toast";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";

export default function BarPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [mounted, setMounted] = useState(false);
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [productSearch, setProductSearch] = useState("");
  const [isClosingAccount, setIsClosingProcess] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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

  const sessionsQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return query(
      collection(db, "colmados", profile.colmadoId, "barSessions"),
      where("status", "==", "Open")
    );
  }, [db, profile?.colmadoId]);
  const { data: openSessions, isLoading: isSessionsLoading } = useCollection(sessionsQuery);

  const productsQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "products");
  }, [db, profile?.colmadoId]);
  const { data: products } = useCollection(productsQuery);

  const filteredProducts = products?.filter(p => 
    String(p.name || '').toLowerCase().includes(productSearch.toLowerCase()) ||
    p.category?.toLowerCase().includes(productSearch.toLowerCase())
  ) || [];

  const handleOpenAccount = () => {
    if (!profile?.colmadoId || !newCustomerName) return;
    setIsOpeningSession(true);
    const sessionId = `bar_${Date.now()}`;
    const sessionData = {
      id: sessionId,
      colmadoId: profile.colmadoId,
      customerName: newCustomerName,
      status: "Open",
      totalAmount: 0,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      openingUserId: user?.uid
    };
    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "barSessions", sessionId), sessionData, { merge: true });
    setNewCustomerName("");
    setIsOpeningSession(false);
    toast({ title: "Cuenta Abierta" });
  };

  const handleAddItemToAccount = (product: any) => {
    if (!selectedSession || !profile?.colmadoId) return;
    
    const existingItems = selectedSession.items || [];
    const itemIndex = existingItems.findIndex((i: any) => i.id === product.id && !i.isBreakdown);
    
    let newItems;
    if (itemIndex > -1) {
      newItems = [...existingItems];
      newItems[itemIndex].quantity += 1;
      newItems[itemIndex].lineTotal = newItems[itemIndex].quantity * product.salePrice;
    } else {
      newItems = [...existingItems, {
        id: product.id,
        name: product.name,
        price: product.salePrice,
        costPrice: product.basePrice || 0,
        quantity: 1,
        lineTotal: product.salePrice,
        unitType: product.unitType || 'ud'
      }];
    }

    const newTotal = newItems.reduce((sum: number, i: any) => sum + i.lineTotal, 0);

    updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "barSessions", selectedSession.id), {
      items: newItems,
      totalAmount: newTotal,
      updatedAt: new Date().toISOString()
    });
    
    setSelectedSession({ ...selectedSession, items: newItems, totalAmount: newTotal });
  };

  const handleRemoveItemFromAccount = (index: number) => {
    if (!selectedSession || !profile?.colmadoId) return;
    const newItems = [...selectedSession.items];
    newItems.splice(index, 1);
    const newTotal = newItems.reduce((sum: number, i: any) => sum + i.lineTotal, 0);
    
    updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "barSessions", selectedSession.id), {
      items: newItems,
      totalAmount: newTotal,
      updatedAt: new Date().toISOString()
    });
    setSelectedSession({ ...selectedSession, items: newItems, totalAmount: newTotal });
  };

  const handleCloseAccount = async () => {
    if (!selectedSession || !profile?.colmadoId || selectedSession.items.length === 0) return;
    setIsClosingProcess(true);
    const colmadoId = profile.colmadoId;
    const transactionId = `txn_bar_${Date.now()}`;
    const now = new Date().toISOString();

    try {
      setDocumentNonBlocking(doc(db, "colmados", colmadoId, "transactions", transactionId), {
        id: transactionId,
        colmadoId,
        transactionType: "BarSale",
        customerName: selectedSession.customerName,
        totalAmount: selectedSession.totalAmount,
        paymentMethod: "Efectivo",
        isComplete: true,
        userId: user?.uid,
        cashRegisterSessionId: "active_session",
        createdAt: now,
        items: selectedSession.items
      }, { merge: true });

      selectedSession.items.forEach((item: any) => {
        updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "products", item.id), {
          quantityInStock: increment(-item.quantity)
        });
      });

      updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "barSessions", selectedSession.id), {
        status: "Closed",
        closedAt: now,
        transactionId: transactionId,
        updatedAt: now
      });

      toast({ title: "Cuenta Cerrada" });
      
      // No disparar impresión automática.
      setTimeout(() => {
        setSelectedSession(null);
        setIsClosingProcess(false);
      }, 500);

    } catch (e) {
      toast({ variant: "destructive", title: "Error" });
      setIsClosingProcess(false);
    }
  };

  const handleManualPrintBar = () => {
    if (selectedSession) {
      window.print();
    }
  };

  if (!mounted) return null;

  if (colmado && !colmado.isBarEnabled) {
    return (
      <div className="h-screen flex items-center justify-center p-8 bg-muted/30">
        <Card className="max-w-md w-full text-center p-10">
          <Beer className="h-10 w-10 text-accent mx-auto mb-4" />
          <CardTitle className="text-xl font-black uppercase">Módulo Bar Desactivado</CardTitle>
          <Button variant="outline" className="mt-6" onClick={() => window.location.href = "/pos"}>Volver al POS</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 print:p-0">
      <style jsx global>{`
        @media print {
          @page { size: ${colmado?.printerPaperWidth === '58mm' ? '58mm' : '80mm'} auto; margin: 0; }
          body * { visibility: hidden !important; }
          .bar-receipt-print, .bar-receipt-print * { visibility: visible !important; }
          .bar-receipt-print {
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

      {/* TICKET DE CONSUMO BAR */}
      {selectedSession && colmado && (
        <div className="bar-receipt-print hidden print:block">
          <div className="text-center mb-4">
            <h2 className="text-lg font-black uppercase">{colmado.name}</h2>
            <div className="border-b-2 border-black my-2" />
            <h3 className="font-bold uppercase text-xs">CUENTA DE CONSUMO</h3>
            <p className="text-[9px]">{new Date().toLocaleString()}</p>
          </div>
          <div className="mb-4 text-[10px] space-y-1">
            <p className="font-bold uppercase">CLIENTE: {selectedSession.customerName}</p>
            <div className="flex justify-between font-bold border-b border-black/10 pb-1 mt-2">
              <span className="w-1/2">DETALLE</span>
              <span className="w-1/4 text-right">CANT</span>
              <span className="w-1/4 text-right">TOTAL</span>
            </div>
            {selectedSession.items?.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between py-0.5">
                <span className="w-1/2 truncate">{item.name}</span>
                <span className="w-1/4 text-right">{item.quantity}</span>
                <span className="w-1/4 text-right">{item.lineTotal.toLocaleString()}</span>
              </div>
            ))}
            <Separator className="bg-black/20 mt-2" />
            <div className="flex justify-between font-black text-xs pt-1">
              <span>TOTAL:</span>
              <span>RD${selectedSession.totalAmount?.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="h-12 w-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent">
            <Beer className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-primary tracking-tight">Consumo Bar</h1>
            <p className="text-sm text-muted-foreground font-bold">Cuentas abiertas y mesas.</p>
          </div>
        </div>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button size="lg" className="bg-accent font-black gap-2 h-14 rounded-2xl shadow-xl px-8 text-white">
              <UserPlus className="h-6 w-6" />
              Abrir Nueva Cuenta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">Iniciar Consumo</DialogTitle>
            </DialogHeader>
            <div className="py-6 space-y-4">
              <div className="space-y-2">
                <Label className="font-bold">Nombre o Mesa</Label>
                <Input placeholder="Ej: Mesa 4, Juan..." className="h-14 font-black" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} autoFocus />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-14 bg-accent font-black rounded-2xl text-white" onClick={handleOpenAccount} disabled={!newCustomerName || isOpeningSession}>
                Comenzar Facturación
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:hidden">
        {/* LISTA DE CUENTAS ABIERTAS */}
        <div className="lg:col-span-4 space-y-6">
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {isSessionsLoading ? (
                <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></div>
              ) : openSessions?.map((session) => (
                <Card 
                  key={session.id} 
                  className={`cursor-pointer border-none shadow-lg rounded-2xl overflow-hidden ${selectedSession?.id === session.id ? 'ring-4 ring-accent' : ''}`}
                  onClick={() => setSelectedSession(session)}
                >
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-lg font-black">{session.customerName}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex justify-between items-end">
                    <div>
                      <p className="text-[9px] font-black uppercase opacity-50">Consumo</p>
                      <p className="text-2xl font-black text-primary">RD${session.totalAmount?.toLocaleString()}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* DETALLE DE CUENTA */}
        <div className="lg:col-span-8">
          {selectedSession && (
            <Card className="flex flex-col border-none shadow-2xl rounded-3xl overflow-hidden bg-white h-[600px]">
              <CardHeader className="bg-primary text-white p-6">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-2xl font-black">{selectedSession.customerName}</CardTitle>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setSelectedSession(null)}><X className="h-6 w-6" /></Button>
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
                <ScrollArea className="flex-1 p-6">
                  {selectedSession.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 border-b last:border-0">
                      <div>
                        <p className="font-black text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">RD${item.price.toLocaleString()} x {item.quantity}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black">RD${item.lineTotal.toLocaleString()}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveItemFromAccount(idx)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                </ScrollArea>

                <div className="p-6 bg-muted/20 border-t">
                  <div className="flex justify-between items-end mb-4">
                    <span className="text-[10px] font-black uppercase opacity-50">Total Acumulado</span>
                    <span className="text-3xl font-black text-primary">RD${selectedSession.totalAmount?.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" className="h-14 rounded-2xl font-black gap-2 border-primary text-primary" onClick={handleManualPrintBar}>
                      <Printer className="h-5 w-5" /> Imprimir Ticket
                    </Button>
                    <Button className="h-14 rounded-2xl font-black bg-accent text-white" onClick={handleCloseAccount} disabled={isClosingAccount}>
                      Cerrar y Cobrar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
