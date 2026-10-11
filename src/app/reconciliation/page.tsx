"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Calculator, 
  Lock, 
  Unlock, 
  Loader2, 
  Receipt,
  ChevronDown,
  History,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  UserCircle,
  Banknote,
  Edit,
  TrendingDown,
  RefreshCw,
  Wrench,
  ShieldAlert,
  Info,
  ArrowRightCircle,
  Box,
  Sparkles,
  Key,
  Printer,
  CreditCard,
  UserPlus,
  Coins,
  Plus,
  X,
  Truck,
  Eye,
  ChevronRight,
  ChevronUp,
  FileText,
  Download,
  Check,
  Users,
  Briefcase,
  TrendingUp,
  DollarSign
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";
import { setDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription as ShadDialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import Image from "next/image";

export const dynamic = 'force-dynamic';

type ExpandedType = 'locales' | 'delivery' | 'card' | 'fiado' | 'recovery' | null;

export default function ReconciliationPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [physicalCash, setPhysicalCash] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Filtering state
  const [selectedCashierId, setSelectedCashierId] = useState<string>("all");
  const [acceptingSettlementId, setAcceptingSettlementId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isHistoricalView, setIsHistoricalView] = useState(false);
  
  // Drill-down state
  const [expandedType, setExpandedType] = useState<ExpandedType>(null);
  
  // Initial cash states
  const [isInitialCashDialogOpen, setIsInitialCashDialogOpen] = useState(false);
  const [initialCashInput, setInitialCashInput] = useState("");
  const [isSavingInitialCash, setIsSavingInitialCash] = useState(false);

  // New detailed states
  const [isExpectedDetailOpen, setIsExpectedDetailOpen] = useState(false);

  // Printing/PDF state
  const [lastClosingLocal, setLastClosingLocal] = useState<any>(null);
  const [txForLocalPrint, setTxForLocalPrint] = useState<any>(null);
  const [summaryForPrint, setSummaryForPrint] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid || !db) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);

  const { data: profile } = useDoc(profileRef);

  const colmadoRef = useMemoFirebase(() => {
    if (!profile?.colmadoId || !db) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);

  const { data: colmado } = useDoc(colmadoRef);

  const txQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId || !db) return null;
    if (!isHistoricalView) {
      return query(
        collection(db, "colmados", profile.colmadoId, "transactions"),
        where("cashRegisterSessionId", "==", "active_session")
      );
    } else {
      return query(
        collection(db, "colmados", profile.colmadoId, "transactions"),
        where("createdAt", ">=", selectedDate + "T00:00:00Z"),
        where("createdAt", "<=", selectedDate + "T23:59:59Z")
      );
    }
  }, [db, profile?.colmadoId, isHistoricalView, selectedDate]);

  const { data: rawTransactions } = useCollection(txQuery);

  const activeEntriesQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId || !db) return null;
    if (!isHistoricalView) {
      return query(
        collection(db, "colmados", profile.colmadoId, "bookkeepingEntries"),
        where("cashRegisterSessionId", "==", "active_session")
      );
    } else {
      return query(
        collection(db, "colmados", profile.colmadoId, "bookkeepingEntries"),
        where("createdAt", ">=", selectedDate + "T00:00:00Z"),
        where("createdAt", "<=", selectedDate + "T23:59:59Z")
      );
    }
  }, [db, profile?.colmadoId, isHistoricalView, selectedDate]);

  const { data: activeEntries } = useCollection(activeEntriesQuery);
  const pendingSettlementsQuery = useMemoFirebase(() => profile?.colmadoId && !isHistoricalView
    ? query(collection(db, 'colmados', profile.colmadoId, 'deliverySettlements'), where('status', '==', 'Pending')) : null,
    [db, profile?.colmadoId, isHistoricalView]);
  const { data: pendingSettlements } = useCollection(pendingSettlementsQuery, { permissionErrorIsLocal: true });

  const sessionsQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId || !db) return null;
    return collection(db, "colmados", profile.colmadoId, "cashRegisterSessions");
  }, [db, profile?.colmadoId]);

  const { data: rawSessions, isLoading: isSessionsLoading } = useCollection(sessionsQuery);

  const sortedSessions = useMemo(() => {
    if (!rawSessions) return [];
    return [...rawSessions].sort((a, b) => {
      const dateA = a.closedAt || a.createdAt || 0;
      const dateB = b.closedAt || b.createdAt || 0;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    }).slice(0, 20);
  }, [rawSessions]);

  const availableCashiers = useMemo(() => {
    const cashiersMap = new Map();
    (rawTransactions || []).forEach(tx => {
      if (tx.userId && tx.cashierName) {
        cashiersMap.set(tx.userId, tx.cashierName);
      }
    });
    (activeEntries || []).filter(entry => entry.entryType === 'DeliverySettlement').forEach(entry => {
      if (entry.userId && entry.userName) cashiersMap.set(entry.userId, entry.userName);
    });
    return Array.from(cashiersMap.entries()).map(([id, name]) => ({ id, name }));
  }, [rawTransactions, activeEntries]);

  const stats = useMemo(() => {
    const defaults = { 
      total: 0, 
      cash: 0, 
      card: 0, 
      credit: 0, 
      recovery: 0,
      cashRecovery: 0,
      deliveryCash: 0,
      count: 0, 
      initialCash: 0, 
      expenses: 0,
      cashWithInitial: 0
    };
    
    const filteredEntries = selectedCashierId === 'all' 
      ? (activeEntries || []) 
      : (activeEntries || []).filter(e => e.userId === selectedCashierId);

    const initialCash = filteredEntries.filter(e => e.entryType === 'InitialCash').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const expenses = filteredEntries.filter(e => (e.entryType?.includes('Expense') || e.entryType === 'ProductExpense') && !e.isPayroll).reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);

    const filteredTxns = selectedCashierId === 'all' 
      ? (rawTransactions || [])
      : (rawTransactions || []).filter(tx => tx.userId === selectedCashierId);

    const txStats = filteredTxns.reduce((acc, tx) => {
      if (tx.isAnnulled) return acc;
      
      const amount = Number(tx.totalAmount) || 0;
      
      let txCash = 0;
      let txCard = 0;
      let txFiado = 0;

      if (tx.transactionType === "FiadoPayment") {
        const inflow = Math.abs(amount);
        acc.recovery += inflow;
        if (tx.paymentMethod === "Efectivo" || tx.paymentMethod === "Cash") {
          txCash = inflow;
          acc.cashRecovery += inflow;
        }
        if (tx.paymentMethod === "Tarjeta" || tx.paymentMethod === "Card") txCard = inflow;
      } else {
        acc.total += amount;
        acc.count += 1;
        
        const hasDetailedAmounts = tx.cashAmount !== undefined || tx.cardAmount !== undefined || tx.fiadoAmount !== undefined;
        txCash = hasDetailedAmounts ? (Number(tx.cashAmount) || 0) : (tx.paymentMethod === "Efectivo" || tx.paymentMethod === "Cash" ? amount : 0);
        txCard = hasDetailedAmounts ? (Number(tx.cardAmount) || 0) : (tx.paymentMethod === "Tarjeta" || tx.paymentMethod === "Card" ? amount : 0);
        txFiado = hasDetailedAmounts ? (Number(tx.fiadoAmount) || 0) : (tx.paymentMethod === "Fiado" ? amount : 0);
      }

      acc.cash += txCash;
      acc.card += txCard;
      acc.credit += txFiado;
      
      if (tx.transactionType === "OrderDelivery") {
        acc.deliveryCash += txCash;
      }
      
      return acc;
    }, { 
      total: 0, cash: 0, card: 0, credit: 0, recovery: 0, cashRecovery: 0, deliveryCash: 0, count: 0,
      initialCash, 
      expenses,
      cashWithInitial: 0
    });

    const settledDelivery = filteredEntries.filter(entry => entry.entryType === 'DeliverySettlement')
      .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    txStats.cash += settledDelivery;
    txStats.deliveryCash += settledDelivery;
    return txStats;
  }, [rawTransactions, activeEntries, selectedCashierId]);

  const acceptDeliverySettlement = async (settlementId: string) => {
    if (!user || !['Cajero', 'Admin'].includes(String(profile?.role))) return;
    setAcceptingSettlementId(settlementId);
    try {
      const response = await fetch('/api/delivery-settlements', { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}`
      }, body: JSON.stringify({ action: 'accept', settlementId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo aceptar el desembolso.');
      toast({ title: 'Desembolso aceptado', description: `RD$${Number(result.amount).toLocaleString()} entraron a tu cuadre.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo aceptar', description: error instanceof Error ? error.message : '' });
    } finally { setAcceptingSettlementId(null); }
  };

  const finalCashWithInitial = Math.max(0, Math.round((stats.cash + stats.initialCash - stats.expenses) * 100) / 100);
  const difference = Math.round(((Number(physicalCash) || 0) - finalCashWithInitial) * 100) / 100;
  const isPerfectReconciliation = Math.abs(difference) < 0.01;

  const isAdmin = useMemo(() => {
    if (!mounted || !user) return false;
    const isPlatformAdmin = user.email === "admin@colmadom.com" || user.email === "martin.tavarez.gomez@gmail.com" || user.email === "tavarezgomezmartin@gmail.com";
    return isPlatformAdmin || profile?.role === 'Admin' || profile?.role === 'SuperAdmin';
  }, [mounted, user, profile]);

  const expandedTransactions = useMemo(() => {
    if (!rawTransactions || !expandedType) return [];
    
    const filteredTxns = selectedCashierId === 'all' 
      ? rawTransactions 
      : rawTransactions.filter(tx => tx.userId === selectedCashierId);

    const activeTxns = filteredTxns.filter(tx => !tx.isAnnulled);
    
    switch(expandedType) {
      case 'locales':
        return activeTxns.filter(tx => tx.transactionType !== 'OrderDelivery' && tx.transactionType !== 'FiadoPayment' && (Number(tx.cashAmount) > 0 || (tx.cashAmount === undefined && (tx.paymentMethod === 'Efectivo' || tx.paymentMethod === 'Cash'))));
      case 'delivery':
        return activeTxns.filter(tx => tx.transactionType === 'OrderDelivery' && (Number(tx.cashAmount) > 0 || (tx.cashAmount === undefined && (tx.paymentMethod === 'Efectivo' || tx.paymentMethod === 'Cash'))));
      case 'card':
        return activeTxns.filter(tx => Number(tx.cardAmount) > 0 || (tx.transactionType === 'FiadoPayment' && tx.paymentMethod === 'Tarjeta') || (tx.cardAmount === undefined && (tx.paymentMethod === 'Tarjeta' || tx.paymentMethod === 'Card')));
      case 'fiado':
        return activeTxns.filter(tx => Number(tx.fiadoAmount) > 0 || (tx.fiadoAmount === undefined && tx.paymentMethod === 'Fiado'));
      case 'recovery':
        return activeTxns.filter(tx => tx.transactionType === 'FiadoPayment');
      default:
        return [];
    }
  }, [rawTransactions, expandedType, selectedCashierId]);

  const handleToggleExpand = (type: ExpandedType) => {
    setExpandedType(prev => prev === type ? null : type);
  };

  const handleSaveInitialCash = () => {
    if (!profile?.colmadoId || !initialCashInput) return;
    setIsSavingInitialCash(true);
    const entryId = `initial_${Date.now()}`;
    const now = new Date().toISOString();

    const entryData = {
      id: entryId, colmadoId: profile.colmadoId, entryType: "InitialCash", description: "FONDO INICIAL / APERTURA",
      amount: Number(initialCashInput), category: "Caja", entryDate: now, createdAt: now, updatedAt: now,
      userId: user?.uid, cashRegisterSessionId: "active_session"
    };

    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "bookkeepingEntries", entryId), entryData, { merge: true });
    toast({ title: "Fondo Inicial Registrado" });
    setIsInitialCashDialogOpen(false); setInitialCashInput(""); setIsSavingInitialCash(false);
  };

  const handleReprintDual = (tx: any) => {
    if (!profile?.colmadoId || !colmado) return;
    setTxForLocalPrint({ ...tx, colmadoName: colmado.name, colmadoAddress: colmado.address });
    
    if (colmado.allowRemotePrinting !== false) {
      const printRequestId = `pr_reconcile_${tx.id}_${Date.now()}`;
      const now = new Date().toISOString();
      setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "printRequests", printRequestId), {
        id: printRequestId, colmadoId: profile.colmadoId, type: "sale", docId: tx.id, status: "pending", createdAt: now
      }, { merge: true });
    }

    setTimeout(() => {
      if (colmado.allowLocalPdf !== false) {
        window.print();
      }
      setTxForLocalPrint(null);
    }, 1500);
  };

  const handleClosingReprint = (session: any) => {
    if (!profile?.colmadoId || !colmado) return;
    setLastClosingLocal({ ...session, colmadoName: colmado.name });
    
    if (colmado.allowRemotePrinting !== false) {
      const printRequestId = `pr_closing_${session.id}_${Date.now()}`;
      const now = new Date().toISOString();
      setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "printRequests", printRequestId), {
        id: printRequestId, colmadoId: profile.colmadoId, type: "closing", docId: session.id, status: "pending", createdAt: now
      }, { merge: true });
    }

    setTimeout(() => {
      if (colmado.allowLocalPdf !== false) {
        window.print();
      }
      setLastClosingLocal(null);
    }, 1500);
  };

  const handlePrintSummary = () => {
    if (!expandedType || !expandedTransactions.length || !colmado) return;
    const cashierName = selectedCashierId === 'all' ? 'TODOS LOS CAJEROS' : availableCashiers.find(c => c.id === selectedCashierId)?.name || 'CAJERO';

    setSummaryForPrint({
      type: expandedType,
      transactions: expandedTransactions,
      total: expandedTransactions.reduce((sum, tx) => {
        let amount = tx.totalAmount;
        if (tx.transactionType === 'FiadoPayment') {
            amount = Math.abs(tx.totalAmount);
        } else {
            if (expandedType === 'locales' || expandedType === 'delivery') amount = tx.cashAmount ?? tx.totalAmount;
            if (expandedType === 'card') amount = tx.cardAmount ?? tx.totalAmount;
            if (expandedType === 'fiado') amount = tx.fiadoAmount ?? tx.totalAmount;
        }
        return sum + Number(amount);
      }, 0),
      colmadoName: colmado.name,
      colmadoAddress: colmado.address,
      colmadoLogo: colmado.logoUrl,
      cashierName,
      date: new Date().toLocaleString()
    });
    
    setTimeout(() => {
      window.print();
      setSummaryForPrint(null);
    }, 800);
  };

  const archiveActiveSession = async () => {
    if (!profile?.colmadoId) return;
    try {
      const txSnap = await getDocs(query(collection(db, "colmados", profile.colmadoId, "transactions"), where("cashRegisterSessionId", "==", "active_session")));
      txSnap.forEach((d) => updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "transactions", d.id), { cashRegisterSessionId: "archived" }));
      
      const entrySnap = await getDocs(query(collection(db, "colmados", profile.colmadoId, "bookkeepingEntries"), where("cashRegisterSessionId", "==", "active_session")));
      entrySnap.forEach((d) => updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "bookkeepingEntries", d.id), { cashRegisterSessionId: "archived" }));
    } catch (e) {
      console.error("Error archivando sesión:", e);
    }
  };

  const handleFinalizeTurno = async () => {
    if (!profile?.colmadoId || !physicalCash || !colmado) return;
    setIsSaving(true);
    const sessionId = `session_${Date.now()}`;
    const now = new Date().toISOString();
    const staffName = profile?.firstName + " " + (profile?.lastName || "");

    const closingData = {
      id: sessionId, colmadoId: profile.colmadoId, openingUserId: user?.uid, staffName,
      closingBalanceExpected: finalCashWithInitial, closingBalanceActual: Number(physicalCash),
      discrepancy: difference, totalSales: stats.total, cashSales: stats.cash, cardSales: stats.card,
      fiadoSales: stats.credit, initialCash: stats.initialCash, totalExpenses: stats.expenses,
      status: "Closed", closedAt: now, createdAt: now,
    };

    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "cashRegisterSessions", sessionId), closingData, { merge: true });
    void (async()=>{try{await new Promise(resolve=>setTimeout(resolve,800));await fetch('/api/whatsapp/automation',{method:'POST',headers:{Authorization:`Bearer ${await user?.getIdToken()}`,'Content-Type':'application/json'},body:JSON.stringify({action:'daily_closing',sessionId})});}catch(error){console.error('No se pudo enviar cierre automático por WhatsApp',error)}})();
    
    if (colmado.allowRemotePrinting !== false) {
      const printRequestId = `pr_auto_closing_${Date.now()}`;
      setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "printRequests", printRequestId), {
        id: printRequestId, colmadoId: profile.colmadoId, type: "closing", docId: sessionId, status: "pending", createdAt: now
      }, { merge: true });
    }

    toast({ title: "CUADRE REALIZADO", description: "Generando reportes y reiniciando caja..." });
    setLastClosingLocal({ ...closingData, colmadoName: colmado?.name });
    
    await archiveActiveSession();

    setTimeout(() => {
      if (colmado.allowLocalPdf !== false) {
        window.print();
      }
      setPhysicalCash(""); 
      setIsSaving(false); 
      setLastClosingLocal(null);
    }, 1500);
  };

  const localCashTotal = Math.max(0, stats.cash - stats.deliveryCash - stats.cashRecovery);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 print:p-0">
      <style jsx global>{`
        @media print {
          @page { size: portrait; margin: 10mm; }
          body * { visibility: hidden !important; }
          .summary-print-area, .summary-print-area * { visibility: visible !important; }
          .summary-print-area {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 10mm !important;
            background: white !important;
            color: black !important;
            z-index: 9999 !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* REPORTE DE CATEGORÍA A4 MODERNO */}
      {summaryForPrint && (
        <div className="summary-print-area hidden">
          <div className="flex items-center justify-between mb-12 border-b-8 border-primary pb-10">
            <div className="flex items-center gap-8 text-left">
               {summaryForPrint.colmadoLogo && (
                 <div className="h-32 w-32 relative rounded-3xl overflow-hidden border-4 border-primary/20 shadow-xl shrink-0">
                    <Image src={summaryForPrint.colmadoLogo} alt="Logo" fill className="object-cover" unoptimized />
                 </div>
               )}
               <div className="flex-1 min-w-0">
                  <h1 className="text-5xl font-black uppercase text-primary leading-[0.9] break-words">
                    {summaryForPrint.colmadoName}
                  </h1>
                  <p className="text-xl font-bold text-muted-foreground mt-3">{summaryForPrint.colmadoAddress}</p>
               </div>
            </div>
            <div className="text-right shrink-0 ml-6">
               <div className="bg-primary text-white px-10 py-4 rounded-[2rem] shadow-2xl">
                  <h2 className="text-2xl font-black uppercase tracking-widest leading-none">
                    {summaryForPrint.type === 'locales' ? 'Ventas Locales' :
                     summaryForPrint.type === 'delivery' ? 'Ventas Delivery' :
                     summaryForPrint.type === 'card' ? 'Ventas Tarjeta' : 
                     summaryForPrint.type === 'recovery' ? 'Recuperación Fiao' : 'Cargos a Libreta'}
                  </h2>
               </div>
               <p className="text-xs text-muted-foreground mt-4 uppercase font-black tracking-widest">Emisión: {mounted ? new Date().toLocaleString() : ''}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 mb-12">
            <div className="p-10 border-4 border-primary/10 rounded-[3rem] bg-primary/5">
               <p className="text-xs font-black uppercase tracking-widest text-primary/60">Responsable Auditoría</p>
               <p className="text-3xl font-black mt-2 uppercase text-primary">{summaryForPrint.cashierName}</p>
            </div>
            <div className="p-10 border-4 border-primary rounded-[3rem] text-right bg-primary text-white shadow-2xl">
               <p className="text-xs font-black uppercase tracking-widest opacity-80">Monto Total Auditado</p>
               <p className="text-6xl font-black mt-2">RD${summaryForPrint.total.toLocaleString()}</p>
            </div>
          </div>

          <h3 className="text-2xl font-black uppercase border-b-4 border-primary/20 mb-6 text-primary tracking-tight">Desglose Cronológico</h3>
          <table className="w-full border-collapse border border-primary/10 text-xs">
            <thead>
              <tr className="bg-primary text-white font-black uppercase">
                <th className="border border-primary/20 p-4 text-left">HORA</th>
                <th className="border border-primary/20 p-4 text-left">DOCUMENTO</th>
                <th className="border border-primary/20 p-4 text-left">CLIENTE / REFERENCIA</th>
                <th className="border border-primary/20 p-4 text-right">MONTO (RD$)</th>
              </tr>
            </thead>
            <tbody>
              {summaryForPrint.transactions.map((tx: any) => {
                let amt = tx.totalAmount;
                if (tx.transactionType === 'FiadoPayment') amt = Math.abs(tx.totalAmount);
                else {
                    if (summaryForPrint.type === 'locales' || summaryForPrint.type === 'delivery') amt = tx.cashAmount ?? tx.totalAmount;
                    if (summaryForPrint.type === 'card') amt = tx.cardAmount ?? tx.totalAmount;
                    if (summaryForPrint.type === 'fiado') amt = tx.fiadoAmount ?? tx.totalAmount;
                }
                return (
                  <tr key={tx.id} className="border-b border-primary/5 hover:bg-primary/5 transition-colors">
                    <td className="p-4 font-bold">{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="p-4 font-mono font-black text-primary/70 uppercase">#{tx.id.slice(-8)}</td>
                    <td className="p-4 font-black uppercase">{tx.customerName || 'VENTA GENERAL'}</td>
                    <td className="p-4 text-right font-black text-primary text-lg">RD${Number(amt).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
               <tr className="bg-primary/10">
                  <td colSpan={3} className="p-6 text-right font-black text-2xl text-primary uppercase">Gran Total Categoría:</td>
                  <td className="p-6 text-right font-black text-3xl text-primary underline decoration-4 underline-offset-8">RD${summaryForPrint.total.toLocaleString()}</td>
               </tr>
            </tfoot>
          </table>

          <div className="mt-48 grid grid-cols-2 gap-32 px-10">
             <div className="border-t-4 border-primary/30 pt-6 text-center">
                <p className="font-black text-xs uppercase text-primary">FIRMA STAFF / CAJERO</p>
             </div>
             <div className="border-t-4 border-primary/30 pt-6 text-center">
                <p className="font-black text-xs uppercase text-primary">VALIDADO POR ADMINISTRACIÓN</p>
             </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="p-3 bg-primary/10 rounded-2xl"><Calculator className="h-8 w-8 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary">Auditoría Remota</h1>
            <p className="text-sm text-muted-foreground mt-1 font-bold">Cuadre de caja y desglose por cajero.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border shadow-sm">
             <Label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2 shrink-0">
                <Calendar className="h-4 w-4" /> Fecha:
             </Label>
             <div className="flex items-center gap-2">
                <Input 
                  type="date" 
                  className="h-9 w-36 font-bold text-xs border-none bg-muted/30 rounded-xl"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setIsHistoricalView(e.target.value !== new Date().toISOString().split('T')[0]);
                  }}
                />
                <Button 
                  variant={!isHistoricalView ? "default" : "outline"} 
                  size="sm" 
                  className="h-9 rounded-xl font-black text-[10px] uppercase"
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setSelectedDate(today);
                    setIsHistoricalView(false);
                  }}
                >
                  Turno Activo
                </Button>
             </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border shadow-sm">
               <Label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2 shrink-0">
                  <Users className="h-4 w-4" /> Cajero:
               </Label>
               <Select value={selectedCashierId} onValueChange={setSelectedCashierId}>
                 <SelectTrigger className="w-[180px] h-9 font-bold rounded-xl bg-muted/30 border-none shadow-inner text-xs">
                   <SelectValue placeholder="Todos" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">Todos los Cajeros</SelectItem>
                   {availableCashiers.map(c => (
                     <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
            </div>
          )}
          <Button variant="outline" className="gap-2 border-primary text-primary font-black h-12 rounded-xl" onClick={() => setIsInitialCashDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Fondo Inicial
          </Button>
        </div>
      </header>

      {!isHistoricalView && !!pendingSettlements?.length && <Alert className="border-2 border-accent bg-accent/5 no-print">
        <Truck className="h-5 w-5" /><AlertTitle className="font-black">Delivery entregó efectivo para este turno</AlertTitle>
        <AlertDescription className="space-y-3 mt-2"><p>Cuenta el dinero antes de aceptarlo. Solo al aceptar entrará en tu cuadre.</p>
          {pendingSettlements.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3 border"><span className="font-bold">{item.driverName || 'Delivery'} · RD${Number(item.amount || 0).toLocaleString()} · {item.transactionIds?.length || 0} órdenes</span>
            {['Cajero', 'Admin'].includes(String(profile?.role)) && <Button disabled={!!acceptingSettlementId} onClick={() => acceptDeliverySettlement(item.id)}>{acceptingSettlementId === item.id ? 'Aceptando…' : 'Aceptar desembolso'}</Button>}
          </div>)}
        </AlertDescription>
      </Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 no-print">
        <div className="lg:col-span-8 space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
             <Card className="bg-white border-none shadow-md cursor-help" title="Fondo base para dar devuelta">
               <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between"><CardTitle className="text-[9px] font-black uppercase text-muted-foreground">Apertura</CardTitle><Banknote className="h-3 w-3 text-orange-500" /></CardHeader>
               <CardContent className="p-3 pt-1"><p className="text-lg font-black text-primary">RD${stats.initialCash.toLocaleString()}</p></CardContent>
             </Card>
             <Card 
              className={cn(
                "bg-white border-none shadow-md hover:ring-2 ring-emerald-500/20 transition-all cursor-pointer",
                expandedType === 'recovery' && "ring-4 ring-emerald-500"
              )} 
              onClick={() => handleToggleExpand('recovery')}
             >
               <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between"><CardTitle className="text-[9px] font-black uppercase text-emerald-600">Recup. Fiao</CardTitle><TrendingUp className="h-3 w-3 text-emerald-500" /></CardHeader>
               <CardContent className="p-3 pt-1">
                 <p className="text-lg font-black text-emerald-600">RD${stats.recovery.toLocaleString()}</p>
                 <div className="flex flex-col gap-0.5 mt-1">
                    <p className="text-[7px] font-bold text-emerald-600/60 uppercase">Efectivo: RD${stats.cashRecovery.toLocaleString()}</p>
                    <p className="text-[7px] font-bold text-blue-600/60 uppercase">Tarjeta: RD${(stats.recovery - stats.cashRecovery).toLocaleString()}</p>
                 </div>
               </CardContent>
             </Card>
             <Card 
              className={cn(
                "bg-white border-none shadow-md hover:ring-2 ring-primary/20 transition-all cursor-pointer",
                expandedType === 'locales' && "ring-4 ring-primary"
              )} 
              onClick={() => handleToggleExpand('locales')}
             >
               <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between"><CardTitle className="text-[9px] font-black uppercase text-muted-foreground">Efect. Local</CardTitle><Coins className="h-3 w-3 text-emerald-500" /></CardHeader>
               <CardContent className="p-3 pt-1">
                 <p className="text-lg font-black text-primary">RD${localCashTotal.toLocaleString()}</p>
                 <div className="flex items-center gap-1 text-[7px] font-bold text-primary/40 uppercase mt-1">
                   {expandedType === 'locales' ? 'Cerrar' : 'Desglosar'}
                 </div>
               </CardContent>
             </Card>
             <Card 
              className={cn(
                "bg-white border-none shadow-md border-l-4 border-l-accent hover:ring-2 ring-accent/20 transition-all cursor-pointer",
                expandedType === 'delivery' && "ring-4 ring-accent"
              )} 
              onClick={() => handleToggleExpand('delivery')}
             >
               <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between"><CardTitle className="text-[9px] font-black uppercase text-accent">Delivery</CardTitle><Truck className="h-3 w-3 text-accent" /></CardHeader>
               <CardContent className="p-3 pt-1">
                 <p className="text-lg font-black text-accent">RD${stats.deliveryCash.toLocaleString()}</p>
                 <div className="flex items-center gap-1 text-[7px] font-bold text-accent/40 uppercase mt-1">
                   {expandedType === 'delivery' ? 'Cerrar' : 'Desglosar'}
                 </div>
               </CardContent>
             </Card>
             <Card 
              className={cn(
                "bg-white border-none shadow-md hover:ring-2 ring-blue-500/20 transition-all cursor-pointer",
                expandedType === 'card' && "ring-4 ring-blue-500"
              )} 
              onClick={() => handleToggleExpand('card')}
             >
               <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between"><CardTitle className="text-[9px] font-black uppercase text-muted-foreground">Tarjeta</CardTitle><CreditCard className="h-3 w-3 text-blue-500" /></CardHeader>
               <CardContent className="p-3 pt-1">
                 <p className="text-lg font-black text-primary">RD${stats.card.toLocaleString()}</p>
                 <div className="flex items-center gap-1 text-[7px] font-bold text-primary/40 uppercase mt-1">
                   {expandedType === 'card' ? 'Cerrar' : 'Desglosar'}
                 </div>
               </CardContent>
             </Card>
             <Card 
              className={cn(
                "bg-white border-none shadow-md hover:ring-2 ring-orange-500/20 transition-all cursor-pointer",
                expandedType === 'fiado' && "ring-4 ring-orange-500"
              )} 
              onClick={() => handleToggleExpand('fiado')}
             >
               <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between"><CardTitle className="text-[9px] font-black uppercase text-muted-foreground">Venta Fiao</CardTitle><UserPlus className="h-3 w-3 text-orange-600" /></CardHeader>
               <CardContent className="p-3 pt-1">
                 <p className="text-lg font-black text-primary">RD${stats.credit.toLocaleString()}</p>
                 <div className="flex items-center gap-1 text-[7px] font-bold text-primary/40 uppercase mt-1">
                   {expandedType === 'fiado' ? 'Cerrar' : 'Desglosar'}
                 </div>
               </CardContent>
             </Card>
             <Card className="bg-destructive/5 border-none shadow-md">
               <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between"><CardTitle className="text-[9px] font-black uppercase text-destructive">Egresos</CardTitle><TrendingDown className="h-3 w-3 text-destructive" /></CardHeader>
               <CardContent className="p-3 pt-1"><p className="text-lg font-black text-destructive">RD${stats.expenses.toLocaleString()}</p></CardContent>
             </Card>
          </div>

          {expandedType && (
            <div className="animate-in slide-in-from-top-4 fade-in duration-300">
               <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white">
                  <CardHeader className={cn(
                    "p-6 text-white flex flex-row items-center justify-between shrink-0",
                    expandedType === 'locales' && "bg-primary",
                    expandedType === 'delivery' && "bg-accent",
                    expandedType === 'card' && "bg-blue-600",
                    expandedType === 'fiado' && "bg-orange-600",
                    expandedType === 'recovery' && "bg-emerald-600"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-black uppercase">
                          {expandedType === 'locales' && 'Ventas Locales'}
                          {expandedType === 'delivery' && 'Ventas Delivery'}
                          {expandedType === 'card' && 'Ventas Tarjeta'}
                          {expandedType === 'fiado' && 'Ventas a Crédito (Fiao)'}
                          {expandedType === 'recovery' && 'Recuperación de Deuda (Abonos)'}
                        </CardTitle>
                        <p className="text-[9px] font-bold opacity-80 uppercase tracking-widest">
                           Cajero: {selectedCashierId === 'all' ? 'TODOS' : availableCashiers.find(c => c.id === selectedCashierId)?.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="bg-white/10 text-white border-white/20 hover:bg-white/20 font-black h-9 gap-2 px-4" onClick={handlePrintSummary}>
                         <Printer className="h-4 w-4" /> Imprimir A4
                      </Button>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setExpandedType(null)}>
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[450px] w-full">
                      <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="font-black text-[10px] uppercase pl-6">ID / Hora</TableHead>
                            <TableHead className="font-black text-[10px] uppercase">Cajero / Cliente</TableHead>
                            <TableHead className="font-black text-[10px] uppercase text-center">Método</TableHead>
                            <TableHead className="text-right font-black text-[10px] uppercase pr-6">Importe</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {expandedTransactions.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-20 italic font-bold opacity-30">No se encontraron movimientos.</TableCell></TableRow>
                          ) : expandedTransactions.map((tx) => {
                            let amt = tx.totalAmount;
                            if (tx.transactionType === 'FiadoPayment') amt = Math.abs(tx.totalAmount);
                            else {
                                if (expandedType === 'locales' || expandedType === 'delivery') amt = tx.cashAmount ?? tx.totalAmount;
                                if (expandedType === 'card') amt = tx.cardAmount ?? tx.totalAmount;
                                if (expandedType === 'fiado') amt = tx.fiadoAmount ?? tx.totalAmount;
                            }

                            return (
                              <TableRow key={tx.id} className="hover:bg-muted/30 group">
                                <TableCell className="pl-6 py-4">
                                  <p className="font-mono text-[10px] font-black text-primary">#{tx.id.slice(-8)}</p>
                                  <p className="text-[9px] text-muted-foreground font-bold">{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </TableCell>
                                <TableCell>
                                  <p className="text-[10px] font-black text-primary uppercase leading-tight">{tx.cashierName || '---'}</p>
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase truncate max-w-[150px]">{tx.customerName || 'Venta Local'}</p>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary">{tx.paymentMethod}</Badge>
                                </TableCell>
                                <TableCell className="text-right pr-6">
                                  <p className="font-black text-primary text-sm">RD${Number(amt).toLocaleString()}</p>
                                </TableCell>
                                <TableCell>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-opacity" 
                                    onClick={() => handleReprintDual(tx)}
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <ScrollBar orientation="vertical" />
                    </ScrollArea>
                  </CardContent>
               </Card>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card 
              className="shadow-lg border-none bg-primary text-white overflow-hidden relative group cursor-pointer hover:scale-[1.02] transition-all"
              onClick={() => setIsExpectedDetailOpen(true)}
            >
              <div className="absolute right-[-10px] top-[-10px] opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-500"><Receipt className="h-32 w-32" /></div>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80 text-white">
                    {selectedCashierId === 'all' ? 'Esperado Global en Caja' : 'Aportación Neta de este Cajero'}
                  </CardTitle>
                  <Info className="h-3 w-3 opacity-40" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black">RD${finalCashWithInitial.toLocaleString()}</div>
                <p className="text-[9px] mt-1 opacity-70 font-bold uppercase">
                  Click para ver desglose
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-lg border-none bg-destructive/5 text-destructive border-l-8 border-l-destructive">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase">Egresos del Cajero</CardTitle>
                <TrendingDown className="h-5 w-5" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black">RD${stats.expenses.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-2xl border-none rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-muted/10 border-b p-8"><CardTitle className="text-2xl font-black text-primary">Cierre de Sesión General</CardTitle><CardDescription className="font-bold">Ingresa el efectivo total para cuadrar la plataforma.</CardDescription></CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="space-y-4">
                <Label className="text-lg font-black text-primary uppercase tracking-widest">Efectivo Físico Contado (RD$)</Label>
                <div className="relative">
                  <Banknote className="absolute left-6 top-1/2 -translate-y-1/2 h-10 w-10 text-muted-foreground opacity-20" />
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    className="h-24 pl-20 text-5xl font-black text-center border-4 border-muted focus:border-primary transition-all rounded-3xl" 
                    value={physicalCash} 
                    onChange={(e) => { 
                      setPhysicalCash(e.target.value); 
                    }} 
                  />
                </div>
              </div>
              
              {physicalCash !== "" && (
                <div className={`p-8 rounded-[2rem] border-4 animate-in zoom-in-95 duration-500 ${isPerfectReconciliation ? 'bg-emerald-50 border-emerald-200' : 'bg-destructive/5 border-destructive/20'}`}>
                  <div className="flex flex-col items-center justify-center text-center space-y-4">
                    <div className={`h-16 w-16 rounded-full flex items-center justify-center shadow-xl ${isPerfectReconciliation ? 'bg-emerald-500' : 'bg-destructive'}`}>{isPerfectReconciliation ? <CheckCircle2 className="h-10 w-10 text-white" /> : <AlertTriangle className="h-10 w-10 text-white" />}</div>
                    <div>
                      <p className={`text-sm font-black uppercase ${isPerfectReconciliation ? 'text-emerald-700' : 'text-destructive'}`}>{isPerfectReconciliation ? 'CUADRE PERFECTO' : (difference > 0 ? 'SOBRANTE DETECTADO' : 'FALTANTE DETECTADO')}</p>
                      <h2 className={`text-6xl font-black ${isPerfectReconciliation ? 'text-emerald-600' : 'text-destructive'}`}>RD${Math.abs(difference).toLocaleString()}</h2>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="p-8 bg-muted/5 border-t">
              <Button 
                className="w-full h-16 text-xl font-black bg-primary shadow-xl rounded-2xl gap-3 transition-all active:scale-95" 
                disabled={!physicalCash || isSaving} 
                onClick={handleFinalizeTurno}
              >
                {isSaving ? <Loader2 className="animate-spin h-6 w-6" /> : <Printer className="h-6 w-6" />} 
                Finalizar Cuadre y Reiniciar Caja
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <Card className="shadow-xl border-none rounded-3xl overflow-hidden">
            <CardHeader className="bg-muted/30 border-b"><CardTitle className="text-sm font-black flex items-center gap-2"><History className="h-4 w-4" /> Historial de Sesiones</CardTitle></CardHeader>
            <CardContent className="p-0">
               <ScrollArea className="h-[550px]">
                  <div className="divide-y">
                    <TooltipProvider>
                      {isSessionsLoading ? (
                        <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-primary opacity-20" /></div>
                      ) : sortedSessions.length === 0 ? (
                        <p className="p-10 text-center text-xs text-muted-foreground italic font-bold">Sin cierres previos.</p>
                      ) : sortedSessions.map((session) => {
                        const sessDiff = Number(session.discrepancy) || 0;
                        const isSessPerfect = Math.abs(sessDiff) < 0.01;
                        const diffLabel = isSessPerfect ? "Diferencia Final:" : sessDiff > 0 ? "SOBRANTE:" : "FALTANTE:";
                        
                        return (
                          <Tooltip key={session.id} delayDuration={100}>
                            <TooltipTrigger asChild>
                              <div className="p-4 hover:bg-muted/30 transition-colors group cursor-default">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="text-xs font-black text-primary uppercase">{session.staffName}</p>
                                    <p className="text-[9px] text-muted-foreground font-bold">{mounted ? new Date(session.closedAt || session.createdAt).toLocaleString() : '-'}</p>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <Badge variant="outline" className={`text-[8px] font-black ${isSessPerfect ? 'text-emerald-600 border-emerald-200' : 'text-destructive border-destructive/20'}`}>{isSessPerfect ? 'OK' : `DIF: RD$${Math.abs(sessDiff).toLocaleString()}`}</Badge>
                                    <Button 
                                      variant="outline" 
                                      size="icon" 
                                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-all text-primary border-primary/20 hover:bg-primary hover:text-white"
                                      onClick={(e) => { e.stopPropagation(); handleClosingReprint(session); }}
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="p-0 border-none shadow-2xl rounded-2xl overflow-hidden w-80">
                               <Card className="border-none shadow-none bg-white">
                                  <CardHeader className="bg-primary text-white p-4">
                                     <CardTitle className="text-sm font-black uppercase">Resumen de Cuadre</CardTitle>
                                     <p className="text-[9px] opacity-80 uppercase font-bold">{mounted ? new Date(session.closedAt || session.createdAt).toLocaleString() : ''}</p>
                                  </CardHeader>
                                  <CardContent className="p-4 space-y-2 text-[11px]">
                                     <div className="flex justify-between items-center">
                                       <span className="text-muted-foreground uppercase font-bold">Fondo:</span>
                                       <span className="font-mono font-black">RD${(session.initialCash || 0).toLocaleString()}</span>
                                     </div>
                                     <div className="flex justify-between items-center">
                                       <span className="text-muted-foreground uppercase font-bold">Ventas Efectivo:</span>
                                       <span className="font-mono font-black">RD${(session.cashSales || 0).toLocaleString()}</span>
                                     </div>
                                     <div className="flex justify-between items-center text-destructive">
                                       <span className="uppercase font-bold">Egresos:</span>
                                       <span className="font-mono font-black">RD${Math.abs(session.totalExpenses || 0).toLocaleString()}</span>
                                     </div>
                                     <Separator className="my-2" />
                                     <div className={cn(
                                       "flex justify-between items-center font-black p-3 rounded-xl mt-3 shadow-inner",
                                       isSessPerfect ? "bg-emerald-50 text-emerald-600" : "bg-destructive/5 text-destructive"
                                     )}>
                                        <span className="uppercase text-[10px]">{diffLabel}</span>
                                        <span className="font-mono text-sm">RD${Math.abs(sessDiff).toLocaleString()}</span>
                                     </div>
                                  </CardContent>
                               </Card>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </TooltipProvider>
                  </div>
                  <ScrollBar orientation="vertical" />
               </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* MODAL DETALLE DE EFECTIVO ESPERADO */}
      <Dialog open={isExpectedDetailOpen} onOpenChange={setIsExpectedDetailOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-primary">Desglose de Efectivo</DialogTitle>
            <ShadDialogDescription className="font-bold">Origen del balance esperado en caja física.</ShadDialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
             <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-xl">
                   <span className="text-xs font-bold uppercase text-muted-foreground">(+) Fondo Inicial (Apertura)</span>
                   <span className="font-black">RD${stats.initialCash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl text-emerald-700">
                   <span className="text-xs font-bold uppercase text-emerald-600">(+) Ventas Cash POS / Local</span>
                   <span className="font-black">RD${localCashTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-accent/10 rounded-xl text-accent">
                   <span className="text-xs font-bold uppercase text-accent/80">(+) Recaudado Delivery (Cash)</span>
                   <span className="font-black">RD${stats.deliveryCash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl text-blue-700">
                   <span className="text-xs font-bold uppercase text-blue-600">(+) Abonos de Clientes (Cash)</span>
                   <span className="font-black">RD${stats.cashRecovery.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-destructive/5 rounded-xl text-destructive">
                   <span className="text-xs font-bold uppercase text-destructive/80">(-) Gastos y Salidas de Caja</span>
                   <span className="font-black">RD${stats.expenses.toLocaleString()}</span>
                </div>
             </div>
             <Separator />
             <div className="flex justify-between items-center p-6 bg-primary text-white rounded-[2rem] shadow-xl">
                <span className="font-black uppercase text-sm">Efectivo Final Esperado:</span>
                <span className="text-3xl font-black">RD${finalCashWithInitial.toLocaleString()}</span>
             </div>
          </div>
          <DialogFooter>
             <Button className="w-full h-14 font-black rounded-xl bg-primary text-white" onClick={() => setIsExpectedDetailOpen(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInitialCashDialogOpen} onOpenChange={setIsInitialCashDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader><DialogTitle className="text-2xl font-black">Fondo de Apertura</DialogTitle></DialogHeader>
          <div className="py-6 space-y-4">
             <div className="space-y-2">
               <Label className="font-black text-xs uppercase text-muted-foreground">Monto Base (RD$)</Label>
               <Input type="number" className="h-16 text-3xl font-black text-center" value={initialCashInput} onChange={(e) => setInitialCashInput(e.target.value)} autoFocus />
             </div>
          </div>
          <DialogFooter><Button className="w-full h-14 text-lg font-black" onClick={handleSaveInitialCash} disabled={!initialCashInput || isSavingInitialCash}>Guardar Fondo</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
