"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Plus, 
  Receipt, 
  Calendar as CalendarIcon, 
  TrendingDown, 
  DollarSign, 
  Trash2,
  AlertCircle,
  Loader2,
  Wallet,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Banknote,
  Lock,
  Unlock,
  ShoppingCart,
  Package,
  Users,
  Briefcase,
  ChevronDown,
  Edit3,
  Calculator,
  Info,
  Search,
  Filter,
  UserPlus,
  RefreshCw,
  Clock,
  History,
  Save,
  UserCircle,
  Printer,
  X,
  FileText,
  Download
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, orderBy, where } from "firebase/firestore";
import { setDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { dateKey } from "@/lib/date-value";

const EXPENSE_CATEGORIES = [
  "Reinversión de Stock",
  "Alquiler",
  "Luz / Energía",
  "Agua",
  "Nómina (Sueldos)",
  "Basura / Mantenimiento",
  "Internet / Teléfono",
  "Seguridad",
  "Publicidad",
  "Reparaciones",
  "Varios / Misceláneos"
];

export default function ExpensesPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");

  // Selection state for PDF
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [summaryForPrint, setSummaryForPrint] = useState<any>(null);

  // Date Range States
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Dialog open states
  const [isPayrollBatchDialogOpen, setIsPayrollBatchDialogOpen] = useState(false);
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);

  // Popover controls for calendars
  const [isGastoCalendarOpen, setIsGastoCalendarOpen] = useState(false);

  // Auth/Security states
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [masterPasswordInput, setMasterPasswordInput] = useState("");
  const [pendingAction, setPendingAction] = useState<{ type: 'delete' | 'delete-emp' | 'process-payroll' | 'none', id?: string }>({ type: 'none' });

  // General Form states
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Varios / Misceláneos");
  const [expenseDate, setExpenseDate] = useState<Date | undefined>(new Date());
  const [expenseType, setExpenseType] = useState<string>("DynamicExpense");

  // Employee Form states
  const [empName, setEmpName] = useState("");
  const [empSalary, setEmpSalary] = useState("");
  const [empProfitShare, setEmpProfitShare] = useState("");
  const [empFrequency, setEmpFrequency] = useState("Mensual");
  const [editingEmployee, setEditingEmployee] = useState<any>(null);

  useEffect(() => { 
    setMounted(true); 
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);
    setStartDate(lastMonth.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

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

  const isAdmin = mounted && (profile?.role === 'Admin' || profile?.role === 'Supervisor');
  const isOwner = mounted && profile?.role === 'Admin';

  // Employees collection
  const employeesQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "employees");
  }, [db, profile?.colmadoId]);
  const { data: employees, isLoading: isEmployeesLoading } = useCollection(employeesQuery);

  // Entries collection
  const entriesQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "bookkeepingEntries");
  }, [db, profile?.colmadoId]);
  const { data: rawEntries, isLoading: isEntriesLoading } = useCollection(entriesQuery);

  const allEntries = useMemo(() => {
    if (!rawEntries) return [];
    return [...rawEntries].sort((a, b) => {
      const dateA = new Date(a.entryDate || a.createdAt || 0).getTime();
      const dateB = new Date(b.entryDate || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [rawEntries]);

  const filteredEntries = useMemo(() => {
    if (!allEntries) return [];
    return allEntries.filter(e => {
      if (e.entryType === 'InitialCash') return false;
      
      const entryDate = dateKey(e.entryDate || e.createdAt);
      const isInDateRange = (!startDate || !endDate) || (entryDate >= startDate && entryDate <= endDate);
      
      const matchesSearch = !searchTerm || 
        e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.category?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesTypeFilter = 
        selectedCategoryFilter === 'all' || 
        (selectedCategoryFilter === 'stock' && (e.category === 'Reinversión de Stock' || e.entryType === 'ProductExpense')) ||
        (selectedCategoryFilter === 'regular' && e.category !== 'Reinversión de Stock' && e.entryType !== 'ProductExpense');

      return isInDateRange && matchesSearch && matchesTypeFilter;
    });
  }, [allEntries, startDate, endDate, searchTerm, selectedCategoryFilter]);

  const stats = useMemo(() => {
    const isAutonomous = !!colmado?.isAutonomous;
    
    // Filtrar para los totales contables (NUEVA LÓGICA: En autónomo, la reinversión de caja ES la oficial)
    const accountingEntries = filteredEntries.filter(e => {
      // Ignorar solo los antiguos marcados para exclusión si existieran, 
      // pero por regla general ahora todo lo que llega aquí es contable
      if (isAutonomous && e.excludeFromAccounting) return false;
      return true;
    });

    const total = accountingEntries.reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);
    const payroll = accountingEntries.filter(e => e.isPayroll).reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);
    const stockInvestment = accountingEntries.filter(e => e.entryType === 'ProductExpense' || e.category === 'Reinversión de Stock').reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0);
    const regular = total - payroll - stockInvestment;
    
    return { total, payroll, regular, stockInvestment };
  }, [filteredEntries, colmado?.isAutonomous]);

  const handleVerifyMasterKey = () => {
    if (masterPasswordInput === colmado?.masterKey) {
      setIsAuthDialogOpen(false);
      setMasterPasswordInput("");
      
      if (pendingAction.type === 'delete' && pendingAction.id) {
        deleteDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "bookkeepingEntries", pendingAction.id));
        toast({ variant: "destructive", title: "Registro Eliminado" });
      } else if (pendingAction.type === 'delete-emp' && pendingAction.id) {
        deleteDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "employees", pendingAction.id));
        toast({ variant: "destructive", title: "Empleado Eliminado" });
      } else if (pendingAction.type === 'process-payroll') {
        executePayrollBatch();
      }
      setPendingAction({ type: 'none' });
    } else {
      toast({ variant: "destructive", title: "Llave Incorrecta", description: "Acceso denegado." });
    }
  };

  const handleSaveExpense = () => {
    if (!profile?.colmadoId || !expenseName || !expenseAmount) return;
    setIsSaving(true);
    const entryId = `entry_${Date.now()}`;
    const now = new Date().toISOString();
    
    const finalType = expenseCategory === "Reinversión de Stock" ? "ProductExpense" : expenseType;

    const entryData = {
      id: entryId,
      colmadoId: profile.colmadoId,
      entryType: finalType,
      description: expenseName,
      amount: -Math.abs(Number(expenseAmount)),
      category: expenseCategory || "Varios / Misceláneos",
      entryDate: expenseDate?.toISOString() || now,
      createdAt: now,
      updatedAt: now,
      userId: user?.uid,
      userName: profile?.firstName || "Administrador",
      cashRegisterSessionId: "active_session",
      isPayroll: false
    };

    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "bookkeepingEntries", entryId), entryData, { merge: true });
    toast({ title: "Gasto Registrado" });
    setIsExpenseDialogOpen(false);
    setExpenseName(""); setExpenseAmount("");
    setIsSaving(false);
  };

  const handleSaveEmployee = () => {
    if (!profile?.colmadoId || !empName.trim()) return;
    const salary = empSalary.trim() === "" ? 0 : Number(empSalary);
    if (!Number.isFinite(salary) || salary < 0) {
      toast({ variant: "destructive", title: "Sueldo inválido", description: "Indica un monto de cero o mayor." });
      return;
    }
    const share = empProfitShare.trim() === "" ? null : Number(empProfitShare);
    if (isOwner && share !== null && (!Number.isFinite(share) || share < 0 || share > 100)) {
      toast({ variant: "destructive", title: "Porcentaje inválido", description: "Indica un valor entre 0 y 100%." });
      return;
    }
    const otherShares = (employees || []).filter(e => e.id !== editingEmployee?.id && e.isActive !== false)
      .reduce((sum, e) => sum + (Number(e.profitSharePercent) || 0), 0);
    if (isOwner && otherShares + (share ?? 0) > 100) {
      toast({ variant: "destructive", title: "El reparto supera el 100%", description: `Queda disponible ${(100 - otherShares).toFixed(2)}%.` });
      return;
    }
    setIsSaving(true);
    const empId = editingEmployee?.id || `emp_${Date.now()}`;
    const now = new Date().toISOString();

    const empData = {
      id: empId,
      colmadoId: profile.colmadoId,
      fullName: empName,
      salary,
      frequency: empFrequency,
      isActive: true,
      createdAt: editingEmployee?.createdAt || now,
      updatedAt: now,
      ...(isOwner ? { profitSharePercent: share, profitShareUpdatedAt: now } : {})
    };

    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "employees", empId), empData, { merge: true });
    toast({ title: editingEmployee ? "Empleado Actualizado" : "Empleado Registrado" });
    setIsEmployeeDialogOpen(false);
    setEmpName(""); setEmpSalary(""); setEmpProfitShare(""); setEditingEmployee(null);
    setIsSaving(false);
  };

  const executePayrollBatch = () => {
    if (!employees || employees.length === 0 || !profile?.colmadoId) return;
    
    const now = new Date();
    const periodName = now.toLocaleString('es-DO', { month: 'long', year: 'numeric' });
    const nowIso = now.toISOString();

    employees.forEach(emp => {
      if (!emp.isActive) return;
      const entryId = `nomina_${emp.id}_${now.getMonth()}_${now.getFullYear()}`;
      
      const entryData = {
        id: entryId,
        colmadoId: profile.colmadoId,
        entryType: "PayrollExpense",
        description: `NÓMINA RECURRENTE: ${emp.fullName} (${emp.frequency}) - PERIODO: ${periodName}`,
        amount: -Math.abs(emp.salary),
        category: "Nómina (Sueldos)",
        entryDate: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        userId: user?.uid,
        userName: profile?.firstName || "Administrador",
        cashRegisterSessionId: "active_session",
        isPayroll: true,
        employeeId: emp.id
      };

      setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "bookkeepingEntries", entryId), entryData, { merge: true });
    });

    toast({ title: "Nómina Procesada", description: `Se han generado los pagos para ${employees.length} empleados.` });
    setIsPayrollBatchDialogOpen(false);
  };

  const handleDeleteEntry = (id: string) => {
    setPendingAction({ type: 'delete', id });
    setIsAuthDialogOpen(true);
  };

  const handleDeleteEmployee = (id: string) => {
    setPendingAction({ type: 'delete-emp', id });
    setIsAuthDialogOpen(true);
  };

  const handleEditEmployee = (emp: any) => {
    setEditingEmployee(emp);
    setEmpName(emp.fullName);
    setEmpSalary(emp.salary.toString());
    setEmpProfitShare(emp.profitSharePercent == null ? "" : String(emp.profitSharePercent));
    setEmpFrequency(emp.frequency);
    setIsEmployeeDialogOpen(true);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handlePrintSummary = () => {
    const selectedEntries = filteredEntries.filter(e => selectedIds.includes(e.id));
    if (selectedEntries.length === 0) return;
    
    setSummaryForPrint({
      entries: selectedEntries,
      total: selectedEntries.reduce((sum, e) => sum + Math.abs(e.amount), 0),
      date: new Date().toLocaleString(),
      colmadoName: colmado?.name || "Colmadom Cloud",
      colmadoAddress: colmado?.address || "República Dominicana"
    });

    setTimeout(() => {
      window.print();
      setSummaryForPrint(null);
    }, 500);
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 print:p-0">
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 20mm; }
          body * { visibility: hidden !important; background: none !important; }
          .summary-expense-report, .summary-expense-report * { visibility: visible !important; }
          .summary-expense-report {
            display: block !important;
            position: absolute !important;
            left: 0 !important; top: 0 !important; 
            width: 100% !important;
            padding: 0 !important;
            font-family: 'PT Sans', sans-serif !important;
            background: white !important; color: black !important;
            z-index: 9999 !important; height: auto;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* REPORTE DE GASTOS SELECCIONADOS TAMAÑO A4 */}
      {summaryForPrint && (
        <div className="summary-expense-report hidden">
          <div className="text-center mb-10 border-b-2 border-black pb-6">
            <h1 className="text-3xl font-black uppercase text-black">{summaryForPrint.colmadoName}</h1>
            <p className="text-sm font-bold text-black/70">{summaryForPrint.colmadoAddress}</p>
            <h2 className="text-xl font-black mt-6 underline uppercase">Resumen Consolidado de Egresos</h2>
            <p className="text-[10px] text-black/50 mt-2">Fecha de Emisión: {summaryForPrint.date}</p>
          </div>

          <div className="w-full">
            <table className="w-full border-collapse border border-black text-[12px]">
              <thead>
                <tr className="bg-black/5">
                  <th className="border border-black p-3 text-left">FECHA</th>
                  <th className="border border-black p-3 text-left">DESCRIPCIÓN</th>
                  <th className="border border-black p-3 text-left">CATEGORÍA</th>
                  <th className="border border-black p-3 text-left">RESPONSABLE</th>
                  <th className="border border-black p-3 text-right">MONTO (RD$)</th>
                </tr>
              </thead>
              <tbody>
                {summaryForPrint.entries.map((e: any) => (
                  <tr key={e.id}>
                    <td className="border border-black p-3">{new Date(e.entryDate || e.createdAt).toLocaleDateString()}</td>
                    <td className="border border-black p-3 font-bold uppercase">{e.description}</td>
                    <td className="border border-black p-3">{e.category}</td>
                    <td className="border border-black p-3">{e.userName || '---'}</td>
                    <td className="border border-black p-3 text-right font-black">RD${Math.abs(e.amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-black/10">
                  <td colSpan={4} className="border border-black p-3 text-right font-black text-lg">TOTAL CONSOLIDADO:</td>
                  <td className="border border-black p-3 text-right font-black text-lg underline">RD${summaryForPrint.total.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-20 grid grid-cols-2 gap-20 px-10">
            <div className="border-t border-black pt-2 text-center">
              <p className="font-black text-[10px] uppercase">FIRMA CAJERO / RESPONSABLE</p>
            </div>
            <div className="border-t border-black pt-2 text-center">
              <p className="font-black text-[10px] uppercase">FIRMA PROPIETARIO / AUDITOR</p>
            </div>
          </div>

          <div className="mt-20 text-center text-[9px] opacity-40">
            <p>Este documento es un reporte interno de auditoría generado por Colmadom Cloud.</p>
            <p>Todos los derechos reservados &copy; 2026</p>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="p-3 bg-destructive/10 rounded-2xl">
            <TrendingDown className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-primary">Gastos y Nómina</h1>
            <p className="text-muted-foreground mt-1 font-bold">Control administrativo de egresos recurrentes.</p>
          </div>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <Button variant="outline" className="gap-2 border-accent text-accent font-black shadow-sm" onClick={handlePrintSummary}>
              <FileText className="h-5 w-5" />
              Generar Reporte A4 ({selectedIds.length})
            </Button>
          )}

          <Button variant="outline" size="lg" className="gap-2 border-primary text-primary font-black shadow-sm" onClick={() => setIsPayrollBatchDialogOpen(true)}>
            <RefreshCw className="h-5 w-5" />
            Generar Nómina
          </Button>

          <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2 bg-destructive hover:bg-destructive/90 font-black shadow-lg">
                <Plus className="h-5 w-5" />
                Registrar Gasto
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-[2rem]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black">Nuevo Egreso</DialogTitle>
                <DialogDescription className="font-bold">Salida de efectivo única o variable.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label className="font-black text-xs uppercase text-muted-foreground">Concepto</Label>
                  <Input placeholder="Ej: Pago de Luz" value={expenseName} onChange={(e) => setExpenseName(e.target.value)} className="h-12 rounded-xl font-bold" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-black text-xs uppercase text-muted-foreground">Monto (RD$)</Label>
                    <Input type="number" placeholder="0.00" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} className="h-12 rounded-xl font-black" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black text-xs uppercase text-muted-foreground">Categoría</Label>
                    <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                      <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-black text-xs uppercase text-muted-foreground">Fecha</Label>
                  <Popover open={isGastoCalendarOpen} onOpenChange={setIsGastoCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-12 justify-start text-left font-bold rounded-xl">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {expenseDate ? format(expenseDate, "PPP", { locale: es }) : "Elegir fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={expenseDate} onSelect={(d) => { setExpenseDate(d); setIsGastoCalendarOpen(false); }} autoFocus /></PopoverContent>
                  </Popover>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSaveExpense} className="w-full h-14 text-lg font-black bg-destructive rounded-2xl" disabled={isSaving}>
                  {isSaving ? <Loader2 className="animate-spin" /> : "Confirmar Egreso"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 no-print">
        <Card className="bg-destructive text-white border-none shadow-xl overflow-hidden relative group rounded-[2rem]">
          <div className="absolute right-[-10px] top-[-10px] opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-500"><TrendingDown className="h-40 w-40" /></div>
          <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80 text-white">Total Egresos Periodo</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-black">RD${stats.total.toLocaleString()}</div><p className="text-[10px] mt-2 opacity-70 font-bold uppercase">Gastos + Nómina pagada</p></CardContent>
        </Card>

        <Card className="shadow-lg border-none rounded-[2rem]">
          <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-[10px] font-black uppercase text-muted-foreground">Nómina Pagada</CardTitle><Users className="h-5 w-5 text-primary" /></CardHeader>
          <CardContent><div className="text-3xl font-black text-primary">RD${stats.payroll.toLocaleString()}</div></CardContent>
        </Card>

        <Card className="shadow-lg border-none rounded-[2rem]">
          <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-[10px] font-black uppercase text-muted-foreground">Gastos Fijos/Var.</CardTitle><Receipt className="h-5 w-5 text-orange-500" /></CardHeader>
          <CardContent><div className="text-3xl font-black text-orange-600">RD${stats.regular.toLocaleString()}</div></CardContent>
        </Card>

        <Card className="shadow-lg border-none rounded-[2rem] bg-accent text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-[10px] font-black uppercase opacity-80">Reinversión Stock</CardTitle><Package className="h-5 w-5 opacity-50" /></CardHeader>
          <CardContent><div className="text-3xl font-black">RD${stats.stockInvestment.toLocaleString()}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="history" className="w-full no-print">
        <TabsList className="grid w-full grid-cols-2 h-16 bg-muted/20 p-1 rounded-2xl mb-8">
          <TabsTrigger value="history" className="font-black uppercase text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg"><History className="mr-2 h-4 w-4" /> Historial de Egresos</TabsTrigger>
          <TabsTrigger value="staff" className="font-black uppercase text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg"><Users className="mr-2 h-4 w-4" /> Gestión de Personal</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-6">
           <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-2xl border shadow-sm">
             <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-widest"><Filter className="h-4 w-4" /> Filtros:</div>
             <div className="flex gap-2 bg-muted/30 p-1 rounded-xl">
               <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-sm font-bold p-2 outline-none" />
               <span className="flex items-center text-muted-foreground font-black px-1">-</span>
               <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-sm font-bold p-2 outline-none" />
             </div>
             
             <div className="flex gap-2">
                <Button 
                  variant={selectedCategoryFilter === 'all' ? 'default' : 'outline'} 
                  size="sm" 
                  className="font-black text-[10px] uppercase rounded-xl h-9"
                  onClick={() => setSelectedCategoryFilter('all')}
                >
                  TODOS
                </Button>
                <Button 
                  variant={selectedCategoryFilter === 'stock' ? 'default' : 'outline'} 
                  size="sm" 
                  className="font-black text-[10px] uppercase rounded-xl h-9 gap-1.5"
                  onClick={() => setSelectedCategoryFilter('stock')}
                >
                  <Package className="h-3 w-3" /> REINVERSIÓN
                </Button>
                <Button 
                  variant={selectedCategoryFilter === 'regular' ? 'default' : 'outline'} 
                  size="sm" 
                  className="font-black text-[10px] uppercase rounded-xl h-9 gap-1.5"
                  onClick={() => setSelectedCategoryFilter('regular')}
                >
                  <TrendingDown className="h-3 w-3" /> GASTOS CAJA
                </Button>
             </div>

             <div className="flex-1 relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar concepto..." className="pl-10 h-10 bg-muted/5 rounded-xl border-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
             </div>
           </div>

           <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
             <Table>
               <TableHeader className="bg-muted/50 h-16">
                 <TableRow>
                   <TableHead className="w-12 px-6">
                      <Checkbox checked={selectedIds.length === filteredEntries.length && filteredEntries.length > 0} onCheckedChange={() => {
                        if (selectedIds.length === filteredEntries.length) setSelectedIds([]);
                        else setSelectedIds(filteredEntries.map(e => e.id));
                      }} />
                   </TableHead>
                   <TableHead className="font-black">Fecha / ID</TableHead>
                   <TableHead className="font-black">Concepto / Categoría</TableHead>
                   <TableHead className="font-black">Responsable</TableHead>
                   <TableHead className="font-black text-right">Monto</TableHead>
                   <TableHead className="font-black text-right px-8">Acciones</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {isEntriesLoading ? (
                   <TableRow><TableCell colSpan={6} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-12 w-12 text-primary opacity-20" /></TableCell></TableRow>
                 ) : filteredEntries.length === 0 ? (
                   <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic font-black opacity-30">No hay egresos que coincidan con el filtro.</TableCell></TableRow>
                 ) : filteredEntries.map((e) => {
                   const isAutonomousExcl = !!e.excludeFromAccounting && colmado?.isAutonomous;
                   const isCajaReinvestment = e.description?.startsWith('[CAJA] REINVERSIÓN:');
                   return (
                     <TableRow key={e.id} className={cn("hover:bg-muted/20 transition-colors", selectedIds.includes(e.id) && "bg-primary/5")}>
                       <TableCell className="px-6">
                          <Checkbox checked={selectedIds.includes(e.id)} onCheckedChange={() => handleToggleSelect(e.id)} />
                       </TableCell>
                       <TableCell className="py-5">
                          <p className="font-bold text-xs uppercase leading-none">{mounted ? new Date(e.entryDate || e.createdAt).toLocaleDateString() : '-'}</p>
                          <p className="text-[8px] font-mono font-bold text-muted-foreground mt-1 uppercase">ID: {e.id.slice(-8)}</p>
                       </TableCell>
                       <TableCell>
                          <div className="flex items-center gap-3">
                             <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${e.isPayroll ? 'bg-primary/10 text-primary' : (e.category === 'Reinversión de Stock' || e.entryType === 'ProductExpense') ? 'bg-accent/10 text-accent' : 'bg-destructive/5 text-destructive'}`}>
                                {e.isPayroll ? <Briefcase className="h-4 w-4" /> : (e.category === 'Reinversión de Stock' || e.entryType === 'ProductExpense') ? <Package className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                             </div>
                             <div>
                                <p className="font-black text-xs uppercase leading-tight">{e.description}</p>
                                <div className="flex gap-2 mt-1">
                                   <Badge variant="outline" className="text-[8px] font-black uppercase opacity-50 border-none px-0">{e.category}</Badge>
                                   {isCajaReinvestment && (
                                     <Badge className="bg-blue-100 text-blue-700 border-none text-[7px] font-black h-3.5 px-1.5 uppercase">Reinversión de Caja</Badge>
                                   )}
                                   {isAutonomousExcl && (
                                     <Badge className="bg-orange-100 text-orange-700 border-none text-[7px] font-black h-3.5 px-1.5 uppercase">No reflejado (Histórico)</Badge>
                                   )}
                                </div>
                             </div>
                          </div>
                       </TableCell>
                       <TableCell>
                          <div className="flex items-center gap-2">
                             <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
                             <span className="text-[10px] font-black uppercase text-primary">{e.userName || '---'}</span>
                          </div>
                       </TableCell>
                       <TableCell className="text-right font-black text-destructive text-lg">RD${Math.abs(e.amount).toLocaleString()}</TableCell>
                       <TableCell className="text-right px-8">
                          <div className="flex justify-end gap-1">
                             <Button variant="ghost" size="icon" className="text-destructive h-9 w-9 hover:bg-destructive/5" onClick={() => handleDeleteEntry(e.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                       </TableCell>
                     </TableRow>
                   );
                 })}
               </TableBody>
             </Table>
           </Card>
        </TabsContent>

        <TabsContent value="staff" className="space-y-6">
           <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border shadow-sm">
              <div>
                <h3 className="text-xl font-black text-primary uppercase">Plantilla de Personal</h3>
                <p className="text-xs font-bold text-muted-foreground italic">Configura sueldos fijos para nómina recurrente.</p>
              </div>
              <Button onClick={() => { setEditingEmployee(null); setEmpName(""); setEmpSalary(""); setEmpProfitShare(""); setIsEmployeeDialogOpen(true); }} className="gap-2 bg-primary font-black h-12 px-6 rounded-xl shadow-lg">
                <UserPlus className="h-5 w-5" /> Registrar Empleado
              </Button>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isEmployeesLoading ? (
                <div className="col-span-full py-20 text-center"><Loader2 className="animate-spin mx-auto text-primary opacity-20" /></div>
              ) : employees?.length === 0 ? (
                <div className="col-span-full py-20 text-center bg-muted/20 rounded-[2.5rem] border-4 border-dashed">
                   <Users className="h-16 w-16 mx-auto opacity-10 mb-4" />
                   <p className="font-black text-muted-foreground uppercase italic tracking-widest">Sin personal registrado</p>
                </div>
              ) : employees?.map((emp) => (
                <Card key={emp.id} className="border-none shadow-xl rounded-[2rem] overflow-hidden group hover:scale-[1.02] transition-all">
                  <CardHeader className="bg-primary/5 p-6 border-b">
                     <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                           <div className="h-14 w-14 bg-primary text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg uppercase">
                              {emp.fullName[0]}
                           </div>
                           <div>
                              <CardTitle className="text-lg font-black uppercase leading-tight">{emp.fullName}</CardTitle>
                              <Badge className="bg-primary/10 text-primary border-none text-[8px] font-black uppercase px-2 h-5 mt-1">{emp.frequency}</Badge>
                           </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleEditEmployee(emp)}><Edit3 className="h-4 w-4" /></Button>
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteEmployee(emp.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                     </div>
                  </CardHeader>
                  <CardContent className="p-6 flex justify-between items-end">
                     <div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Sueldo Base</p>
                        <p className="text-3xl font-black text-primary">RD${emp.salary.toLocaleString()}</p>
                        <p className="text-xs font-bold text-emerald-700 mt-2">{emp.profitSharePercent == null ? "Solo sueldo fijo" : `Beneficio neto: ${Number(emp.profitSharePercent).toFixed(2)}%`}</p>
                     </div>
                     <CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-20" />
                  </CardContent>
                </Card>
              ))}
           </div>
        </TabsContent>
      </Tabs>

      {/* Employee Dialog */}
      <Dialog open={isEmployeeDialogOpen} onOpenChange={setIsEmployeeDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">{editingEmployee ? 'Editar Empleado' : 'Registrar Personal'}</DialogTitle>
            <DialogDescription className="font-bold">Define el sueldo recurrente para este miembro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label className="font-black text-xs uppercase text-muted-foreground">Nombre Completo</Label>
              <Input value={empName} onChange={(e) => setEmpName(e.target.value)} className="h-14 rounded-2xl font-black text-lg" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-black text-xs uppercase text-muted-foreground">Sueldo Fijo (RD$)</Label>
                <Input type="number" value={empSalary} onChange={(e) => setEmpSalary(e.target.value)} className="h-14 rounded-2xl font-black text-xl text-primary" />
              </div>
              <div className="space-y-2">
                <Label className="font-black text-xs uppercase text-muted-foreground">Frecuencia</Label>
                <Select value={empFrequency} onValueChange={setEmpFrequency}>
                  <SelectTrigger className="h-14 rounded-2xl font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Semanal">Semanal</SelectItem>
                    <SelectItem value="Quincenal">Quincenal</SelectItem>
                    <SelectItem value="Mensual">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isOwner && <div className="space-y-2">
              <Label className="font-black text-xs uppercase text-muted-foreground">Participación en beneficio neto (%)</Label>
              <Input type="number" min="0" max="100" step="0.01" value={empProfitShare} onChange={(e) => setEmpProfitShare(e.target.value)} className="h-14 rounded-2xl font-black text-xl text-emerald-700" />
              <p className="text-xs text-muted-foreground">Opcional. Déjalo en blanco para pagar solo sueldo. El total de empleados activos no puede superar el 100%.</p>
            </div>}
          </div>
          <DialogFooter>
            <Button onClick={handleSaveEmployee} className="w-full h-16 text-xl font-black bg-primary rounded-2xl shadow-xl" disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />}
              Guardar Datos de Personal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Payroll Confirmation */}
      <Dialog open={isPayrollBatchDialogOpen} onOpenChange={setIsPayrollBatchDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <DialogHeader className="bg-primary text-white p-8">
            <DialogTitle className="text-3xl font-black uppercase tracking-tight">Procesar Nómina</DialogTitle>
            <DialogDescription className="text-white/80 font-bold uppercase tracking-widest text-xs">Pago recurrente del mes actual</DialogDescription>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div className="p-6 bg-primary/5 rounded-[2rem] border-2 border-dashed border-primary/20 text-center space-y-2">
               <p className="text-[10px] font-black uppercase text-muted-foreground">Personal a Pagar</p>
               <p className="text-5xl font-black text-primary">{employees?.filter(e => e.isActive).length || 0}</p>
               <p className="text-[10px] font-bold text-primary/60 uppercase">Total: RD${employees?.filter(e => e.isActive).reduce((sum, e) => sum + e.salary, 0).toLocaleString()}</p>
            </div>
            
            <div className="space-y-2">
               <Label className="font-black text-xs uppercase tracking-widest text-primary block text-center">Ingresa Llave Maestra para Autorizar</Label>
               <Input 
                 type="password" 
                 placeholder="••••••••" 
                 className="h-16 text-3xl font-black text-center border-2 border-primary/20 rounded-2xl" 
                 value={masterPasswordInput}
                 onChange={(e) => setMasterPasswordInput(e.target.value)}
                 autoFocus
               />
            </div>
          </div>
          <DialogFooter className="p-8 bg-muted/10 border-t">
            <Button className="w-full h-16 text-xl font-black bg-primary rounded-2xl shadow-xl gap-2" onClick={() => { setPendingAction({ type: 'process-payroll' }); handleVerifyMasterKey(); }} disabled={!masterPasswordInput || !employees?.length}>
              <CheckCircle2 className="h-6 w-6" /> Confirmar Pagos de Personal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auth Dialog for General Protection */}
      <Dialog open={isAuthDialogOpen} onOpenChange={(open) => { setIsAuthDialogOpen(open); if(!open) setMasterPasswordInput(""); }}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4"><Lock className="h-8 w-8 text-primary" /></div>
            <DialogTitle className="text-2xl font-black text-center text-primary uppercase">Acción Protegida</DialogTitle>
            <DialogDescription className="text-center font-bold">Se requiere la LLAVE MAESTRA para realizar esta acción administrativa.</DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
             <div className="space-y-2">
               <Label className="font-black text-xs uppercase tracking-widest text-primary text-center block">Ingresa Llave Maestra</Label>
               <Input 
                type="password" 
                placeholder="••••••••" 
                className="h-16 text-3xl font-black text-center border-2 border-primary/20 rounded-2xl" 
                value={masterPasswordInput}
                onChange={(e) => setMasterPasswordInput(e.target.value)}
                autoFocus
               />
             </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-16 text-xl font-black bg-primary rounded-2xl shadow-xl" onClick={handleVerifyMasterKey}>Desbloquear y Ejecutar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
