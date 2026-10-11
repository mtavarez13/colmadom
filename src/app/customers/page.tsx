"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  UserPlus, 
  Search, 
  Phone, 
  History, 
  DollarSign, 
  AlertCircle, 
  Loader2, 
  Edit, 
  Eye, 
  MapPin, 
  Calendar,
  ArrowRight,
  Receipt,
  Printer, 
  CheckCircle2,
  Package,
  X,
  Send,
  MessageSquare,
  Users as UsersIcon,
  RefreshCw,
  Database,
  ArrowUpCircle,
  Banknote,
  Trash2,
  Lock,
  AlertTriangle,
  CreditCard,
  Info,
  FileText,
  Download,
  PieChart as PieChartIcon,
  Building2
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, increment, getDocs, getDoc, updateDoc } from "firebase/firestore";
import { setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { createCustomerStatementPdf } from "@/lib/customer-statement-pdf";

function customerDate(value: any): Date | null {
  if (!value) return null;
  const date = typeof value?.toDate === 'function' ? value.toDate()
    : typeof value?.seconds === 'number' ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function creditMovement(tx: any): boolean {
  if (tx.isAnnulled) return false;
  return tx.transactionType === 'FiadoPayment' || tx.transactionType === 'DebtMigration' ||
    Number(tx.fiadoAmount || 0) > 0 || tx.paymentMethod === 'Fiado';
}

async function loadStatementLogo(url: string): Promise<{ hex: string; width: number; height: number } | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const jpeg = await (await fetch(canvas.toDataURL('image/jpeg', 0.8))).arrayBuffer();
    return { hex: Array.from(new Uint8Array(jpeg), byte => byte.toString(16).padStart(2, '0')).join(''), width: canvas.width, height: canvas.height };
  } catch { return undefined; }
}

export default function CustomersPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isProcessingMigration, setIsProcessingMigration] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Selected customer for view/edit
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [isNewCustomerDialogOpen, setIsNewCustomerDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isMigrationDialogOpen, setIsMigrationDialogOpen] = useState(false);
  const [isDeleteAuthDialogOpen, setIsDeleteAuthDialogOpen] = useState(false);

  // Transaction deletion state
  const [isDeleteTxAuthDialogOpen, setIsDeleteTxAuthDialogOpen] = useState(false);
  const [selectedTxToDelete, setSelectedTxToDelete] = useState<any>(null);

  // Reprint states
  const [txForReprint, setTxForReprint] = useState<any>(null);
  const [itemsForReprint, setItemsForReprint] = useState<any[]>([]);

  // A4 PDF Report states
  const [debtsReportForPrint, setDebtsReportForPrint] = useState<any>(null);
  const [customerStatementForPrint, setCustomerStatementForPrint] = useState<any>(null);
  const [isGeneratingStatementPdf, setIsGeneratingStatementPdf] = useState(false);

  // Payment states
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [lastPaymentInfo, setLastPaymentInfo] = useState<any>(null);

  // Migration states
  const [migrationAmount, setMigrationAmount] = useState("");
  const [migrationReason, setMigrationReason] = useState("Saldo pendiente sistema anterior");

  // Form states (Create/Edit)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [creditLimit, setCreditLimit] = useState("5000");
  const [initialDebt, setInitialDebt] = useState("0");
  const [masterKeyInput, setMasterKeyInput] = useState("");
  const [isFiscalCustomer,setIsFiscalCustomer]=useState(false);
  const [customerRnc,setCustomerRnc]=useState("");
  const [customerLegalName,setCustomerLegalName]=useState("");

  useEffect(() => {
    setMounted(true);
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

  const customersQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "customers");
  }, [db, profile?.colmadoId]);

  const { data: customers, isLoading } = useCollection(customersQuery);

  const isAdmin = mounted && (profile?.role === 'Admin' || profile?.role === 'Supervisor' || user?.email === "admin@colmadom.com" || user?.email === "martin.tavarez.gomez@gmail.com");
  const isOwner = mounted && profile?.role === 'Admin';

  const filtered = customers?.filter(c => 
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phoneNumber?.includes(searchTerm)
  ) || [];

  const totalDebt = customers?.reduce((acc, c) => acc + (c.currentDebt || 0), 0) || 0;

  const handleOpenCreate = () => {
    setSelectedCustomer(null);
    setFirstName("");
    setLastName("");
    setPhone("");
    setAddress("");
    setCreditLimit("5000");
    setInitialDebt("0");
    setMasterKeyInput("");
    setIsFiscalCustomer(false);setCustomerRnc("");setCustomerLegalName("");
    setIsNewCustomerDialogOpen(true);
  };

  const handleOpenEdit = (customer: any) => {
    if (!isOwner) return;
    setSelectedCustomer(customer);
    setFirstName(customer.firstName || "");
    setLastName(customer.lastName || "");
    setPhone(customer.phoneNumber || "");
    setAddress(customer.address || "");
    setCreditLimit(String(customer.creditLimit ?? 0));
    setMasterKeyInput("");
    setIsFiscalCustomer(customer.isFiscalCustomer===true);setCustomerRnc(customer.rnc||"");setCustomerLegalName(customer.legalName||"");
    setIsEditDialogOpen(true);
  };

  const handleOpenDetails = (customer: any) => {
    setSelectedCustomer(customer);
    setIsDetailsDialogOpen(true);
  };

  const handleDeleteRequest = (customer: any) => {
    setSelectedCustomer(customer);
    setMasterKeyInput("");
    setIsDeleteAuthDialogOpen(true);
  };

  const handleVerifyDeleteMasterKey = () => {
    if (masterKeyInput === colmado?.masterKey) {
      if (selectedCustomer && profile?.colmadoId) {
        deleteDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "customers", selectedCustomer.id));
        toast({ variant: "destructive", title: "Cliente Eliminado", description: "La libreta ha sido borrada permanentemente." });
      }
      setIsDeleteAuthDialogOpen(false);
      setMasterKeyInput("");
      setSelectedCustomer(null);
    } else {
      toast({ variant: "destructive", title: "Llave Incorrecta", description: "Acceso denegado." });
    }
  };

  const handleVerifyDeleteTxMasterKey = () => {
    if (masterKeyInput === colmado?.masterKey) {
      if (selectedTxToDelete && profile?.colmadoId && selectedCustomer) {
        const colmadoId = profile.colmadoId;
        const tx = selectedTxToDelete;

        deleteDocumentNonBlocking(doc(db, "colmados", colmadoId, "transactions", tx.id));

        updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "customers", selectedCustomer.id), {
          currentDebt: increment(-(tx.fiadoAmount || tx.totalAmount || 0)),
          updatedAt: new Date().toISOString()
        });

        toast({ variant: "destructive", title: "Movimiento Eliminado", description: "El saldo ha sido ajustado automáticamente." });
      }
      setIsDeleteTxAuthDialogOpen(false);
      setMasterKeyInput("");
      setSelectedTxToDelete(null);
    } else {
      toast({ variant: "destructive", title: "Llave Incorrecta", description: "Acceso denegado." });
    }
  };

  const handleSaveCustomer = async () => {
    if (isSaving) return;
    if (!profile?.colmadoId || !firstName.trim()) {
      toast({ variant: "destructive", title: "Escribe el nombre del cliente" });
      return;
    }
    if(isFiscalCustomer&&!(/^\d{9}$|^\d{11}$/.test(customerRnc.replace(/\D/g,''))&&customerLegalName.trim())){toast({variant:'destructive',title:'Completa el cliente fiscal',description:'Escribe un RNC o cédula válido y la razón social.'});return;}
    
    if (!colmado?.masterKey || !masterKeyInput || masterKeyInput !== colmado.masterKey) {
      toast({ variant: "destructive", title: "Acceso Denegado", description: "La Llave Maestra es incorrecta." });
      return;
    }

    const limit = Number(creditLimit);
    if (!Number.isFinite(limit) || limit < 0) {
      toast({ variant: "destructive", title: "Límite de crédito inválido" });
      return;
    }

    const colmadoId = profile.colmadoId;
    const now = new Date().toISOString();

    if (selectedCustomer && isEditDialogOpen) {
      if (!isOwner) return;
      setIsSaving(true);
      const changes = { firstName: firstName.trim(), lastName: lastName.trim(), phoneNumber: phone.trim(), address: address.trim(), creditLimit: limit, isFiscalCustomer, rnc:isFiscalCustomer?customerRnc.replace(/\D/g,''):'', legalName:isFiscalCustomer?customerLegalName.trim():'', updatedAt: now };
      try {
        await updateDoc(doc(db, "colmados", colmadoId, "customers", selectedCustomer.id), changes);
        setSelectedCustomer({ ...selectedCustomer, ...changes });
        toast({ title: "Perfil actualizado" });
        setIsEditDialogOpen(false);
        setMasterKeyInput("");
      } catch (error) {
        toast({ variant: "destructive", title: "No se pudo actualizar el cliente", description: error instanceof Error ? error.message : "Inténtalo nuevamente." });
      } finally { setIsSaving(false); }
    } else if (!selectedCustomer) {
      setIsSaving(true);
      const customerId = `cust_${Date.now()}`;
      const debtVal = Number(initialDebt) || 0;
      
      const customerData = {
        id: customerId,
        colmadoId,
        firstName,
        lastName,
        phoneNumber: phone,
        address,
        creditLimit: Number(creditLimit),
        currentDebt: debtVal,
        isFiscalCustomer,
        rnc:isFiscalCustomer?customerRnc.replace(/\D/g,''):'',
        legalName:isFiscalCustomer?customerLegalName.trim():'',
        createdAt: now,
        updatedAt: now,
      };

      setDocumentNonBlocking(doc(db, "colmados", colmadoId, "customers", customerId), customerData, { merge: true });
      
      if (debtVal > 0) {
        const txnId = `txn_mig_${Date.now()}`;
        setDocumentNonBlocking(doc(db, "colmados", colmadoId, "transactions", txnId), {
          id: txnId,
          colmadoId,
          transactionType: "DebtMigration",
          customerId: customerId,
          customerName: `${firstName} ${lastName}`,
          userId: user?.uid,
          totalAmount: debtVal,
          fiadoAmount: debtVal,
          description: "Saldo inicial sistema anterior",
          isComplete: true,
          createdAt: now,
          cashRegisterSessionId: "active_session",
        }, { merge: true });
      }

      toast({ title: "Cliente Registrado" });
      setIsNewCustomerDialogOpen(false);
      setIsSaving(false);
      setMasterKeyInput("");
    }
  };

  const handleRegisterPayment = async () => {
    if (!profile?.colmadoId || !selectedCustomer || !paymentAmount) return;
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    const oldDebt = selectedCustomer.currentDebt || 0;

    if (paymentMethod === 'Cash' && amount > oldDebt) {
      toast({ 
        variant: "destructive", 
        title: "Abono Excedido", 
        description: `En efectivo solo puedes abonar hasta el total de la deuda (RD$${oldDebt.toLocaleString()}).` 
      });
      return;
    }

    setIsProcessingPayment(true);
    const colmadoId = profile.colmadoId;
    const now = new Date().toISOString();
    
    const newDebt = oldDebt - amount;

    try {
      updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "customers", selectedCustomer.id), {
        currentDebt: newDebt,
        updatedAt: now
      });

      const txnId = `txn_pay_${Date.now()}`;
      const txnData = {
        id: txnId,
        colmadoId,
        transactionType: "FiadoPayment",
        customerId: selectedCustomer.id,
        customerName: `${selectedCustomer.firstName} ${selectedCustomer.lastName}`,
        userId: user?.uid,
        cashierName: profile?.firstName || "Cajero",
        totalAmount: -amount,
        paymentMethod: paymentMethod === 'Card' ? 'Tarjeta' : 'Efectivo',
        paymentRef: paymentMethod === 'Card' ? paymentRef : '',
        paidAmount: amount,
        changeGiven: 0,
        isComplete: true,
        createdAt: now,
        cashRegisterSessionId: "active_session",
      };

      setDocumentNonBlocking(doc(db, "colmados", colmadoId, "transactions", txnId), txnData, { merge: true });

      setLastPaymentInfo({
        ...txnData,
        oldDebt,
        newDebt,
        method: paymentMethod === 'Card' ? 'Tarjeta' : 'Efectivo',
        date: now
      });

      toast({ 
        title: "Abono Registrado", 
        description: newDebt < 0 
          ? `Monto: RD$${amount.toLocaleString()}. El cliente tiene RD$${Math.abs(newDebt).toLocaleString()} a favor.`
          : `Monto: RD$${amount.toLocaleString()} vía ${paymentMethod === 'Card' ? 'Tarjeta' : 'Efectivo'}` 
      });

      setPaymentAmount("");
      setPaymentRef("");
      setPaymentMethod("Cash");
      setIsPaymentDialogOpen(false);
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleApplyMigration = async () => {
    if (!profile?.colmadoId || !selectedCustomer || !migrationAmount) return;
    const amount = Number(migrationAmount);
    if (isNaN(amount) || amount <= 0) return;

    setIsProcessingMigration(true);
    const colmadoId = profile.colmadoId;
    const now = new Date().toISOString();

    try {
      updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "customers", selectedCustomer.id), {
        currentDebt: increment(amount),
        updatedAt: now
      });

      const txnId = `txn_mig_${Date.now()}`;
      setDocumentNonBlocking(doc(db, "colmados", colmadoId, "transactions", txnId), {
        id: txnId,
        colmadoId,
        transactionType: "DebtMigration",
        customerId: selectedCustomer.id,
        customerName: `${selectedCustomer.firstName} ${selectedCustomer.lastName}`,
        userId: user?.uid,
        totalAmount: amount,
        fiadoAmount: amount,
        description: migrationReason || "Migración de saldo",
        isComplete: true,
        createdAt: now,
        cashRegisterSessionId: "active_session",
      }, { merge: true });

      toast({ title: "Saldo Migrado", description: `Se añadieron RD$${amount.toLocaleString()} a la cuenta.` });
      setMigrationAmount("");
      setIsMigrationDialogOpen(false);
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setIsProcessingMigration(false);
    }
  };

  const handleTriggerReprint = async (tx: any) => {
    if (!profile?.colmadoId || !colmado) return;
    
    try {
      // Intentar cargar items si es una venta
      if (tx.transactionType === 'Sale' || tx.transactionType === 'OrderDelivery') {
        const itemsSnap = await getDocs(collection(db, "colmados", profile.colmadoId, "transactions", tx.id, "items"));
        const items: any[] = [];
        itemsSnap.forEach(d => items.push(d.data()));
        setItemsForReprint(items.length > 0 ? items : (tx.items || []));
      } else {
        setItemsForReprint([]);
      }

      setTxForReprint({
        ...tx,
        colmadoName: colmado.name,
        colmadoAddress: colmado.address,
        currentDebt: selectedCustomer?.id ? (await getDoc(doc(db, 'colmados', profile.colmadoId, 'customers', selectedCustomer.id))).data()?.currentDebt : null
      });

      // SOLICITUD REMOTA (KIOSKO)
      if (colmado.allowRemotePrinting !== false) {
        const printRequestId = `pr_cust_${tx.id}_${Date.now()}`;
        const now = new Date().toISOString();
        setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "printRequests", printRequestId), {
          id: printRequestId,
          colmadoId: profile.colmadoId,
          type: "sale",
          docId: tx.id,
          status: "pending",
          createdAt: now
        }, { merge: true });
        toast({ title: "REIMPRESIÓN ENVIADA", description: "Se ha solicitado la impresión en la caja física." });
      }

      setTimeout(() => {
        if (colmado.allowLocalPdf !== false) {
          window.print();
        }
        setTxForReprint(null);
        setItemsForReprint([]);
      }, 1000);
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los detalles del ticket." });
    }
  };

  const handleGenerateGlobalReport = () => {
    if (!customers || !colmado) return;
    const debtors = customers
      .filter(c => (c.currentDebt || 0) > 0)
      .sort((a, b) => (b.currentDebt || 0) - (a.currentDebt || 0));

    if (debtors.length === 0) {
      toast({ title: "Sin Deudas", description: "No hay clientes con balance pendiente." });
      return;
    }

    // Calcular datos para el gráfico circular simplificado (Top 5 + Otros)
    const top5 = debtors.slice(0, 5);
    const others = debtors.slice(5);
    const othersTotal = others.reduce((sum, c) => sum + (c.currentDebt || 0), 0);
    
    const chartData = top5.map(c => ({
      name: c.firstName,
      value: c.currentDebt || 0
    }));
    
    if (othersTotal > 0) {
      chartData.push({ name: "Otros", value: othersTotal });
    }

    setDebtsReportForPrint({
      colmadoName: colmado.name,
      colmadoAddress: colmado.address,
      colmadoLogo: colmado.logoUrl,
      date: new Date().toLocaleString(),
      totalToCollect: totalDebt,
      customers: debtors,
      chartData: chartData
    });

    setTimeout(() => {
      window.print();
      setDebtsReportForPrint(null);
    }, 800);
  };

  const handleGenerateCustomerStatement = async () => {
    if (!selectedCustomer || !profile?.colmadoId || !colmado) return;
    
    try {
      const freshCustomer = await getDoc(doc(db, 'colmados', profile.colmadoId, 'customers', selectedCustomer.id));
      const movements = await loadStatementMovements();
      
      setCustomerStatementForPrint({
        customer: { ...selectedCustomer, ...(freshCustomer.exists() ? freshCustomer.data() : {}) },
        colmadoName: colmado.name,
        colmadoAddress: colmado.address,
        colmadoLogo: colmado.logoUrl,
        date: new Date().toLocaleString(),
        movements
      });

      setTimeout(() => {
        window.print();
        setCustomerStatementForPrint(null);
      }, 800);
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo generar el estado de cuenta." });
    }
  };

  const loadStatementMovements = async () => {
    if (!selectedCustomer || !profile?.colmadoId) return [];
    const snapshot = await getDocs(query(collection(db, 'colmados', profile.colmadoId, 'transactions'),
      where('customerId', '==', selectedCustomer.id)));
    const transactions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .filter(creditMovement)
      .sort((a: any, b: any) => (customerDate(a.createdAt)?.getTime() || 0) - (customerDate(b.createdAt)?.getTime() || 0));
    return Promise.all(transactions.map(async (tx: any) => {
      let items = Array.isArray(tx.items) ? tx.items : [];
      if (!items.length && tx.transactionType !== 'FiadoPayment' && tx.transactionType !== 'DebtMigration') {
        const itemSnap = await getDocs(collection(db, 'colmados', profile.colmadoId, 'transactions', tx.id, 'items'));
        items = itemSnap.docs.map(item => item.data());
      }
      const isPayment = tx.transactionType === 'FiadoPayment';
      const amount = Math.abs(Number(isPayment ? tx.totalAmount : (tx.fiadoAmount || tx.totalAmount)) || 0);
      return {
        id: tx.id, date: customerDate(tx.createdAt)?.toLocaleDateString('es-DO') || '-',
        description: isPayment ? 'Abono recibido' : tx.transactionType === 'DebtMigration' ? 'Saldo anterior' : 'Compra a crédito',
        charge: isPayment ? 0 : amount, payment: isPayment ? amount : 0,
        items: items.map((item: any) => ({
          name: String(item.productName || item.name || 'Artículo'), quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice ?? item.price) || 0,
          total: Number(item.lineTotal ?? item.amountInDop ?? ((Number(item.unitPrice ?? item.price) || 0) * (Number(item.quantity) || 0))) || 0
        }))
      };
    }));
  };

  const handleDownloadCustomerStatement = async () => {
    if (!selectedCustomer || !profile?.colmadoId || !colmado || isGeneratingStatementPdf) return;
    setIsGeneratingStatementPdf(true);
    try {
      const freshCustomer = await getDoc(doc(db, 'colmados', profile.colmadoId, 'customers', selectedCustomer.id));
      const customer = freshCustomer.exists() ? freshCustomer.data() : selectedCustomer;
      const movements = await loadStatementMovements();
      const logo = colmado.logoUrl ? await loadStatementLogo(colmado.logoUrl) : undefined;
      const pdf = createCustomerStatementPdf({
        businessName: colmado.name || 'Colmado', businessAddress: colmado.address || '',
        customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        customerPhone: customer.phoneNumber || '', customerAddress: customer.address || '',
        balance: Number(customer.currentDebt) || 0, issuedAt: new Date().toLocaleString('es-DO'), movements, logo
      });
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = `estado-cuenta-${String(selectedCustomer.firstName || 'cliente').normalize('NFKD').replace(/[^a-zA-Z0-9-]/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast({ title: 'Estado de cuenta descargado' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo generar el PDF', description: error instanceof Error ? error.message : '' });
    } finally { setIsGeneratingStatementPdf(false); }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 pb-20 print:p-0">
      <style jsx global>{`
        @media print {
          @page { size: ${txForReprint ? (colmado?.printerPaperWidth === '58mm' ? '58mm' : '80mm') + ' auto' : 'A4'}; margin: ${txForReprint ? '0' : '15mm'}; }
          body * { visibility: hidden !important; background: none !important; }
          .receipt-print-area, .fiado-reprint-area, .debts-global-report, .customer-statement-report,
          .receipt-print-area *, .fiado-reprint-area *, .debts-global-report *, .customer-statement-report * { 
            visibility: visible !important; 
          }
          .receipt-print-area, .fiado-reprint-area {
            display: block !important;
            position: absolute !important;
            left: 0 !important; top: 0 !important; width: ${colmado?.printerPaperWidth === '58mm' ? '52mm' : '74mm'} !important;
            padding: 2mm !important; font-family: 'Courier New', monospace !important;
            background: white !important; color: black !important;
            margin: 0 auto !important; height: auto !important; overflow: visible !important;
            z-index: 9999999 !important;
          }
          .debts-global-report, .customer-statement-report {
            display: block !important;
            position: relative !important;
            width: 100% !important;
            padding: 10mm !important;
            box-sizing: border-box !important;
            background: white !important;
            color: black !important;
            z-index: 9999 !important;
            overflow: visible !important;
          }
          .customer-statement-report .statement-movement { break-inside: avoid; page-break-inside: avoid; }
          .customer-statement-report { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      {txForReprint && <div className="fiado-reprint-area hidden text-black">
        {(txForReprint.transactionType === 'Sale' && (Number(txForReprint.fiadoAmount || 0) > 0 || txForReprint.paymentMethod === 'Fiado') ? [1, 2] : [1]).map(copy =>
          <div key={copy} className={copy === 2 ? 'pt-8 mt-8 border-t-2 border-dashed border-black' : ''}>
            <div className="text-center mb-5"><h2 className="text-xl font-black uppercase">{txForReprint.colmadoName}</h2><p className="text-xs">{txForReprint.colmadoAddress}</p><p className="text-xs font-bold mt-2">{txForReprint.transactionType === 'FiadoPayment' ? 'RECIBO DE ABONO' : 'REIMPRESIÓN DE FACTURA'}</p><p className="text-[10px]">{copy === 1 ? 'CLIENTE' : 'NEGOCIO'} · {customerDate(txForReprint.createdAt)?.toLocaleString('es-DO') || '-'}</p></div>
            <div className="text-xs border-y border-dashed border-black py-2 space-y-1"><p>Factura: {txForReprint.id}</p><p>Cliente: {txForReprint.customerName || `${selectedCustomer?.firstName || ''} ${selectedCustomer?.lastName || ''}`}</p><p>Tel: {selectedCustomer?.phoneNumber || '-'}</p></div>
            {!!itemsForReprint.length && <div className="my-3 text-xs"><div className="flex justify-between font-black border-b border-black pb-1"><span>ARTÍCULO</span><span>TOTAL</span></div>{itemsForReprint.map((item, index) => <div key={item.id || index} className="flex justify-between gap-2 py-1 border-b border-dashed border-black/30"><span className="min-w-0 break-words">{item.productName || item.name} · {Number(item.quantity || 0).toLocaleString()} x RD${Number(item.unitPrice ?? item.price ?? 0).toLocaleString()}</span><span className="shrink-0">RD${Number(item.lineTotal ?? item.amountInDop ?? ((Number(item.unitPrice ?? item.price) || 0) * (Number(item.quantity) || 0))).toLocaleString()}</span></div>)}</div>}
            {txForReprint.transactionType === 'FiadoPayment' ? <div className="mt-3 text-sm font-black flex justify-between"><span>ABONO RECIBIDO</span><span>RD${Math.abs(Number(txForReprint.totalAmount || 0)).toLocaleString()}</span></div> : <div className="mt-3 text-xs space-y-1">{Number(txForReprint.discountAmount || 0) > 0 && <div className="flex justify-between"><span>Descuento</span><span>-RD${Number(txForReprint.discountAmount).toLocaleString()}</span></div>}<div className="flex justify-between font-black text-base border-t border-black pt-2"><span>TOTAL FACTURA</span><span>RD${Number(txForReprint.totalAmount || 0).toLocaleString()}</span></div>{Number(txForReprint.fiadoAmount || 0) > 0 && <div className="flex justify-between font-black"><span>CARGO A CRÉDITO</span><span>RD${Number(txForReprint.fiadoAmount).toLocaleString()}</span></div>}</div>}
            <p className="mt-3 text-xs font-black text-center">DEUDA ACTUAL: RD${Number(txForReprint.currentDebt ?? selectedCustomer?.currentDebt ?? 0).toLocaleString()}</p><p className="mt-5 text-[10px] text-center">Gracias por su preferencia</p>
          </div>)}
      </div>}

      {/* REPORTE GLOBAL DE DEUDAS A4 CON GRÁFICO */}
      {debtsReportForPrint && (
        <div className="debts-global-report hidden">
          <div className="flex items-center justify-between mb-12 border-b-8 border-primary pb-10">
            <div className="flex items-center gap-8 text-left">
               {debtsReportForPrint.colmadoLogo && (
                 <div className="h-32 w-32 relative rounded-3xl overflow-hidden border-4 border-primary/20 shadow-xl shrink-0">
                   <Image src={debtsReportForPrint.colmadoLogo} alt="Logo" fill className="object-cover" unoptimized />
                 </div>
               )}
               <div className="flex-1 min-w-0">
                  <h1 className="text-5xl font-black uppercase text-primary leading-[0.9] break-words">{debtsReportForPrint.colmadoName}</h1>
                  <p className="text-xl font-bold text-muted-foreground mt-3">{debtsReportForPrint.colmadoAddress}</p>
               </div>
            </div>
            <div className="text-right shrink-0 ml-6">
              <div className="bg-primary text-white px-10 py-4 rounded-[2rem] shadow-2xl">
                <h2 className="text-2xl font-black uppercase tracking-widest leading-none">REPORTE DE CARTERA</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-4 uppercase font-black tracking-widest">Emisión: {mounted ? debtsReportForPrint.date : ''}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 mb-12 items-center">
             <div className="p-10 border-4 border-primary rounded-[3rem] bg-primary text-white text-center shadow-2xl">
                <p className="text-xs font-black uppercase tracking-widest opacity-60">Capital Total por Cobrar</p>
                <h2 className="text-6xl font-black mt-2">RD${debtsReportForPrint.totalToCollect.toLocaleString()}</h2>
                <p className="text-sm mt-4 font-bold opacity-70 uppercase">{debtsReportForPrint.customers.length} Clientes con Deuda</p>
             </div>
             
             <div className="flex flex-col items-center justify-center p-4">
                <p className="text-xs font-black uppercase mb-6 text-center text-primary tracking-widest">Distribución de Deuda (%)</p>
                <div className="relative w-56 h-56">
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    {(() => {
                      let accumulatedPercent = 0;
                      return debtsReportForPrint.chartData.map((slice: any, idx: number) => {
                        const percent = (slice.value / debtsReportForPrint.totalToCollect) * 100;
                        const dashArray = `${percent} ${100 - percent}`;
                        const offset = 100 - accumulatedPercent + 25;
                        accumulatedPercent += percent;
                        const colors = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];
                        return (
                          <circle
                            key={idx}
                            cx="18" cy="18" r="16"
                            fill="transparent"
                            stroke={colors[idx % colors.length]}
                            strokeWidth="3.5"
                            strokeDasharray={dashArray}
                            strokeDashoffset={offset}
                          />
                        );
                      });
                    })()}
                  </svg>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2">
                   {debtsReportForPrint.chartData.map((slice: any, idx: number) => (
                     <div key={idx} className="flex items-center gap-2 text-[10px] font-bold uppercase">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'][idx % 6] }} />
                        <span>{slice.name}: {((slice.value / debtsReportForPrint.totalToCollect) * 100).toFixed(1)}%</span>
                     </div>
                   ))}
                </div>
             </div>
          </div>

          <h3 className="text-2xl font-black uppercase border-b-4 border-primary/20 mb-6 text-primary tracking-tight">Listado Detallado (Orden: Mayor Deuda)</h3>
          <table className="w-full border-collapse text-xs">
            <thead><tr className="bg-primary text-white"><th className="p-3 text-left">CLIENTE</th><th className="p-3 text-left">TELÉFONO</th><th className="p-3 text-right">DEUDA</th></tr></thead>
            <tbody>{debtsReportForPrint.customers.map((customer: any) => <tr key={customer.id} className="border-b border-primary/10"><td className="p-3 font-bold">{customer.firstName} {customer.lastName}</td><td className="p-3">{customer.phoneNumber || '-'}</td><td className="p-3 text-right font-black">RD${Number(customer.currentDebt || 0).toLocaleString()}</td></tr>)}</tbody>
          </table>
          <div className="text-center mt-20 opacity-30 text-[9px] uppercase tracking-widest font-black text-primary">GENERADO POR COLMADOM CLOUD &copy; 2026</div>
        </div>
      )}

      {/* ESTADO DE CUENTA INDIVIDUAL A4 */}
      {customerStatementForPrint && (
        <div className="customer-statement-report hidden">
          <div className="flex items-start justify-between gap-6 mb-8 border-b-2 border-primary pb-5">
            <div className="flex items-center gap-4 text-left">
               <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-black uppercase text-primary break-words">{customerStatementForPrint.colmadoName}</h1>
                  <p className="text-xs mt-1">{customerStatementForPrint.colmadoAddress}</p>
               </div>
            </div>
            <div className="text-right shrink-0 ml-6">
              {customerStatementForPrint.colmadoLogo && <div className="w-20 h-20 relative ml-auto"><Image src={customerStatementForPrint.colmadoLogo} alt="Logo del colmado" fill className="object-contain" unoptimized /></div>}
              <p className="text-xs mt-2">Emisión: {customerStatementForPrint.date}</p>
            </div>
          </div>

          <h2 className="text-xl font-black text-primary mb-4">ESTADO DE CUENTA DE FIAO</h2>
          <div className="mb-6 grid grid-cols-2 gap-6 bg-primary/5 p-5 rounded-lg border border-primary/10">
            <div>
              <p className="text-xs font-black uppercase text-primary/60 mb-2 tracking-widest">Información del Cliente:</p>
              <h3 className="text-lg font-black uppercase text-primary">{customerStatementForPrint.customer.firstName} {customerStatementForPrint.customer.lastName}</h3>
              <p className="text-sm font-bold">{customerStatementForPrint.customer.phoneNumber}</p>
              <p className="text-sm uppercase font-bold opacity-60 mt-1">{customerStatementForPrint.customer.address}</p>
            </div>
            <div className="text-right flex flex-col justify-center">
              <p className="text-xs font-black uppercase text-primary/60 mb-2 tracking-widest">Balance Pendiente Actual:</p>
              <h2 className="text-2xl font-black text-primary">RD${(customerStatementForPrint.customer.currentDebt || 0).toLocaleString()}</h2>
            </div>
          </div>

          <h4 className="text-2xl font-black uppercase border-b-4 border-primary/20 mb-6 text-primary tracking-tight">Movimientos de la Cuenta</h4>
          <div className="grid grid-cols-3 gap-2 bg-primary/10 rounded-lg p-4 mb-5 text-xs">
            <p><strong>Compras</strong><br />RD${customerStatementForPrint.movements.reduce((sum: number, tx: any) => sum + tx.charge, 0).toLocaleString()}</p>
            <p><strong>Abonos</strong><br />RD${customerStatementForPrint.movements.reduce((sum: number, tx: any) => sum + tx.payment, 0).toLocaleString()}</p>
            <p className="font-black text-primary"><strong>Deuda total</strong><br />RD${Number(customerStatementForPrint.customer.currentDebt || 0).toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 items-start">
            {customerStatementForPrint.movements.map((tx: any, index: number) => (
              <section key={tx.id} className="statement-movement border border-slate-300 rounded-md overflow-hidden text-xs">
                <div className={cn("flex justify-between gap-4 px-3 py-2 font-black", tx.payment ? "bg-emerald-100 text-emerald-900" : "bg-primary/10 text-primary")}>
                  <span>{index + 1}. {tx.payment ? 'ABONO' : tx.description.toUpperCase()}</span><span>{tx.date}</span>
                </div>
                <div className="px-3 py-2">
                  <p className="text-[10px] mb-1">Factura / referencia: {tx.id}</p>
                  {tx.items.map((item: any, itemIndex: number) => <p key={itemIndex} className="flex justify-between gap-3 py-0.5"><span>{item.quantity} × {item.name} · RD${item.unitPrice.toLocaleString()} c/u</span><span>RD${item.total.toLocaleString()}</span></p>)}
                  <p className="text-right font-black border-t border-slate-200 mt-2 pt-1">{tx.payment ? 'TOTAL ABONADO' : 'TOTAL DE LA FACTURA A CRÉDITO'}: RD${(tx.payment || tx.charge).toLocaleString()}</p>
                </div>
              </section>
            ))}
          </div>
          <p className="mt-7 pt-3 border-t-2 border-primary font-black text-right text-primary">DEUDA TOTAL PENDIENTE: RD${Number(customerStatementForPrint.customer.currentDebt || 0).toLocaleString()}</p>

        </div>
      )}

      {/* UI PRINCIPAL (NO PRINT) */}
      <header className="flex flex-col md:items-center md:flex-row justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
            <UsersIcon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight text-primary uppercase">Libretas de Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1 font-bold">Gestión de fiados y recuperación de capital.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2 border-accent text-accent font-black h-12 rounded-xl shadow-sm" onClick={handleGenerateGlobalReport} disabled={!customers?.length}>
            <PieChartIcon className="h-5 w-5" /> Reporte de Cartera (A4)
          </Button>

          <Button size="lg" className="gap-2 bg-primary font-black shadow-lg h-12 rounded-xl" onClick={handleOpenCreate}>
            <UserPlus className="h-5 w-5" /> Nuevo Cliente
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 no-print">
        <Card className="md:col-span-2 bg-primary text-white border-none shadow-xl overflow-hidden relative group rounded-[2rem]">
          <div className="absolute right-[-10px] top-[-10px] opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-500">
            <Receipt className="h-32 w-32" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest opacity-80 text-white">Cartera Total por Cobrar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">RD${totalDebt?.toLocaleString()}</div>
            <p className="text-[10px] mt-2 opacity-70 font-bold uppercase">Capital pendiente en el barrio</p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card rounded-[2rem] border-none shadow-2xl overflow-hidden no-print bg-white">
        <div className="p-6 border-b bg-muted/10">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-primary/40" />
            <Input
              placeholder="Buscar cliente por nombre o teléfono..."
              className="pl-12 h-14 bg-white rounded-2xl font-black text-lg border-none shadow-inner"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-black h-16 px-8 text-primary uppercase text-[11px]">Identidad / Dirección</TableHead>
                <TableHead className="font-black h-16 text-primary uppercase text-[11px]">Contacto</TableHead>
                <TableHead className="font-black h-16 text-primary uppercase text-[11px]">Balance adeudado</TableHead>
                <TableHead className="font-black h-16 text-primary uppercase text-[11px]">Uso de Crédito</TableHead>
                <TableHead className="text-right font-black h-16 px-8 text-primary uppercase text-[11px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-32"><Loader2 className="animate-spin mx-auto h-12 w-12 text-primary opacity-20" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-32 text-muted-foreground font-black italic opacity-30">No se encontraron clientes.</TableCell></TableRow>
              ) : filtered.map((customer) => {
                const isCreditInFavor = (customer.currentDebt || 0) < 0;
                const usagePercent = isCreditInFavor ? 0 : Math.min(100, ((customer.currentDebt || 0) / (customer.creditLimit || 1)) * 100);
                
                return (
                  <TableRow key={customer.id} className="hover:bg-muted/20 transition-colors h-24">
                    <TableCell className="px-8">
                      <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center font-black text-white shadow-sm ${isCreditInFavor ? 'bg-blue-500' : customer.currentDebt > 0 ? 'bg-destructive' : 'bg-emerald-500'}`}>
                          {customer.firstName[0]}
                        </div>
                        <div>
                          <p className="font-black text-primary text-md uppercase leading-none">{customer.firstName} {customer.lastName}</p>
                          <p className="text-[10px] text-muted-foreground font-bold mt-1 uppercase truncate max-w-[180px]">{customer.address || "Sin dirección registrada"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-primary/60">{customer.phoneNumber}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <p className={`text-xl font-black ${isCreditInFavor ? "text-blue-600" : (customer.currentDebt || 0) > 0 ? "text-destructive" : "text-emerald-600"}`}>
                          RD${Math.abs(customer.currentDebt || 0).toLocaleString()}
                        </p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase">
                          {isCreditInFavor ? "Saldo a Favor" : "Balance de Deuda"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[150px]">
                      <div className="space-y-1">
                        <Progress value={usagePercent} className={`h-2 ${usagePercent > 85 ? '[&>div]:bg-destructive' : ''}`} />
                        <div className="flex justify-between items-center mt-1">
                           <p className="text-[9px] font-black text-muted-foreground uppercase">Límite: RD${customer.creditLimit?.toLocaleString()}</p>
                           {usagePercent >= 100 && <Badge className="bg-destructive text-white border-none text-[7px] h-3.5 mt-1 font-black">SIN CUPO</Badge>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right px-8">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="font-black rounded-xl h-10 border-2 gap-2" onClick={() => handleOpenDetails(customer)}>
                          <Eye className="h-4 w-4" /> Detalle
                        </Button>
                        {isOwner && <Button variant="outline" size="sm" className="font-black rounded-xl h-10 border-2 gap-2" onClick={() => handleOpenEdit(customer)}><Edit className="h-4 w-4" /> Editar</Button>}
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => handleDeleteRequest(customer)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* New Customer Dialog */}
      <Dialog open={isNewCustomerDialogOpen} onOpenChange={setIsNewCustomerDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black text-primary uppercase tracking-tight">Vincular a Libreta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase text-muted-foreground">Nombre</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-12 rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase text-muted-foreground">Apellido</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-12 rounded-xl font-bold" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase text-muted-foreground">Teléfono de Contacto</Label>
              <Input placeholder="809..." value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12 rounded-xl font-black text-lg" />
            </div>
            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase text-muted-foreground">Dirección Exacta</Label>
              <Input placeholder="Calle, Sector, Referencias..." value={address} onChange={(e) => setAddress(e.target.value)} className="h-12 rounded-xl font-bold" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase text-muted-foreground">Límite de Crédito (RD$)</Label>
                <Input type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} className="h-12 rounded-xl font-black text-primary" />
              </div>
              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase text-destructive tracking-widest">Saldo Anterior (RD$)</Label>
                <Input type="number" value={initialDebt} onChange={(e) => setInitialDebt(e.target.value)} className="h-12 rounded-xl font-black text-destructive border-destructive/20" />
              </div>
            </div>
            
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3"><label className="flex items-center gap-3 font-black text-blue-900"><input type="checkbox" checked={isFiscalCustomer} onChange={e=>setIsFiscalCustomer(e.target.checked)}/> Cliente fiao fiscal</label>{isFiscalCustomer&&<div className="grid gap-3"><div><Label>RNC o cédula fiscal</Label><Input inputMode="numeric" value={customerRnc} onChange={e=>setCustomerRnc(e.target.value.replace(/\D/g,'').slice(0,11))} placeholder="RNC de 9 u 11 dígitos"/></div><div><Label>Nombre o razón social</Label><Input value={customerLegalName} onChange={e=>setCustomerLegalName(e.target.value)} placeholder="Nombre registrado en DGII"/></div><p className="text-xs text-blue-800">Sus compras fiscales utilizarán el RNC y el QR electrónico devuelto por DGII/mSeller.</p></div>}</div>

            <Separator />
            
            <div className="space-y-2 p-4 bg-primary/5 rounded-2xl border-2 border-primary/10">
               <Label className="font-black text-xs uppercase tracking-widest text-primary flex items-center gap-2">
                 <Lock className="h-3 w-3" /> Llave Maestra Requerida
               </Label>
               <Input 
                type="password" 
                placeholder="••••••••" 
                className="h-14 text-2xl font-black text-center border-2 focus:border-primary rounded-xl mt-2" 
                value={masterKeyInput}
                onChange={(e) => setMasterKeyInput(e.target.value)}
               />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveCustomer} className="w-full h-16 text-xl font-black rounded-2xl shadow-xl shadow-primary/20" disabled={isSaving || !masterKeyInput}>
              {isSaving ? <Loader2 className="animate-spin" /> : "Finalizar Registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar datos del cliente sin modificar su deuda ni su historial. */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setMasterKeyInput(""); }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-primary">Editar cliente fiado</DialogTitle>
            <DialogDescription>Actualiza el perfil del cliente. Para guardar, confirma la clave maestra del colmado.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="edit-customer-first">Nombre</Label><Input id="edit-customer-first" value={firstName} onChange={event => setFirstName(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="edit-customer-last">Apellido</Label><Input id="edit-customer-last" value={lastName} onChange={event => setLastName(event.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label htmlFor="edit-customer-phone">Teléfono</Label><Input id="edit-customer-phone" type="tel" value={phone} onChange={event => setPhone(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="edit-customer-address">Dirección</Label><Input id="edit-customer-address" value={address} onChange={event => setAddress(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="edit-customer-limit">Límite de crédito (RD$)</Label><Input id="edit-customer-limit" type="number" min="0" step="0.01" value={creditLimit} onChange={event => setCreditLimit(event.target.value)} /></div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-3"><label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={isFiscalCustomer} onChange={e=>setIsFiscalCustomer(e.target.checked)}/> Cliente fiao fiscal</label>{isFiscalCustomer&&<><div><Label>RNC o cédula</Label><Input value={customerRnc} onChange={e=>setCustomerRnc(e.target.value.replace(/\D/g,'').slice(0,11))}/></div><div><Label>Razón social</Label><Input value={customerLegalName} onChange={e=>setCustomerLegalName(e.target.value)}/></div></>}</div>
            <div className="space-y-1 rounded-xl border border-primary/20 bg-primary/5 p-4"><Label htmlFor="edit-customer-key" className="flex items-center gap-2 font-bold"><Lock className="h-4 w-4" /> Clave maestra</Label><Input id="edit-customer-key" type="password" autoComplete="off" value={masterKeyInput} onChange={event => setMasterKeyInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void handleSaveCustomer(); }} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button><Button onClick={handleSaveCustomer} disabled={isSaving || !masterKeyInput}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar cambios'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details & History Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-8 bg-primary text-white">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center font-black text-3xl shadow-inner uppercase">
                  {selectedCustomer?.firstName?.[0]}
                </div>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight">{selectedCustomer?.firstName} {selectedCustomer?.lastName}</DialogTitle>
                  <p className="text-white/70 font-bold mt-1 flex items-center gap-1.5 uppercase text-[10px]"><MapPin className="h-3 w-3" /> {selectedCustomer?.address}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button className="bg-white text-primary hover:bg-white/90 font-black h-10 gap-2" onClick={handleDownloadCustomerStatement} disabled={isGeneratingStatementPdf}>
                  {isGeneratingStatementPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descargar estado de cuenta PDF
                </Button>
                <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20 font-black h-10 gap-2" onClick={handleGenerateCustomerStatement}>
                  <Printer className="h-4 w-4" /> Imprimir estado de cuenta (A4)
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="p-8 space-y-8">
            <div className="grid grid-cols-2 gap-4">
              <div className={cn(
                "p-6 rounded-[1.5rem] border-2 relative overflow-hidden group shadow-sm",
                (selectedCustomer?.currentDebt || 0) < 0 ? "bg-emerald-50 border-emerald-100" : "bg-destructive/5 border-destructive/10"
              )}>
                <div className="absolute right-[-10px] top-[-10px] opacity-5 rotate-12 group-hover:scale-110 transition-transform"><Receipt className="h-20 w-20" /></div>
                <p className={cn(
                  "text-[10px] font-black uppercase tracking-widest",
                  (selectedCustomer?.currentDebt || 0) < 0 ? "text-emerald-600" : "text-destructive"
                )}>
                  {(selectedCustomer?.currentDebt || 0) < 0 ? 'Excedente a Favor' : 'Balance de Deuda'}
                </p>
                <p className={cn(
                  "text-3xl font-black mt-1",
                  (selectedCustomer?.currentDebt || 0) < 0 ? "text-emerald-600" : "text-destructive"
                )}>
                  RD${Math.abs(selectedCustomer?.currentDebt || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-6 bg-muted/30 rounded-[1.5rem] border-2 relative overflow-hidden group shadow-sm">
                <div className="absolute right-[-10px] top-[-10px] opacity-5 rotate-12 group-hover:scale-110 transition-transform"><CheckCircle2 className="h-20 w-20" /></div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Crédito Disponible</p>
                <p className="text-3xl font-black text-primary mt-1">RD${Math.max(0, (selectedCustomer?.creditLimit || 0) - Math.max(0, selectedCustomer?.currentDebt || 0)).toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-sm uppercase tracking-widest text-primary flex items-center gap-2">
                  <History className="h-4 w-4" /> Historial de Movimientos
                </h4>
                {isAdmin && (
                  <Button variant="ghost" className="text-[10px] font-black text-accent hover:bg-accent/5 h-8 gap-1" onClick={() => setIsMigrationDialogOpen(true)}>
                    <RefreshCw className="h-3 w-3" /> MIGRACIÓN DE SALDO
                  </Button>
                )}
              </div>
              <ScrollArea className="h-64 rounded-[1.5rem] border-2 border-primary/5 bg-muted/5">
                <div className="p-4">
                  {selectedCustomer?.id && profile?.colmadoId && (
                    <CustomerHistoryList 
                      customerId={selectedCustomer.id} 
                      colmadoId={profile.colmadoId} 
                      isAdmin={isAdmin}
                      onReprint={handleTriggerReprint}
                      onDeleteTx={(tx) => {
                        setSelectedTxToDelete(tx);
                        setMasterKeyInput("");
                        setIsDeleteTxAuthDialogOpen(true);
                      }}
                    />
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="p-8 bg-muted/10 border-t flex flex-row gap-4">
            <Button variant="outline" className="h-16 rounded-2xl font-black text-lg border-2" onClick={() => setIsDetailsDialogOpen(false)}>Cerrar</Button>
            {isOwner && <Button variant="outline" className="h-16 rounded-2xl font-black gap-2 border-2" onClick={() => { setIsDetailsDialogOpen(false); handleOpenEdit(selectedCustomer); }}><Edit className="h-4 w-4" /> Editar perfil</Button>}
            <Button 
              className="h-16 flex-[2] font-black bg-emerald-600 hover:bg-emerald-700 text-white text-xl rounded-2xl shadow-xl shadow-emerald-100"
              onClick={() => {
                setIsPaymentDialogOpen(true);
                setIsDetailsDialogOpen(false);
              }}
            >
              Registrar Abono
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auth Dialog for Transaction Deletion */}
      <Dialog open={isDeleteTxAuthDialogOpen} onOpenChange={(open) => { setIsDeleteTxAuthDialogOpen(open); if (!open) { setMasterKeyInput(""); setSelectedTxToDelete(null); } }}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <div className="h-16 w-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-destructive" />
            </div>
            <DialogTitle className="text-2xl font-black text-center text-primary uppercase">Eliminar Movimiento</DialogTitle>
            <DialogDescription className="text-center font-bold">
              Esta acción eliminará el registro y <strong>ajustará la deuda del cliente</strong> automáticamente.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6 space-y-6">
            <div className="p-4 bg-muted/20 rounded-2xl border text-center space-y-1">
               <p className="text-[10px] font-black uppercase text-muted-foreground">Movimiento a Eliminar:</p>
               <p className="text-sm font-black text-primary">{selectedTxToDelete?.transactionType === 'FiadoPayment' ? 'ABONO RECIBIDO' : 'CARGO A CUENTA'}</p>
               <p className="text-xl font-black text-destructive">RD${Math.abs(selectedTxToDelete?.fiadoAmount || selectedTxToDelete?.totalAmount || 0).toLocaleString()}</p>
            </div>

            <div className="space-y-2">
               <Label className="font-black text-xs uppercase tracking-widest text-primary text-center block">Ingresa Llave Maestra</Label>
               <Input 
                type="password" 
                placeholder="••••••••" 
                className="h-16 text-3xl font-black text-center border-2 border-destructive/20 rounded-2xl" 
                value={masterKeyInput}
                onChange={(e) => setMasterKeyInput(e.target.value)}
                autoFocus
               />
            </div>
          </div>

          <DialogFooter>
            <Button 
              className="w-full h-16 text-xl font-black bg-destructive rounded-2xl shadow-xl" 
              onClick={handleVerifyDeleteTxMasterKey}
              disabled={!masterKeyInput}
            >
              Borrar y Ajustar Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auth Dialog for Customer Deletion */}
      <Dialog open={isDeleteAuthDialogOpen} onOpenChange={(open) => { setIsDeleteAuthDialogOpen(open); if(!open) setMasterKeyInput(""); }}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <div className="h-16 w-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-destructive" />
            </div>
            <DialogTitle className="text-2xl font-black text-center text-primary uppercase">Eliminar Cliente</DialogTitle>
            <DialogDescription className="text-center font-bold">
              ¿Deseas borrar permanentemente la libreta de <strong>{selectedCustomer?.firstName} {selectedCustomer?.lastName}</strong>?
              <br/><br/>
              <span className="text-destructive font-black">Esta acción borrará todas sus deudas e historial.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4 text-center">
             <div className="space-y-2">
               <Label className="font-black text-xs uppercase tracking-widest text-primary text-center block">Ingresa Llave Maestra</Label>
               <Input 
                type="password" 
                placeholder="••••••••" 
                className="h-16 text-3xl font-black text-center border-2 border-destructive/20 focus:border-destructive rounded-2xl" 
                value={masterKeyInput}
                onChange={(e) => setMasterKeyInput(e.target.value)}
                autoFocus
               />
             </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-16 text-xl font-black bg-destructive rounded-2xl shadow-xl" onClick={handleVerifyDeleteMasterKey} disabled={!masterKeyInput}>Eliminar Permanentemente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <div className="h-16 w-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Banknote className="h-8 w-8 text-emerald-600" />
            </div>
            <DialogTitle className="text-2xl font-black text-center text-primary uppercase">Registrar Abono</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="Cash" className="w-full" onValueChange={setPaymentMethod}>
            <TabsList className="grid grid-cols-2 h-14 bg-muted/20 rounded-xl mb-6 p-1">
              <TabsTrigger value="Cash" className="font-black uppercase text-xs gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Banknote className="h-4 w-4" /> Efectivo
              </TabsTrigger>
              <TabsTrigger value="Card" className="font-black uppercase text-xs gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <CreditCard className="h-4 w-4" /> Tarjeta
              </TabsTrigger>
            </TabsList>
            
            <div className="py-2 space-y-6">
              <div className="space-y-2">
                <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground text-center block">Monto a Abonar (RD$)</Label>
                <Input 
                  type="number" 
                  className="h-20 text-5xl font-black text-center border-2 border-emerald-200 rounded-3xl" 
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  autoFocus
                />
              </div>

              {paymentMethod === 'Card' && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground">Referencia de Voucher</Label>
                  <Input 
                    placeholder="Código de transacción..." 
                    className="h-12 rounded-xl font-bold font-mono"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                  />
                </div>
              )}
            </div>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button 
              className="w-full h-16 text-xl font-black bg-emerald-600 rounded-2xl shadow-xl shadow-emerald-100" 
              onClick={handleRegisterPayment}
              disabled={!paymentAmount || isProcessingPayment}
            >
              {isProcessingPayment ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="mr-2 h-6 w-6" />}
              Confirmar Abono {paymentMethod === 'Card' ? 'Tarjeta' : 'Efectivo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Migration Dialog */}
      <Dialog open={isMigrationDialogOpen} onOpenChange={setIsMigrationDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <div className="h-16 w-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="h-8 w-8 text-accent" />
            </div>
            <DialogTitle className="text-2xl font-black text-center text-primary uppercase">Cargar Saldo Directo</DialogTitle>
            <DialogDescription className="text-center font-bold">Añade un balance pendiente de forma manual (Migración).</DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-6">
            <div className="space-y-2">
              <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground">Monto a Cargar (RD$)</Label>
              <Input 
                type="number" 
                className="h-16 text-3xl font-black text-center border-2 border-accent/20 focus:border-accent rounded-2xl" 
                value={migrationAmount}
                onChange={(e) => setMigrationAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase text-muted-foreground">Motivo / Concepto</Label>
              <Input 
                value={migrationReason}
                onChange={(e) => setMigrationReason(e.target.value)}
                className="h-12 rounded-xl font-bold"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              className="w-full h-16 text-xl font-black bg-accent rounded-2xl shadow-xl" 
              onClick={handleApplyMigration}
              disabled={!migrationAmount || isProcessingMigration}
            >
              {isProcessingMigration ? <Loader2 className="animate-spin" /> : "Aplicar Migración"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerHistoryList({ 
  customerId, 
  colmadoId, 
  isAdmin,
  onReprint,
  onDeleteTx
}: { 
  customerId: string; 
  colmadoId: string;
  isAdmin: boolean;
  onReprint: (tx: any) => void;
  onDeleteTx: (txn: any) => void;
}) {
  const db = useFirestore();
  const historyQuery = useMemoFirebase(() => {
    if (!customerId || !colmadoId) return null;
    return query(collection(db, "colmados", colmadoId, "transactions"), where("customerId", "==", customerId));
  }, [db, customerId, colmadoId]);

  const { data: rawHistory, isLoading } = useCollection(historyQuery);
  const sortedHistory = useMemo(() => rawHistory ? [...rawHistory].filter(creditMovement).sort((a, b) => (customerDate(b.createdAt)?.getTime() || 0) - (customerDate(a.createdAt)?.getTime() || 0)) : [], [rawHistory]);

  if (isLoading) return <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-primary opacity-20" /></div>;

  return (
    <div className="space-y-3">
      {sortedHistory.map((txn: any) => (
        <div key={txn.id} className="flex items-center justify-between p-4 rounded-2xl border-2 bg-white shadow-sm hover:border-primary/30 transition-colors group">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              txn.transactionType === 'FiadoPayment' ? 'bg-emerald-50 text-emerald-600' : 
              txn.transactionType === 'DebtMigration' ? 'bg-accent/10 text-accent' : 
              'bg-destructive/5 text-destructive'
            }`}>
              {txn.transactionType === 'FiadoPayment' ? (
                txn.paymentMethod === 'Tarjeta' ? <CreditCard className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />
              ) : 
               txn.transactionType === 'DebtMigration' ? <Database className="h-5 w-5" /> : 
               <Receipt className="h-5 w-5" />}
            </div>
            <div>
              <p className="font-black text-xs uppercase leading-none">
                {txn.transactionType === 'FiadoPayment' ? `Abono (${txn.paymentMethod || 'Efectivo'})` : 
                 txn.transactionType === 'DebtMigration' ? 'Carga Manual' : 
                 'Venta a Crédito'}
              </p>
              <p className="text-[9px] text-muted-foreground font-bold mt-1">{customerDate(txn.createdAt)?.toLocaleString('es-DO') || '-'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className={`font-black text-md ${txn.transactionType === 'FiadoPayment' ? "text-emerald-600" : "text-destructive"}`}>
              {txn.transactionType === 'FiadoPayment' ? '' : '+'} RD${Math.abs(txn.fiadoAmount || txn.totalAmount || 0).toLocaleString()}
            </p>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => onReprint(txn)}>
                <Printer className="h-4 w-4" />
              </Button>
              {isAdmin && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-destructive"
                  onClick={() => onDeleteTx(txn)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


