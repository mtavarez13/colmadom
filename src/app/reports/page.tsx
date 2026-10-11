"use client";

import { useMemo, useState, useEffect } from "react";
import { calculateProfitSharing } from "@/lib/profit-sharing";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Loader2, 
  Search, 
  FileSpreadsheet, 
  Receipt,
  Filter,
  PieChart as PieChartIcon,
  ShoppingBag,
  Package,
  Wallet,
  Target,
  ChevronRight,
  Trash2,
  XCircle,
  Lock,
  AlertTriangle,
  TrendingUp as TrendingUpIcon,
  Eye,
  ArrowRight,
  Printer,
  FileText,
  ClipboardList,
  CreditCard,
  Briefcase,
  AlertCircle,
  Users,
  UserCircle,
  Calculator,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingDown,
  CheckCircle2,
  LayoutDashboard
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, orderBy, increment, getDocs } from "firebase/firestore";
import { updateDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import * as XLSX from 'xlsx';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { buildAccountingReport, reportDateKey } from '@/lib/accounting-report';

export const dynamic = 'force-dynamic';

const rd = (value: number) => `RD$${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ReportDonut({ title, slices }: { title: string; slices: { label: string; value: number; color: string }[] }) {
  const positive = slices.filter(slice => slice.value > 0);
  const total = positive.reduce((sum, slice) => sum + slice.value, 0);
  const circumference = 2 * Math.PI * 35;
  let position = 0;
  return <div className="report-card rounded-xl border border-slate-200 p-4">
    <h4 className="text-xs font-black uppercase text-primary mb-3">{title}</h4>
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0" role="img" aria-label={title}>
        <circle cx="50" cy="50" r="35" fill="none" stroke="#e2e8f0" strokeWidth="16" />
        {positive.map(slice => {
          const length = total ? slice.value / total * circumference : 0;
          const offset = position;
          position += length;
          return <circle key={slice.label} cx="50" cy="50" r="35" fill="none" stroke={slice.color} strokeWidth="16"
            strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" />;
        })}
        <text x="50" y="51" textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="bold" fill="#17365d">{positive.length ? `${positive.length} partes` : 'Sin datos'}</text>
      </svg>
      <div className="space-y-2 min-w-0 flex-1">
        {positive.length ? positive.map(slice => <div key={slice.label} className="text-[10px] flex items-start gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: slice.color }} />
          <span className="min-w-0 flex-1">{slice.label}<br /><strong>{rd(slice.value)} · {(slice.value / total * 100).toFixed(1)}%</strong></span>
        </div>) : <p className="text-xs text-muted-foreground">No hay beneficios positivos en el período.</p>}
      </div>
    </div>
  </div>;
}

export default function AccountingPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modal states
  const [isExpensesDetailOpen, setIsExpensesDetailOpen] = useState(false);
  const [isSalesDetailOpen, setIsSalesDetailOpen] = useState(false);
  const [isInventoryInversionOpen, setIsInventoryInversionOpen] = useState(false);
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isMasterKeyDialogOpen, setIsMasterKeyDialogOpen] = useState(false);
  const [masterKeyInput, setMasterKeyInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Print states
  const [txForLocalPrint, setTxForLocalPrint] = useState<any>(null);
  const [monthlySummaryForPrint, setMonthlySummaryForPrint] = useState<any>(null);
  const [staffAuditPrint, setStaffAuditAuditPrint] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    setStartDate(lastWeek.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  const isSuperAdmin = (emailAddr: string | null) => 
    emailAddr === "admin@colmadom.com" || 
    emailAddr === "martin.tavarez.gomez@gmail.com" ||
    emailAddr === "tavarezgomezmartin@gmail.com";

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

  // PERMISOS MAESTROS
  const isAdmin = mounted && (
    profile?.role === 'Admin' || 
    profile?.role === 'Supervisor' || 
    isSuperAdmin(user?.email || null)
  );

  const transactionsQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return query(
      collection(db, "colmados", profile.colmadoId, "transactions"),
      orderBy("createdAt", "desc")
    );
  }, [db, profile?.colmadoId]);

  const { data: rawTransactions, isLoading: isTxLoading } = useCollection(transactionsQuery);

  const entriesQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "bookkeepingEntries");
  }, [db, profile?.colmadoId]);

  const { data: rawEntries, isLoading: isEntriesLoading } = useCollection(entriesQuery);

  const employeesQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "employees");
  }, [db, profile?.colmadoId]);
  const { data: employees, isLoading: isEmployeesLoading } = useCollection(employeesQuery);

  const productsQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return query(collection(db, "colmados", profile.colmadoId, "products"));
  }, [db, profile?.colmadoId]);

  const { data: rawProducts, isLoading: isProductsLoading } = useCollection(productsQuery);

  const sessionsQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "cashRegisterSessions");
  }, [db, profile?.colmadoId]);

  const { data: rawSessions, isLoading: isSessionsLoading } = useCollection(sessionsQuery);

  const periodTransactions = useMemo(() => {
    if (!rawTransactions || !startDate || !endDate) return [];
    return rawTransactions.filter(tx => {
      const txDate = reportDateKey(tx.createdAt);
      return txDate >= startDate && txDate <= endDate;
    });
  }, [rawTransactions, startDate, endDate]);

  const filteredTransactions = useMemo(() => {
    return periodTransactions.filter(tx => {
      const matchesSearch = (tx.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          tx.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tx.transactionType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tx.cashierName?.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesSearch;
    });
  }, [periodTransactions, searchTerm]);

  const reportData = useMemo(() => buildAccountingReport(
    periodTransactions, rawEntries || [], rawProducts || [], startDate, endDate, !!colmado?.isAutonomous
  ), [periodTransactions, rawEntries, rawProducts, startDate, endDate, colmado?.isAutonomous]);
  const stats = reportData.stats;
  const profitSharing = useMemo(() => calculateProfitSharing(stats.netProfit, employees || []), [stats.netProfit, employees]);
  const inventoryStats = reportData.inventory;
  const staffSummary = useMemo(() => {
    if (!filteredTransactions || !rawSessions) return [];

    const summary: Record<string, { 
      id: string, 
      name: string, 
      cashSales: number, 
      cardSales: number, 
      totalSales: number, 
      discrepancy: number,
      sessionsCount: number
    }> = {};

    filteredTransactions.forEach(tx => {
      if (tx.isAnnulled || !tx.userId) return;
      const uid = tx.userId;
      if (!summary[uid]) {
        summary[uid] = { id: uid, name: tx.cashierName || 'Cajero', cashSales: 0, cardSales: 0, totalSales: 0, discrepancy: 0, sessionsCount: 0 };
      }
      
      const amount = Number(tx.totalAmount) || 0;
      let txCash = 0;
      let txCard = 0;

      if (tx.transactionType === "FiadoPayment") {
        const inflow = Math.abs(amount);
        if (tx.paymentMethod === "Efectivo" || tx.paymentMethod === "Cash") txCash = inflow;
        if (tx.paymentMethod === "Tarjeta" || tx.paymentMethod === "Card") txCard = inflow;
      } else {
        const hasDetailed = tx.cashAmount !== undefined || tx.cardAmount !== undefined;
        txCash = hasDetailed ? (Number(tx.cashAmount) || 0) : (tx.paymentMethod === "Efectivo" || tx.paymentMethod === "Cash" ? amount : 0);
        txCard = hasDetailed ? (Number(tx.cardAmount) || 0) : (tx.paymentMethod === "Tarjeta" || tx.paymentMethod === "Card" ? amount : 0);
      }

      summary[uid].cashSales += txCash;
      summary[uid].cardSales += txCard;
      summary[uid].totalSales += (tx.transactionType === "FiadoPayment" ? 0 : amount);
    });

    const periodSessions = rawSessions.filter(s => {
      const sessDate = reportDateKey(s.closedAt || s.createdAt);
      return sessDate >= startDate && sessDate <= endDate;
    });

    periodSessions.forEach(s => {
      const uid = s.openingUserId;
      if (!uid) return;
      if (!summary[uid]) {
        summary[uid] = { id: uid, name: s.staffName || 'Cajero', cashSales: 0, cardSales: 0, totalSales: 0, discrepancy: 0, sessionsCount: 0 };
      }
      summary[uid].discrepancy += (Number(s.discrepancy) || 0);
      summary[uid].sessionsCount += 1;
    });

    return Object.values(summary).sort((a, b) => b.totalSales - a.totalSales);
  }, [filteredTransactions, rawSessions, startDate, endDate]);

  const productProfitSummary = useMemo(() => reportData.productResults
    .filter(product => String(product.name || '').toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => b.profit - a.profit), [reportData.productResults, searchTerm]);
  const handlePrintStaffAudit = () => {
    if (!staffSummary.length || !colmado) return;
    setStaffAuditAuditPrint({
      colmadoName: colmado.name,
      colmadoAddress: colmado.address,
      colmadoLogo: colmado.logoUrl,
      period: `${startDate} al ${endDate}`,
      date: new Date().toLocaleString(),
      summary: staffSummary,
      totals: {
        cash: staffSummary.reduce((s, c) => s + c.cashSales, 0),
        card: staffSummary.reduce((s, c) => s + c.cardSales, 0),
        discrepancy: staffSummary.reduce((s, c) => s + c.discrepancy, 0)
      }
    });
    setTimeout(() => { window.print(); setStaffAuditAuditPrint(null); }, 800);
  };

  const handleGenerateMonthlySummary = () => {
    if (!stats || !inventoryStats || !colmado) return;
    setMonthlySummaryForPrint({
      colmadoName: colmado.name,
      colmadoAddress: colmado.address,
      colmadoLogo: colmado.logoUrl,
      period: `${startDate} al ${endDate}`,
      date: new Date().toLocaleString(),
      stats: { ...stats },
      profitSharing,
      inventory: { ...inventoryStats },
      topSold: reportData.topSold,
      topProfitable: reportData.topProfitable,
      productResults: reportData.productResults
    });
    setTimeout(() => {
      window.addEventListener('afterprint', () => setMonthlySummaryForPrint(null), { once: true });
      window.print();
    }, 400);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredTransactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTransactions.map(tx => tx.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleAnnulTransaction = (tx: any) => {
    if (!profile?.colmadoId || !isAdmin) return;
    const colmadoId = profile.colmadoId;
    updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "transactions", tx.id), {
      isAnnulled: true,
      annulledAt: new Date().toISOString(),
      annulledBy: user?.uid
    });
    toast({ title: "Venta Anulada" });
  };

  const handleReprintDual = (tx: any) => {
    if (!profile?.colmadoId || !colmado) return;
    
    setTxForLocalPrint({ ...tx, colmadoName: colmado.name, colmadoAddress: colmado.address });

    if (colmado.allowRemotePrinting !== false) {
      const printRequestId = `pr_reports_${tx.id}_${Date.now()}`;
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

  const handleBulkDelete = async () => {
    if (!profile?.colmadoId || selectedIds.length === 0) return;
    if (masterKeyInput !== colmado?.masterKey) {
      toast({ variant: "destructive", title: "Llave Maestra Incorrecta" });
      return;
    }
    setIsDeleting(true);
    const colmadoId = profile.colmadoId;
    selectedIds.forEach(id => deleteDocumentNonBlocking(doc(db, "colmados", colmadoId, "transactions", id)));
    toast({ title: "Historial Limpiado", variant: "destructive" });
    setSelectedIds([]);
    setIsMasterKeyDialogOpen(false);
    setMasterKeyInput("");
    setIsDeleting(false);
  };

  const handleExportExcel = () => {
    if (!filteredTransactions.length) return;
    const data = filteredTransactions.map(tx => ({
      ID: tx.id,
      Fecha: new Date(tx.createdAt).toLocaleString(),
      Tipo: tx.transactionType,
      Cajero: tx.cashierName || '---',
      Cliente: tx.customerName || 'Venta Local',
      Monto: tx.totalAmount,
      Metodo: tx.paymentMethod,
      Anulada: tx.isAnnulled ? 'SI' : 'NO'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transacciones");
    XLSX.writeFile(wb, `Reporte_Colmadom_${startDate}_${endDate}.xlsx`);
  };

  const consolidatedOperatingExpenses = useMemo(() => {
    if (!rawEntries) return [];
    const isAutonomous = !!colmado?.isAutonomous;
    return rawEntries.filter(e => {
      const entryDate = reportDateKey(e.entryDate || e.createdAt);
      if (isAutonomous && e.excludeFromAccounting) return false;
      const isInDate = entryDate >= startDate && entryDate <= endDate;
      if (!isInDate) return false;
      const isRegularExpense = e.entryType?.includes('Expense') && e.entryType !== 'ProductExpense';
      const isPayroll = e.isPayroll || e.entryType === 'PayrollExpense';
      const isLoss = e.category === 'Pérdidas' || e.category === 'Vencidos';
      return isRegularExpense || isPayroll || isLoss;
    }).sort((a, b) => new Date(b.entryDate || b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rawEntries, startDate, endDate, colmado?.isAutonomous]);

  const allItemsSoldDetail = useMemo(() => {
    if (!filteredTransactions) return [];
    const items: any[] = [];
    filteredTransactions.forEach(tx => {
      if (tx.isAnnulled) return;
      if (tx.items && Array.isArray(tx.items)) {
        tx.items.forEach((item: any) => {
          items.push({
            ...item,
            txId: tx.id,
            txDate: tx.createdAt,
            paymentMethod: tx.paymentMethod,
            customerName: tx.customerName || 'Venta Local',
            cashierName: tx.cashierName || '---'
          });
        });
      }
    });
    return items.sort((a, b) => new Date(b.txDate).getTime() - new Date(a.txDate).getTime());
  }, [filteredTransactions]);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 print:p-0">
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body * { visibility: hidden !important; }
          .monthly-gerencial-report, .staff-audit-print, .monthly-gerencial-report *, .staff-audit-print * { visibility: visible !important; }
          .monthly-gerencial-report, .staff-audit-print {
            display: block !important;
            position: relative !important;
            width: 100% !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            background: white !important;
            color: black !important;
            z-index: 9999 !important;
            overflow: visible !important;
            font-family: 'PT Sans', sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .monthly-gerencial-report .report-card { break-inside: avoid; page-break-inside: avoid; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* REPORTE CONTABLE A4, listo para imprimir o guardar como PDF */}
      {monthlySummaryForPrint && (
        <div className="monthly-gerencial-report hidden">
          <div className="report-card flex items-start justify-between gap-6 border-b-2 border-primary pb-4 mb-5">
            <div className="min-w-0">
              <h1 className="text-2xl font-black uppercase text-primary">{monthlySummaryForPrint.colmadoName}</h1>
              <p className="text-xs">{monthlySummaryForPrint.colmadoAddress}</p>
              <h2 className="text-lg font-black uppercase text-primary mt-3">Reporte contable y rentabilidad</h2>
              <p className="text-xs">Período: {monthlySummaryForPrint.period} · Emitido: {monthlySummaryForPrint.date}</p>
            </div>
            {monthlySummaryForPrint.colmadoLogo && <div className="relative w-16 h-16 shrink-0"><Image src={monthlySummaryForPrint.colmadoLogo} alt="Logo" fill className="object-contain" unoptimized /></div>}
          </div>

          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              ['Ventas netas', monthlySummaryForPrint.stats.sales],
              ['Costo vendido', monthlySummaryForPrint.stats.cogs],
              ['Beneficio bruto', monthlySummaryForPrint.stats.grossProfit],
              ['Resultado neto', monthlySummaryForPrint.stats.netProfit]
            ].map(([label, value]: any) => <div key={label} className="report-card rounded-lg border border-primary/20 p-3 bg-primary/5">
              <p className="text-[9px] font-black uppercase text-primary">{label}</p>
              <p className="text-base font-black text-primary">{rd(value)}</p>
            </div>)}
          </div>

          <section className="report-card mb-5 rounded-xl border border-slate-200 p-4 text-xs">
            <h3 className="font-black text-sm text-primary mb-2">Lectura del período</h3>
            <p>Se registraron <strong>{monthlySummaryForPrint.stats.count} ventas</strong> por {rd(monthlySummaryForPrint.stats.sales)}. El costo de los artículos vendidos fue {rd(monthlySummaryForPrint.stats.cogs)} y el beneficio bruto resultó en {rd(monthlySummaryForPrint.stats.grossProfit)}.</p>
            <p className="mt-2">Margen bruto: <strong>{monthlySummaryForPrint.stats.grossMargin.toFixed(1)}%</strong>. Gastos operativos: {rd(monthlySummaryForPrint.stats.expenses)}; nómina: {rd(monthlySummaryForPrint.stats.payroll)}; pérdidas y vencidos: {rd(monthlySummaryForPrint.stats.losses)}. El resultado neto fue <strong>{rd(monthlySummaryForPrint.stats.netProfit)}</strong>, equivalente a un margen neto de <strong>{monthlySummaryForPrint.stats.netMargin.toFixed(1)}%</strong>.</p>
            <p className="mt-2 text-muted-foreground">Ventas cobradas con tarjeta: {rd(monthlySummaryForPrint.stats.cardSales)} (incluidas en ventas, no se suman otra vez). Compras de mercancía del período: {rd(monthlySummaryForPrint.stats.stockInvestment)} (inversión en inventario, no gasto operativo).</p>
          </section>

          <section className="report-card mb-5 rounded-xl border border-emerald-200 p-4 text-xs">
            <h3 className="font-black text-sm text-emerald-800 mb-2">Participación de empleados en beneficios netos</h3>
            <p>Base del reparto: {rd(monthlySummaryForPrint.profitSharing.base)}. Se toma el resultado neto después de gastos, nómina y pérdidas; si hay pérdida, la base es cero.</p>
            {monthlySummaryForPrint.profitSharing.allocations.length ? <div className="mt-3 space-y-1">
              {monthlySummaryForPrint.profitSharing.allocations.map((employee: any) => <div key={employee.id} className="flex justify-between border-b py-1"><span>{employee.name} · {employee.percent.toFixed(2)}%</span><strong>{rd(employee.amount)}</strong></div>)}
              <div className="flex justify-between pt-2 font-black"><span>Total para empleados · {monthlySummaryForPrint.profitSharing.totalPercent.toFixed(2)}%</span><span>{rd(monthlySummaryForPrint.profitSharing.totalAmount)}</span></div>
              <div className="flex justify-between font-black text-emerald-800"><span>Resultado después del reparto</span><span>{rd(monthlySummaryForPrint.profitSharing.remaining)}</span></div>
            </div> : <p className="mt-2 text-muted-foreground">No hay empleados activos con participación configurada.</p>}
            <p className="mt-2 text-[10px] text-muted-foreground">Importes estimados con los porcentajes vigentes al emitir el reporte; no representan pagos registrados en caja o nómina.</p>
          </section>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <section className="report-card rounded-xl border border-slate-200 p-4">
              <h3 className="font-black text-xs uppercase text-primary mb-3">3 productos más vendidos · unidades</h3>
              {monthlySummaryForPrint.topSold.length ? monthlySummaryForPrint.topSold.map((item: any, index: number) => <div key={item.id} className="border-b border-slate-100 py-1.5 text-[10px]">
                <p className="font-black">{index + 1}. {item.name} · {item.qtySold.toLocaleString('es-DO')} unidades</p>
                <p>Ventas: {rd(item.totalRevenue)} · Beneficio: {item.completeCost ? rd(item.profit) : 'costo incompleto'}</p>
              </div>) : <p className="text-xs">Sin artículos vendidos en el período.</p>}
            </section>
            <section className="report-card rounded-xl border border-slate-200 p-4">
              <h3 className="font-black text-xs uppercase text-primary mb-3">3 productos más rentables · beneficio</h3>
              {monthlySummaryForPrint.topProfitable.length ? monthlySummaryForPrint.topProfitable.map((item: any, index: number) => <div key={item.id} className="border-b border-slate-100 py-1.5 text-[10px]">
                <p className="font-black">{index + 1}. {item.name} · {rd(item.profit)}</p>
                <p>{item.qtySold.toLocaleString('es-DO')} unidades · Margen {(item.totalRevenue > 0 ? item.profit / item.totalRevenue * 100 : 0).toFixed(1)}%</p>
              </div>) : <p className="text-xs">No hay productos con costo completo.</p>}
            </section>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <ReportDonut title="Origen del beneficio por producto" slices={(() => {
              const profitable = monthlySummaryForPrint.productResults.filter((item: any) => item.completeCost && item.profit > 0);
              const ranked = [...profitable].sort((a: any, b: any) => b.profit - a.profit);
              const colors = ['#2563eb', '#10b981', '#f59e0b'];
              const top = ranked.slice(0, 3).map((item: any, index: number) => ({ label: item.name, value: item.profit, color: colors[index] }));
              const other = ranked.slice(3).reduce((sum: number, item: any) => sum + item.profit, 0);
              return other > 0 ? [...top, { label: 'Otros productos', value: other, color: '#94a3b8' }] : top;
            })()} />
            <ReportDonut title="Distribución de costos y resultado" slices={[
              { label: 'Costo vendido', value: monthlySummaryForPrint.stats.cogs, color: '#f59e0b' },
              { label: 'Gastos, nómina y pérdidas', value: monthlySummaryForPrint.stats.totalOpEx, color: '#ef4444' },
              { label: 'Beneficio neto positivo', value: Math.max(0, monthlySummaryForPrint.stats.netProfit), color: '#10b981' }
            ]} />
          </div>
          {monthlySummaryForPrint.stats.netProfit < 0 && <p className="text-[10px] text-red-700 mb-4">El período cerró con pérdida neta de {rd(Math.abs(monthlySummaryForPrint.stats.netProfit))}; por eso el gráfico de distribución no incluye una porción de beneficio neto positivo.</p>}

          <section className="report-card rounded-xl border border-emerald-300 bg-emerald-50 p-4 mb-4 text-xs">
            <h3 className="font-black text-sm text-emerald-900 mb-2">Inversión del stock actual</h3>
            <p>Mercancía disponible: <strong>{monthlySummaryForPrint.inventory.units.toLocaleString('es-DO')} unidades</strong>. Capital invertido al costo registrado: <strong>{rd(monthlySummaryForPrint.inventory.investment)}</strong>. Valor estimado a precio de venta: {rd(monthlySummaryForPrint.inventory.potentialRevenue)}. Beneficio potencial antes de gastos: {rd(monthlySummaryForPrint.inventory.margin)}.</p>
            <p className="mt-1 text-emerald-900/70">Esta valoración corresponde al inventario actual, no solo a las compras del período.</p>
          </section>

          {(monthlySummaryForPrint.stats.missingCostTransactions > 0 || monthlySummaryForPrint.stats.missingItemsTransactions > 0 || monthlySummaryForPrint.inventory.uncostedProducts > 0) && <p className="report-card rounded-lg border border-amber-300 bg-amber-50 p-3 text-[10px]">
            <strong>Datos por revisar:</strong> {monthlySummaryForPrint.stats.missingCostTransactions} ventas sin costo completo, {monthlySummaryForPrint.stats.missingItemsTransactions} ventas sin detalle de artículos y {monthlySummaryForPrint.inventory.uncostedProducts} productos con stock sin costo registrado. Los márgenes pueden estar sobreestimados hasta completar esos costos.
          </p>}
          <p className="text-[9px] text-muted-foreground mt-4 border-t pt-2">Cálculo: ventas netas − costo de mercancía vendida = beneficio bruto; beneficio bruto − gastos operativos − nómina − pérdidas = resultado neto. Los abonos de fiado y migraciones de deuda no se cuentan como nuevas ventas. Las anulaciones se excluyen.</p>
        </div>
      )}
      {/* REPORTE DE AUDITORÍA DE PERSONAL A4 */}
      {staffAuditPrint && (
        <div className="staff-audit-print hidden">
           <div className="flex items-center justify-between mb-12 border-b-8 border-accent pb-10">
              <div className="flex items-center gap-8 text-left">
                 {staffAuditPrint.colmadoLogo && (
                   <div className="h-32 w-32 relative rounded-3xl overflow-hidden border-4 border-accent/20 shadow-xl shrink-0">
                      <Image src={staffAuditPrint.colmadoLogo} alt="Logo" fill className="object-cover" unoptimized />
                   </div>
                 )}
                 <div className="flex-1 min-w-0">
                    <h1 className="text-5xl font-black uppercase text-accent leading-[0.9] break-words">{staffAuditPrint.colmadoName}</h1>
                    <p className="text-xl font-bold text-muted-foreground mt-3">{staffAuditPrint.colmadoAddress}</p>
                 </div>
              </div>
              <div className="text-right shrink-0 ml-6">
                 <div className="bg-accent text-white px-10 py-4 rounded-[2rem] shadow-2xl">
                    <h2 className="text-2xl font-black uppercase tracking-widest leading-none">Auditoría Staff</h2>
                 </div>
                 <p className="text-xs text-muted-foreground mt-4 uppercase font-black tracking-widest">Periodo: {staffAuditPrint.period}</p>
              </div>
           </div>

           <div className="grid grid-cols-3 gap-6 mb-10">
              <div className="p-8 bg-accent/5 border-2 border-accent/20 rounded-[2.5rem] text-center">
                 <p className="text-xs font-black uppercase text-accent tracking-widest mb-1">Ventas Cash</p>
                 <p className="text-3xl font-black text-accent">RD${staffAuditPrint.totals.cash.toLocaleString()}</p>
              </div>
              <div className="p-8 bg-blue-50 border-2 border-blue-200 rounded-[2.5rem] text-center">
                 <p className="text-xs font-black uppercase text-blue-600 tracking-widest mb-1">Ventas Tarjeta</p>
                 <p className="text-3xl font-black text-blue-700">RD${staffAuditPrint.totals.card.toLocaleString()}</p>
              </div>
              <div className={cn(
                "p-8 border-4 rounded-[2.5rem] text-center shadow-2xl",
                staffAuditPrint.totals.discrepancy < 0 ? "bg-red-50 border-destructive" : "bg-emerald-50 border-emerald-500"
              )}>
                 <p className={cn("text-xs font-black uppercase tracking-widest mb-1", staffAuditPrint.totals.discrepancy < 0 ? "text-destructive" : "text-emerald-600")}>Diferencia Neta</p>
                 <p className={cn("text-5xl font-black", staffAuditPrint.totals.discrepancy < 0 ? "text-destructive" : "text-emerald-700")}>RD${staffAuditPrint.totals.discrepancy.toLocaleString()}</p>
              </div>
           </div>

           <table className="w-full border-collapse border border-accent/10 text-[12px]">
             <thead>
                <tr className="bg-accent text-white font-black uppercase">
                   <th className="p-5 text-left border">CAJERO / IDENTIDAD</th>
                   <th className="p-5 text-center border">TURNOS</th>
                   <th className="p-5 text-right border">CASH</th>
                   <th className="p-5 text-right border">TARJETA</th>
                   <th className="p-5 text-right border">DIFERENCIA</th>
                </tr>
             </thead>
             <tbody>
                {staffAuditPrint.summary.map((staff: any) => (
                  <tr key={staff.id} className="border-b border-accent/5 hover:bg-accent/5">
                     <td className="p-5 font-black uppercase text-accent border">{staff.name}</td>
                     <td className="p-5 text-center font-black border">{staff.sessionsCount}</td>
                     <td className="p-5 text-right border">RD${staff.cashSales.toLocaleString()}</td>
                     <td className="p-5 text-right border">RD${staff.cardSales.toLocaleString()}</td>
                     <td className={cn("p-5 text-right font-black border text-lg", staff.discrepancy < 0 ? "text-destructive" : "text-emerald-600")}>
                        RD${staff.discrepancy.toLocaleString()}
                     </td>
                  </tr>
                ))}
             </tbody>
           </table>

           <div className="mt-48 grid grid-cols-2 gap-32 px-10">
              <div className="border-t-4 border-accent/30 pt-6 text-center">
                 <p className="font-black text-xs uppercase text-accent">REVISADO POR ADMINISTRACIÓN</p>
              </div>
              <div className="border-t-4 border-accent/30 pt-6 text-center">
                 <p className="font-black text-xs uppercase text-accent">VALIDADO POR DUEÑO</p>
              </div>
           </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="p-3 bg-primary/10 rounded-2xl"><BarChart3 className="h-8 w-8 text-primary" /></div>
          <div><h1 className="text-3xl font-black tracking-tight text-primary uppercase">Módulo Contable</h1><p className="text-muted-foreground mt-1 font-bold">Análisis estratégico y auditoría de personal.</p></div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleGenerateMonthlySummary} className="h-12 font-black gap-2 bg-primary text-white shadow-xl hover:scale-[1.02] active:scale-95 transition-all px-6" disabled={isTxLoading || isEntriesLoading || isProductsLoading || isEmployeesLoading || !colmado}><FileText className="h-5 w-5" /> Reporte contable (imprimir / PDF)</Button>
          <Button onClick={handleExportExcel} variant="outline" className="h-12 font-black gap-2 border-primary text-primary hover:bg-primary/5"><FileSpreadsheet className="h-5 w-5" /> Exportar Excel</Button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-2xl border shadow-sm no-print">
        <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-widest"><Calendar className="h-4 w-4" /> Periodo:</div>
        <div className="flex gap-2 bg-muted/30 p-1 rounded-xl w-full md:w-auto">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-sm font-bold p-2 outline-none" /><span className="flex items-center text-muted-foreground font-black px-1">-</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-sm font-bold p-2 outline-none" />
        </div>
        <div className="flex-1 relative w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar en historial..." className="pl-10 h-11 bg-muted/5 rounded-xl border-none font-bold" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <Card className="no-print border-emerald-200 bg-emerald-50/40 rounded-2xl">
        <CardContent className="p-5">
          <div className="flex flex-wrap justify-between gap-3 font-bold"><span>Participación de empleados en beneficio neto</span><span>Base: {rd(profitSharing.base)} · Reparto: {rd(profitSharing.totalAmount)} · Restante: {rd(profitSharing.remaining)}</span></div>
          <div className="flex flex-wrap gap-2 mt-3">{profitSharing.allocations.length ? profitSharing.allocations.map(employee => <Badge key={employee.id} variant="outline" className="bg-white">{employee.name}: {employee.percent.toFixed(2)}% · {rd(employee.amount)}</Badge>) : <span className="text-xs text-muted-foreground">Sin porcentajes configurados.</span>}</div>
          <p className="text-xs text-muted-foreground mt-2">Estimación según la configuración vigente. Los importes todavía no son pagos de nómina.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 no-print">
          <Dialog open={isSalesDetailOpen} onOpenChange={setIsSalesDetailOpen}>
            <DialogTrigger asChild>
              <Card className="border-none shadow-xl rounded-3xl bg-primary text-white overflow-hidden relative group cursor-pointer hover:scale-[1.02] transition-all">
                <div className="absolute right-[-20px] top-[-20px] opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-500"><TrendingUpIcon className="h-24 w-24" /></div>
                <CardHeader className="pb-1 p-4"><div className="flex justify-between items-start"><CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80 text-white">Ventas Netas</CardTitle><Badge variant="secondary" className="bg-white/20 text-white border-none text-[8px] font-black uppercase px-1.5">DETALLE</Badge></div></CardHeader>
                <CardContent className="p-4 pt-0"><div className="text-xl font-black">RD${stats.sales.toLocaleString()}</div><p className="text-[9px] mt-1 opacity-70 font-bold uppercase text-white">{stats.count} trxs</p></CardContent>
              </Card>
            </DialogTrigger>
            <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2.5rem] border-none shadow-2xl">
              <DialogHeader className="p-8 bg-primary text-white shrink-0">
                <div className="flex items-center gap-4"><div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center"><ShoppingBag className="h-8 w-8 text-white" /></div><div><DialogTitle className="text-3xl font-black">Desglose de Artículos Vendidos</DialogTitle><DialogDescription className="text-white/80 font-bold uppercase tracking-widest text-[10px]">Márgenes por producto en el periodo</DialogDescription></div></div>
              </DialogHeader>
              <div className="flex-1 overflow-hidden p-8 pt-0">
                <div className="flex gap-4 mb-6 pt-6">
                   <div className="bg-muted/30 p-4 rounded-2xl border-2 border-dashed flex-1"><p className="text-[9px] font-black uppercase text-muted-foreground">Venta Bruta</p><p className="text-2xl font-black text-primary">RD${stats.sales.toLocaleString()}</p></div>
                   <div className="bg-orange-50 p-4 rounded-2xl border-2 border-orange-100 flex-1"><p className="text-[9px] font-black uppercase text-orange-600">Costo (COGS)</p><p className="text-2xl font-black text-orange-700">RD${stats.cogs.toLocaleString()}</p></div>
                   <div className="bg-emerald-50 p-4 rounded-2xl border-2 border-emerald-100 flex-1"><p className="text-[9px] font-black uppercase text-emerald-600">Utilidad Est.</p><p className="text-2xl font-black text-emerald-700">RD${(stats.sales - stats.cogs).toLocaleString()}</p></div>
                </div>
                <div className="border rounded-[1.5rem] overflow-hidden bg-white shadow-sm flex flex-col h-[50vh]">
                  <ScrollArea className="flex-1"><Table><TableHeader className="bg-muted/50 sticky top-0 z-10"><TableRow><TableHead className="font-black text-[10px] uppercase">Fecha</TableHead><TableHead className="font-black text-[10px] uppercase">Artículo</TableHead><TableHead className="text-center font-black text-[10px] uppercase">Cant.</TableHead><TableHead className="text-right font-black text-[10px] uppercase">Costo</TableHead><TableHead className="text-right font-black text-[10px] uppercase">Venta</TableHead><TableHead className="text-right font-black text-[10px] uppercase bg-emerald-50">Ganancia</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {allItemsSoldDetail.map((item, idx) => {
                          const unitCost = Number(item.costPrice) || 0;
                          const unitSale = Number(item.price) || 0;
                          const qty = Number(item.quantity) || 0;
                          const lineMargin = (unitSale - unitCost) * qty;
                          return (
                            <TableRow key={idx}><TableCell className="py-2 text-[9px] font-black">{mounted ? new Date(item.txDate).toLocaleDateString() : '-'}</TableCell><TableCell className="font-bold text-xs uppercase">{item.name}</TableCell><TableCell className="text-center font-black text-xs">{qty.toFixed(1)}</TableCell><TableCell className="text-right text-[10px]">RD${unitCost.toLocaleString()}</TableCell><TableCell className="text-right text-[10px] font-black">RD${unitSale.toLocaleString()}</TableCell><TableCell className={`text-right font-black text-xs bg-emerald-50/20 ${lineMargin < 0 ? 'text-destructive' : 'text-emerald-600'}`}>RD${lineMargin.toLocaleString()}</TableCell></TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Card className="border-none shadow-xl rounded-3xl bg-blue-600 text-white overflow-hidden relative group"><div className="absolute right-[-20px] top-[-20px] opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-500"><CreditCard className="h-24 w-24" /></div><CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80 text-white">Ventas Tarjeta</CardTitle></CardHeader><CardContent className="p-4 pt-0"><div className="text-xl font-black">RD${stats.cardSales.toLocaleString()}</div><p className="text-[9px] mt-1 opacity-70 font-bold uppercase text-white">Total en Banco</p></CardContent></Card>

          <Dialog open={isExpensesDetailOpen} onOpenChange={setIsExpensesDetailOpen}>
            <DialogTrigger asChild><Card className="border-none shadow-xl rounded-3xl bg-white border-l-8 border-l-orange-500 cursor-pointer hover:scale-[1.02] transition-all"><CardHeader className="pb-1 p-4"><div className="flex justify-between items-start"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600">Gastos Op.</CardTitle><Badge variant="outline" className="text-[8px] font-black uppercase border-orange-200 text-orange-600">DETALLE</Badge></div></CardHeader><CardContent className="p-4 pt-0"><div className="text-xl font-black text-orange-600">RD${stats.totalOpEx.toLocaleString()}</div><p className="text-[9px] text-muted-foreground mt-1 font-bold">Consolidado (OpEx + Nómina)</p></CardContent></Card></DialogTrigger>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2.5rem] border-none shadow-2xl">
              <DialogHeader className="p-8 bg-orange-600 text-white shrink-0"><div className="flex items-center gap-4"><div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center"><Receipt className="h-8 w-8 text-white" /></div><div><DialogTitle className="text-3xl font-black">Gastos Operativos Consolidados</DialogTitle><DialogDescription className="text-white/80 font-bold uppercase tracking-widest text-[10px]">Incluye Nómina, Servicios y Pérdidas del Periodo</DialogDescription></div></div></DialogHeader>
              <div className="flex-1 overflow-hidden p-8">
                <div className="grid grid-cols-3 gap-4 mb-6"><div className="bg-muted/30 p-3 rounded-xl"><p className="text-[9px] font-black uppercase opacity-50">Sueldos</p><p className="text-lg font-black">RD${stats.payroll.toLocaleString()}</p></div><div className="bg-muted/30 p-3 rounded-xl"><p className="text-[9px] font-black uppercase opacity-50">Operativos</p><p className="text-lg font-black">RD${stats.expenses.toLocaleString()}</p></div><div className="bg-destructive/5 text-destructive p-3 rounded-xl border border-destructive/10"><p className="text-[9px] font-black uppercase opacity-50">Pérdidas</p><p className="text-lg font-black">RD${stats.losses.toLocaleString()}</p></div></div>
                <div className="border rounded-[1.5rem] overflow-hidden bg-white shadow-sm flex flex-col h-[40vh]">
                  <ScrollArea className="flex-1"><Table><TableHeader className="bg-muted/50 sticky top-0 z-10"><TableRow><TableHead className="font-black text-[10px] uppercase">Fecha</TableHead><TableHead className="font-black text-[10px] uppercase">Descripción</TableHead><TableHead className="font-black text-[10px] uppercase text-center">Tipo</TableHead><TableHead className="text-right font-black text-[10px] uppercase">Monto</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {consolidatedOperatingExpenses.length === 0 ? (
                          <TableRow><TableCell colSpan={4} className="text-center py-20 text-muted-foreground italic font-bold">No hay egresos en este rango.</TableCell></TableRow>
                        ) : consolidatedOperatingExpenses.map((expense) => {
                          const isPayroll = expense.isPayroll || expense.entryType === 'PayrollExpense';
                          const isLoss = expense.category === 'Pérdidas' || expense.category === 'Vencidos';
                          return (
                            <TableRow key={expense.id}><TableCell className="py-3 text-[10px] font-black">{mounted ? new Date(expense.entryDate || expense.createdAt).toLocaleDateString() : '-'}</TableCell><TableCell className="font-bold text-xs uppercase">{expense.description}</TableCell><TableCell className="text-center">{isPayroll ? (<Badge className="bg-blue-100 text-blue-700 border-none text-[8px] font-black uppercase"><Briefcase className="h-2 w-2 mr-1" /> NÓMINA</Badge>) : isLoss ? (<Badge className="bg-destructive/10 text-destructive border-none text-[8px] font-black uppercase"><AlertCircle className="h-2 w-2 mr-1" /> PÉRDIDA</Badge>) : (<Badge variant="outline" className="text-[8px] font-black uppercase border-orange-200 text-orange-600">OPEX</Badge>)}</TableCell><TableCell className="text-right font-black text-destructive">RD${Math.abs(expense.amount).toLocaleString()}</TableCell></TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isInventoryInversionOpen} onOpenChange={setIsInventoryInversionOpen}><DialogTrigger asChild><Card className="border-none shadow-xl rounded-3xl bg-white border-l-8 border-l-emerald-600 cursor-pointer hover:scale-[1.02] transition-all"><CardHeader className="pb-1 p-4"><div className="flex justify-between items-start"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Inversión Stock</CardTitle><Badge variant="outline" className="text-[8px] font-black uppercase border-emerald-200 text-emerald-600">ACTIVOS</Badge></div></CardHeader><CardContent className="p-4 pt-0"><div className="text-xl font-black text-emerald-600">RD${inventoryStats.investment.toLocaleString()}</div><p className="text-[9px] text-muted-foreground mt-1 font-bold">Capital en Mercancía</p></CardContent></Card></DialogTrigger><DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl overflow-hidden"><DialogHeader className="bg-emerald-600 text-white p-8"><div className="flex items-center gap-4"><div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center"><Package className="h-8 w-8 text-white" /></div><div><DialogTitle className="text-3xl font-black">Inversión de Stock</DialogTitle><DialogDescription className="text-white/80 font-bold uppercase tracking-widest text-[10px]">Valoración actual</DialogDescription></div></div></DialogHeader><div className="p-8 space-y-6"><div className="space-y-4"><div className="flex justify-between items-center p-4 bg-muted/30 rounded-2xl"><span className="text-sm font-black text-muted-foreground uppercase">Costo Inversión</span><span className="text-xl font-black text-primary">RD${inventoryStats.investment.toLocaleString()}</span></div><div className="flex justify-between items-center p-4 bg-primary/5 rounded-2xl border-2 border-primary/10"><span className="text-sm font-black text-primary uppercase">Venta Estimada</span><span className="text-xl font-black text-primary">RD${inventoryStats.potentialRevenue.toLocaleString()}</span></div><Separator /><div className="flex justify-between items-center p-6 bg-emerald-50 rounded-[2rem] border-4 border-emerald-100 shadow-inner"><div><p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Utilidad Potencial</p><p className="text-4xl font-black text-emerald-700">RD${inventoryStats.margin.toLocaleString()}</p></div><Badge className="bg-emerald-600 text-white border-none h-12 w-12 flex items-center justify-center rounded-full text-lg"><TrendingUpIcon className="h-6 w-6" /></Badge></div></div></div></DialogContent></Dialog>

          <Card className="border-none shadow-xl rounded-3xl bg-white border-l-8 border-l-purple-500"><CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-purple-600">Compras Periodo</CardTitle></CardHeader><CardContent className="p-4 pt-0"><div className="text-xl font-black text-purple-600">RD${stats.stockInvestment.toLocaleString()}</div><p className="text-[9px] text-muted-foreground mt-1 font-bold">Suministros</p></CardContent></Card><Card className="border-none shadow-xl rounded-3xl bg-white border-l-8 border-l-emerald-500"><CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Utilidad Neta</CardTitle></CardHeader><CardContent className="p-4 pt-0"><div className="text-xl font-black text-emerald-600">RD${stats.netProfit.toLocaleString()}</div><p className="text-[9px] text-muted-foreground mt-1 font-bold">Resultado del período</p></CardContent></Card><Card className="border-none shadow-xl rounded-3xl bg-white border-l-8 border-l-accent"><CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-accent">Rendimiento</CardTitle></CardHeader><CardContent className="p-4 pt-0"><div className="text-xl font-black text-accent">{((stats.netProfit / (stats.sales || 1)) * 100).toFixed(1)}%</div><p className="text-[9px] text-muted-foreground mt-1 font-bold">Margen</p></CardContent></Card>
      </div>

      <Tabs defaultValue="transactions" className="w-full no-print">
        <TabsList className="grid w-full grid-cols-3 h-16 bg-muted/20 p-1 rounded-2xl mb-8"><TabsTrigger value="transactions" className="font-black uppercase text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg"><ClipboardList className="mr-2 h-4 w-4" /> Historial General</TabsTrigger><TabsTrigger value="staff" className="font-black uppercase text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg"><Users className="mr-2 h-4 w-4" /> Auditoría Cajeros</TabsTrigger><TabsTrigger value="profit" className="font-black uppercase text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg"><TrendingUpIcon className="mr-2 h-4 w-4" /> Beneficio por Productos</TabsTrigger></TabsList>
        <TabsContent value="transactions" className="space-y-6">
          <Card className="shadow-2xl border-none rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between"><CardTitle className="text-xl font-black">Registro General de Movimientos</CardTitle>{selectedIds.length > 0 && isAdmin && (<Button variant="destructive" size="sm" className="font-black h-10 gap-2" onClick={() => setIsMasterKeyDialogOpen(true)}><Trash2 className="h-4 w-4" /> Eliminar Seleccionados ({selectedIds.length})</Button>)}</CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-12 h-14 px-6">{isAdmin && (<Checkbox checked={selectedIds.length === filteredTransactions.length && filteredTransactions.length > 0} onCheckedChange={handleSelectAll} />)}</TableHead>
                    <TableHead className="font-black h-14">Fecha / Hora</TableHead><TableHead className="font-black h-14">Cajero / Cliente</TableHead><TableHead className="font-black h-14">Método</TableHead><TableHead className="text-right font-black h-14">Monto</TableHead><TableHead className="text-right font-black h-14 px-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isTxLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary mx-auto" /></TableCell></TableRow>
                  ) : filteredTransactions.map((tx) => (
                    <TableRow key={tx.id} className={selectedIds.includes(tx.id) ? 'bg-destructive/5' : 'hover:bg-muted/30'}><TableCell className="px-6">{isAdmin && (<Checkbox checked={selectedIds.includes(tx.id)} onCheckedChange={() => handleToggleSelect(tx.id)} />)}</TableCell><TableCell className="font-bold text-xs">{mounted ? new Date(tx.createdAt).toLocaleString() : '-'}</TableCell><TableCell><p className="text-[10px] font-black uppercase text-primary leading-tight">CAJERO: {tx.cashierName || '---'}</p><p className="text-xs font-bold uppercase truncate max-w-[150px] mt-1">{tx.customerName || 'Venta Local'}</p></TableCell><TableCell><Badge variant="outline" className="text-[9px] font-black uppercase">{tx.paymentMethod}</Badge></TableCell><TableCell className="text-right font-black text-primary">RD${(Number(tx.totalAmount) || 0).toLocaleString()}</TableCell><TableCell className="text-right px-6"><div className="flex justify-end gap-1"><Button variant="outline" size="icon" className="h-8 w-8 text-primary border-primary/20 hover:bg-primary hover:text-white transition-all" onClick={() => handleReprintDual(tx)} title="Reimprimir"><Printer className="h-4 w-4" /></Button>{isAdmin && !tx.isAnnulled && (<AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-4 w-4 text-destructive"><XCircle className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Anular venta?</AlertDialogTitle><AlertDialogDescription>Se devolverán los artículos al stock.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>No</AlertDialogCancel><AlertDialogAction onClick={() => handleAnnulTransaction(tx)} className="bg-destructive">Sí, Anular</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>)}</div></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="staff" className="space-y-6"><div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border shadow-sm"><div className="flex items-center gap-4"><div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-sm"><Users className="h-6 w-6" /></div><div><h3 className="text-xl font-black text-primary uppercase">Rendimiento por Cajero</h3><p className="text-xs font-bold text-muted-foreground italic">Seguimiento de ventas y precisión en cuadres.</p></div></div><Button onClick={handlePrintStaffAudit} className="gap-2 bg-accent text-white font-black h-12 px-6 rounded-xl shadow-lg"><Printer className="h-5 w-5" /> Imprimir Auditoría Staff (A4)</Button></div><Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white"><Table><TableHeader className="bg-muted/50 h-16"><TableRow><TableHead className="font-black pl-8">Identidad del Cajero</TableHead><TableHead className="text-center font-black">Turnos Cerrados</TableHead><TableHead className="text-right font-black">Ventas Cash</TableHead><TableHead className="text-right font-black">Ventas Tarjeta</TableHead><TableHead className="text-right font-black pr-8">Diferencia (Faltante/Sobrante)</TableHead></TableRow></TableHeader><TableBody>{isTxLoading || isSessionsLoading ? (<TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-12 w-12 text-primary opacity-20" /></TableCell></TableRow>) : staffSummary.length === 0 ? (<TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic font-bold">Sin actividad registrada en este periodo.</TableCell></TableRow>) : staffSummary.map((staff) => (<TableRow key={staff.id} className="hover:bg-muted/20 transition-all h-20"><TableCell className="pl-8 py-5"><div className="flex items-center gap-3"><div className="h-10 w-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary font-black uppercase shadow-inner border border-primary/10">{staff.name[0]}</div><p className="font-black text-sm uppercase text-primary">{staff.name}</p></div></TableCell><TableCell className="text-center font-black text-muted-foreground">{staff.sessionsCount}</TableCell><TableCell className="text-right font-bold">RD${staff.cashSales.toLocaleString()}</TableCell><TableCell className="text-right font-bold text-blue-700">RD${staff.cardSales.toLocaleString()}</TableCell><TableCell className="text-right pr-8"><Badge className={cn("h-8 px-4 font-black uppercase border-none shadow-sm", staff.discrepancy < 0 ? 'bg-destructive text-white' : staff.discrepancy > 0 ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white')}>{staff.discrepancy < 0 ? <ArrowDownCircle className="h-3.5 w-3.5 mr-2" /> : staff.discrepancy > 0 ? <ArrowUpCircle className="h-3.5 w-3.5 mr-2" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-2" />}{staff.discrepancy === 0 ? 'OK' : `RD$${Math.abs(staff.discrepancy).toLocaleString()}`}{staff.discrepancy < 0 ? ' FALTANTE' : staff.discrepancy > 0 ? ' SOBRANTE' : ''}</Badge></TableCell></TableRow>))}</TableBody></Table></Card></TabsContent><TabsContent value="profit" className="space-y-6"><div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border shadow-sm"><div className="flex items-center gap-4"><div className="h-12 w-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm"><TrendingUpIcon className="h-6 w-6" /></div><div><h3 className="text-xl font-black text-primary uppercase">Rentabilidad por Artículo</h3><p className="text-xs font-bold text-muted-foreground italic">Desglose de beneficios brutos por producto del inventario.</p></div></div><Badge className="bg-primary text-white h-10 px-6 rounded-xl font-black uppercase text-xs shadow-lg">{productProfitSummary.length} PRODUCTOS VENDIDOS</Badge></div><Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white"><Table><TableHeader className="bg-muted/50 h-16"><TableRow><TableHead className="font-black pl-8 uppercase text-[10px]">Producto / Categoría</TableHead><TableHead className="text-center font-black uppercase text-[10px]">Vendidos</TableHead><TableHead className="text-right font-black uppercase text-[10px]">Ingreso Neto</TableHead><TableHead className="text-right font-black uppercase text-[10px]">Costo Total</TableHead><TableHead className="text-right font-black uppercase text-[10px] pr-8 text-emerald-600">Beneficio Bruto</TableHead></TableRow></TableHeader><TableBody>{isTxLoading ? (<TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-12 w-12 text-primary opacity-20" /></TableCell></TableRow>) : productProfitSummary.length === 0 ? (<TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic font-bold uppercase tracking-widest opacity-30">Sin ventas registradas en el periodo.</TableCell></TableRow>) : productProfitSummary.map((p) => (<TableRow key={p.id} className="hover:bg-muted/20 transition-all h-16"><TableCell className="pl-8"><div><p className="font-black text-sm uppercase text-primary leading-none">{p.name}</p><p className="text-[9px] font-bold text-muted-foreground uppercase mt-1">{p.category}</p></div></TableCell><TableCell className="text-center font-black text-primary">{p.qtySold.toFixed(1)}</TableCell><TableCell className="text-right font-bold">RD${p.totalRevenue.toLocaleString()}</TableCell><TableCell className="text-right font-bold text-muted-foreground">RD${p.totalCost.toLocaleString()}</TableCell><TableCell className="text-right pr-8"><div className="flex flex-col items-end"><span className={cn("text-lg font-black", p.profit >= 0 ? "text-emerald-600" : "text-destructive")}>RD${p.profit.toLocaleString()}</span><span className="text-[9px] font-black uppercase opacity-40">{((p.profit / (p.totalRevenue || 1)) * 100).toFixed(1)}% Margen</span></div></TableCell></TableRow>))}</TableBody></Table></Card></TabsContent>
      </Tabs>

      <Dialog open={isMasterKeyDialogOpen} onOpenChange={setIsMasterKeyDialogOpen}>
        <DialogContent className="sm:max-w-md"><DialogHeader><div className="h-16 w-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4"><Lock className="h-8 w-8 text-destructive" /></div><DialogTitle className="text-2xl font-black text-center text-primary uppercase">Acción Protegida</DialogTitle><DialogDescription className="text-center font-bold">Ingresa la LLAVE MAESTRA para eliminar el historial seleccionado.</DialogDescription></DialogHeader><div className="py-6 space-y-6"><Alert variant="destructive" className="bg-destructive/5 border-destructive/20"><AlertTriangle className="h-5 w-5" /><AlertTitle className="font-black uppercase text-xs">Advertencia Crítica</AlertTitle><AlertDescription className="text-xs font-bold">Esta acción borrará permanentemente las transacciones.</AlertDescription></Alert><div className="space-y-2"><Label className="font-black text-xs uppercase tracking-widest text-primary text-center block">Ingresa Llave Maestra</Label><Input type="password" placeholder="••••••••" className="h-16 text-3xl font-black text-center border-2 border-destructive/20 rounded-2xl" value={masterKeyInput} onChange={(e) => setMasterKeyInput(e.target.value)} autoFocus /></div></div><DialogFooter><Button className="w-full h-16 text-xl font-black bg-destructive rounded-2xl shadow-xl" onClick={handleBulkDelete} disabled={!masterKeyInput || isDeleting}>{isDeleting ? <Loader2 className="animate-spin" /> : "Confirmar Eliminación Masiva"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}




