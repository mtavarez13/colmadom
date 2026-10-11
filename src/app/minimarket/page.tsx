"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  Plus, 
  Minus, 
  Trash2, 
  Loader2, 
  ShoppingCart,
  Banknote,
  Receipt,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Search,
  Scale,
  Printer,
  UserPlus,
  Zap,
  Coins,
  DollarSign,
  Barcode,
  RefreshCw,
  X,
  Package,
  ArrowRight,
  ImageIcon,
  TrendingDown,
  ArrowRightCircle,
  ChevronUp,
  Lock,
  Calculator,
  Check,
  Save,
  Wallet,
  Tag,
  LogOut
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase, useAuth } from "@/firebase";
import { doc, collection, increment, query, where, getDocs } from "firebase/firestore";
import { setDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { signOut } from "firebase/auth";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { parseVariableWeightBarcode } from "@/lib/barcode-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import Image from "next/image";
import { useWhatsAppPosNotifications } from "@/hooks/use-whatsapp-pos-notifications";
import { cn } from "@/lib/utils";
import { fiscalSnapshot } from "@/lib/dominican-fiscal";
import { FiscalReceiptFooter } from "@/components/fiscal-receipt-footer";
import { FiscalCustomerDialog } from "@/components/fiscal-customer-dialog";

export const dynamic = 'force-dynamic';

const DENOMINATIONS = [2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1];

export default function MiniMarketPage() {
  useWhatsAppPosNotifications();
  const { user } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [cart, setCart] = useState<any[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountInput, setDiscountInput] = useState('');
  const [discountKeyInput, setDiscountKeyInput] = useState('');
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCheckoutProcessing, setIsCheckoutProcessing] = useState(false);
  const [isFiscalCustomerOpen, setIsFiscalCustomerOpen] = useState(false);
  const [fiscalCustomer, setFiscalCustomer] = useState<any>(null);
  
  // Payment Dialogs
  const [isCashDialogOpen, setIsCashDialogOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState("");
  const [isCardDialogOpen, setIsCardDialogOpen] = useState(false);
  const [cardTxnNumber, setCardTxnNumber] = useState("");
  const [cardAmountInput, setCardAmountInput] = useState("");
  const [isFiadoDialogOpen, setIsFiadoDialogOpen] = useState(false);
  const [fiadoSearch, setFiadoSearch] = useState("");
  const [selectedFiadoCustomer, setSelectedFiadoCustomer] = useState<any>(null);

  // Partial Payment Chain State
  const [partialPayments, setPartialPayments] = useState<{
    cash: number;
    card: number;
    cardRef: string;
    fiado: number;
  }>({
    cash: 0,
    card: 0,
    cardRef: "",
    fiado: 0
  });

  // Expense states
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  // Closing States
  const [isClosingAuthOpen, setIsClosingAuthOpen] = useState(false);
  const [isClosingOpen, setIsClosingOpen] = useState(false);
  const [isClosingProcess, setIsClosingProcess] = useState(false);
  const [masterKeyInput, setMasterKeyInput] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>(
    DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d]: "" }), {})
  );

  // Weight Dialog
  const [selectedProductForWeight, setSelectedProductForWeight] = useState<any>(null);
  const [breakdownAmount, setBreakdownAmount] = useState("");

  // Printing state
  const [lastSaleForPrint, setLastSaleForPrint] = useState<any>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastScannedCodeRef = useRef<string>("");

  const [mounted, setMounted] = useState(false);

  useEffect(() => { 
    setMounted(true);
    const focusInterval = setInterval(() => {
      if (document.activeElement?.tagName !== 'INPUT' && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 1500);
    return () => clearInterval(focusInterval);
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

  const productsQuery = useMemoFirebase(() => {
    if (!db || !profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "products");
  }, [db, profile?.colmadoId]);
  const { data: products, isLoading: isProductsLoading } = useCollection(productsQuery);

  const customersQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "customers");
  }, [db, profile?.colmadoId]);
  const { data: customers } = useCollection(customersQuery);

  const activeSessionTxQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return query(collection(db, "colmados", profile.colmadoId, "transactions"), where("cashRegisterSessionId", "==", "active_session"));
  }, [db, profile?.colmadoId]);
  const { data: activeSessionTxns } = useCollection(activeSessionTxQuery);

  const activeEntriesQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return query(collection(db, "colmados", profile.colmadoId, "bookkeepingEntries"), where("cashRegisterSessionId", "==", "active_session"));
  }, [db, profile?.colmadoId]);
  const { data: activeEntries } = useCollection(activeEntriesQuery);

  useEffect(() => { setDiscountPercent(0); }, [cart]);
  const grossSubtotal = cart.reduce((sum, item) => sum + (item.amountInDop || item.price * item.quantity), 0);
  const discountAmount = Math.round(grossSubtotal * discountPercent) / 100;
  const subtotal = Math.round((grossSubtotal - discountAmount) * 100) / 100;

  const committedSoFar = partialPayments.cash + partialPayments.card + partialPayments.fiado;
  const remainingToPay = Math.max(0, Math.round((subtotal - committedSoFar) * 100) / 100);

  const applyDiscount = () => {
    const percent = Number(discountInput);
    if (profile?.role !== 'Admin' || !cart.length || committedSoFar > 0) return;
    if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
      toast({ variant: 'destructive', title: 'Porcentaje inválido', description: 'Indica un valor entre 0 y 99.99.' }); return;
    }
    if (colmado?.masterKey === 'VIP1234') { toast({ variant: 'destructive', title: 'Cambia la clave inicial', description: 'Define una clave maestra propia en Ajustes antes de autorizar descuentos.' }); return; }
    if (!colmado?.masterKey || discountKeyInput !== colmado.masterKey) {
      toast({ variant: 'destructive', title: 'Clave maestra incorrecta' }); return;
    }
    setDiscountPercent(percent);
    setDiscountKeyInput(''); setIsDiscountOpen(false);
    toast({ title: percent ? `Descuento del ${percent}% aplicado` : 'Descuento eliminado' });
  };

  const quickStats = useMemo(() => {
    const initialCash = activeEntries?.filter(e => e.entryType === 'InitialCash').reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0;
    const expenses = activeEntries?.filter(e => (e.entryType?.includes('Expense') || e.entryType === 'ProductExpense') && !e.isPayroll).reduce((sum, e) => sum + Math.abs(Number(e.amount) || 0), 0) || 0;
    const activeTxns = activeSessionTxns?.filter(tx => !tx.isAnnulled) || [];
    
    const txCash = activeTxns.reduce((sum, tx) => {
        if (tx.transactionType === "FiadoPayment") {
            return sum + (tx.paymentMethod === 'Efectivo' ? Math.abs(Number(tx.totalAmount)) : 0);
        }
        return sum + (Number(tx.cashAmount || (tx.paymentMethod === 'Efectivo' ? tx.totalAmount : 0)) || 0);
    }, 0);

    const txCard = activeTxns.reduce((sum, tx) => {
        if (tx.transactionType === "FiadoPayment") {
            return sum + (tx.paymentMethod === 'Tarjeta' ? Math.abs(Number(tx.totalAmount)) : 0);
        }
        return sum + (Number(tx.cardAmount || (tx.paymentMethod === 'Tarjeta' ? tx.totalAmount : 0)) || 0);
    }, 0);

    const txFiado = activeTxns.reduce((sum, tx) => {
        if (tx.transactionType === "FiadoPayment") return sum;
        return sum + (tx.paymentMethod === 'Fiado' ? Number(tx.totalAmount) : 0);
    }, 0);

    return { 
      total: activeTxns.reduce((sum, tx) => sum + (tx.transactionType === 'FiadoPayment' ? 0 : (Number(tx.totalAmount) || 0)), 0), 
      cash: txCash,
      card: txCard,
      fiado: txFiado,
      initialCash, 
      expenses,
      cashWithInitial: txCash + initialCash - expenses
    };
  }, [activeSessionTxns, activeEntries]);

  const physicalTotal = useMemo(() => {
    return Object.entries(counts).reduce((sum, [denom, count]) => sum + (Number(denom) * (Number(count) || 0)), 0);
  }, [counts]);

  const addToCart = useCallback((product: any, quantity: number = 1, isFromWeightScan: boolean = false) => {
    setCart((prev) => {
      const price = Number(product.salePrice) || 0;
      const uniqueId = isFromWeightScan ? `${product.id}_w_${Date.now()}` : product.id;

      if (isFromWeightScan) {
        return [{ 
          id: uniqueId, 
          productId: product.id, 
          name: product.name, 
          price, 
          costPrice: Number(product.basePrice) || 0, 
          quantity, 
          isBreakdown: true, 
          amountInDop: price * quantity, 
          unitType: product.unitType || 'lb',
          isCombo: product.isCombo || false,
          comboItems: product.comboItems || [],
          isExtra: product.isExtra || false,
          sourceProductId: product.sourceProductId || "",
          unitsToDiscount: product.unitsToDiscount || 1
        }, ...prev];
      }

      const existing = prev.find((item) => item.productId === product.id && !item.isBreakdown);
      if (existing) return prev.map((item) => (item.productId === product.id && !item.isBreakdown) ? { ...item, quantity: item.quantity + 1 } : item);

      return [{ 
        id: uniqueId, 
        productId: product.id, 
        name: product.name, 
        price, 
        costPrice: Number(product.basePrice) || 0, 
        quantity: 1, 
        unitType: product.unitType || 'ud',
        isCombo: product.isCombo || false,
        comboItems: product.comboItems || [],
        isExtra: product.isExtra || false,
        sourceProductId: product.sourceProductId || "",
        unitsToDiscount: product.unitsToDiscount || 1
      }, ...prev];
    });
  }, []);

  const updateQuantity = useCallback((id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const handleProductSelection = useCallback((product: any) => {
    if (product.isBreakdownAllowed || product.unitType === 'lb' || product.codigoBalanza) {
      setSelectedProductForWeight(product);
      setBreakdownAmount("");
    } else {
      addToCart(product);
    }
  }, [addToCart]);

  const processBarcode = useCallback((code: string) => {
    const term = code.trim();
    if (!term || !products) return;

    if (lastScannedCodeRef.current === term) return;
    lastScannedCodeRef.current = term;
    setTimeout(() => { lastScannedCodeRef.current = ""; }, 1000);

    const parsed = parseVariableWeightBarcode(term);
    if (parsed) {
      const product = products.find(p => 
        parsed.type === 'article' 
          ? (p.barcode === parsed.articleCode || p.barcode2 === parsed.articleCode || p.barcode3 === parsed.articleCode || p.codigoBalanza?.toString() === parsed.articleCode)
          : (p.codigoBalanza?.toString() === parsed.plu?.toString())
      );
      if (product) {
        addToCart(product, parsed.weight, true);
        setSearchTerm("");
        return true;
      }
    }

    const match = products.find(p => 
      p.barcode === term || 
      p.barcode2 === term || 
      p.barcode3 === term || 
      p.codigoBalanza?.toString() === term ||
      (term.length === 13 && term.startsWith("0") && p.barcode === term.substring(1)) ||
      (term.length === 14 && term.startsWith("0") && p.barcode === term.substring(1))
    );
    
    if (match) {
      if (term.length >= 13) {
        addToCart(match);
      } else {
        handleProductSelection(match);
      }
      setSearchTerm("");
      return true;
    }
    return false;
  }, [products, addToCart, handleProductSelection]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      processBarcode(searchTerm);
    }
  };

  useEffect(() => {
    if (searchTerm.length >= 13) {
      processBarcode(searchTerm);
    }
  }, [searchTerm, processBarcode]);

  const filteredDisplayProducts = useMemo(() => {
    if (!products) return [];
    if (!searchTerm) return products.slice(0, 20);
    return products.filter(p => 
      String(p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode?.includes(searchTerm) ||
      p.barcode2?.includes(searchTerm) ||
      p.barcode3?.includes(searchTerm) ||
      p.codigoBalanza?.toString() === searchTerm
    ).slice(0, 30);
  }, [products, searchTerm]);

  const handleCheckout = useCallback(async (method: string, options: any = {}) => {
    const colmadoId = profile?.colmadoId;
    if (!colmadoId || cart.length === 0 || !colmado) return;
    setIsCheckoutProcessing(true);
    const transactionId = `txn_fm_${Date.now()}`;
    const now = new Date().toISOString();

    let cashAmount = partialPayments.cash + (options.cashAmount || 0);
    let cardAmount = partialPayments.card + (options.cardAmount || 0);
    let fiadoAmount = partialPayments.fiado + (options.fiadoAmount || 0);
    let finalMethod = method;

    if (committedSoFar === 0 && !options.isPartial) {
      if (method === 'Efectivo') cashAmount = subtotal;
      if (method === 'Tarjeta') cardAmount = subtotal;
      if (method === 'Fiado') fiadoAmount = subtotal;
    } else {
      finalMethod = "Mixto";
    }

    if (options.isPartial) {
      setPartialPayments(prev => ({
        ...prev,
        cash: prev.cash + (options.cashAmount || 0),
        card: prev.card + (options.cardAmount || 0),
        fiado: prev.fiado + (options.fiadoAmount || 0),
        cardRef: options.paymentRef || prev.cardRef
      }));
      setIsCheckoutProcessing(false);
      setIsCashDialogOpen(false);
      setIsCardDialogOpen(false);
      setIsFiadoDialogOpen(false);
      setCashReceived("");
      setCardAmountInput("");
      return;
    }

    const customer = options.customerId ? customers?.find(c => c.id === options.customerId) : (selectedFiadoCustomer || null);
    const customerName = customer ? `${customer.firstName} ${customer.lastName}` : "Venta General";
    const previousDebt = Number(customer?.currentDebt) || 0;
    const customerDebt = (customer) ? previousDebt + fiadoAmount : previousDebt;
    const effectiveFiscalCustomer=fiscalCustomer||(customer?.isFiscalCustomer&&customer?.rnc?{rnc:customer.rnc,legalName:customer.legalName||customerName,commercialName:'',status:'ACTIVO'}:null);

    const saleData = {
      id: transactionId, 
      colmadoId, 
      transactionType: "Sale", 
      userId: user?.uid,
      cashierName: profile?.firstName || "Cajero",
      totalAmount: subtotal, subtotalBeforeDiscount: grossSubtotal, discountPercent, discountAmount,
      discountApprovedBy: discountPercent ? user?.uid : null,
      cashAmount: Number(cashAmount), 
      cardAmount: Number(cardAmount), 
      fiadoAmount: Number(fiadoAmount),
      paymentMethod: finalMethod, 
      paymentRef: options.paymentRef || partialPayments.cardRef || "", 
      paidAmount: options.paidWithAmount || (cardAmount + cashAmount), 
      changeGiven: options.changeGiven || 0, 
      isComplete: true,
      customerId: customer?.id || null, 
      customerName,
      customerDebt,
      createdAt: now, 
      cashRegisterSessionId: "active_session", 
      items: [...cart],
      ...fiscalSnapshot(colmado, { items: cart, discountAmount, ecfType: effectiveFiscalCustomer ? '31' : (colmado.defaultEcfType || '32') }),
      buyerRnc: effectiveFiscalCustomer?.rnc || '', buyerLegalName: effectiveFiscalCustomer?.legalName || '', buyerCommercialName: effectiveFiscalCustomer?.commercialName || '',
      buyerDgiiStatus: effectiveFiscalCustomer?.status || '', buyerVerifiedAt: effectiveFiscalCustomer ? now : null
    };

    setDocumentNonBlocking(doc(db, "colmados", colmadoId, "transactions", transactionId), saleData, { merge: true });

    if (String(colmado.fiscalMode || '').startsWith('ecf-')) {
      try {
        const response = await fetch('/api/fiscal/mseller', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user?.getIdToken()}`}, body:JSON.stringify({colmadoId,sale:saleData}) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'mSeller no pudo emitir el e-CF.');
        Object.assign(saleData,result);
        updateDocumentNonBlocking(doc(db,"colmados",colmadoId,"transactions",transactionId),result);
        toast({title:'e-CF enviado a mSeller',description:`${result.eNcf} · pendiente de respuesta final DGII.`});
      } catch (error) {
        const fiscalError=error instanceof Error?error.message:'Reintenta desde DGII y Facturación e-CF.';
        Object.assign(saleData,{fiscalStatus:'ProviderError',fiscalError});
        updateDocumentNonBlocking(doc(db,"colmados",colmadoId,"transactions",transactionId),{fiscalStatus:'ProviderError',fiscalError,updatedAt:new Date().toISOString()});
        toast({variant:'destructive',title:'Venta guardada; e-CF pendiente',description:error instanceof Error?error.message:'Reintenta desde DGII y Facturación e-CF.'});
      }
    }

    if (fiadoAmount > 0 && customer?.id) {
      updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "customers", customer.id), {
        currentDebt: increment(fiadoAmount),
        updatedAt: now
      });
    }
    if (fiadoAmount > 0 && customer?.id) {
      void (async()=>{try{await fetch('/api/whatsapp/automation',{method:'POST',headers:{Authorization:`Bearer ${await user?.getIdToken()}`,'Content-Type':'application/json'},body:JSON.stringify({action:'fiado_invoice',transactionId,sale:saleData})});}catch(error){console.error('No se pudo enviar factura automática por WhatsApp',error)}})();
    }

    cart.forEach(item => {
      if (item.isCombo && item.comboItems) {
        item.comboItems.forEach((component: any) => {
          updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "products", component.id), {
            quantityInStock: increment(-(component.quantity * item.quantity))
          });
        });
      } else if (item.isExtra && item.sourceProductId) {
        updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "products", item.sourceProductId), {
          quantityInStock: increment(-(item.quantity * (item.unitsToDiscount || 1)))
        });
      } else {
        updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "products", item.productId), {
          quantityInStock: increment(-item.quantity)
        });
      }
    });

    setLastSaleForPrint({ ...saleData, colmadoName: colmado.name, colmadoAddress: colmado.address, colmadoPhone: colmado.phoneNumber });
    toast({ title: "Cobro Exitoso" });
    
    setTimeout(() => {
      if (colmado.allowLocalPdf !== false) {
        window.print();
      }
      setCart([]);
      setIsCashDialogOpen(false);
      setIsCardDialogOpen(false);
      setIsFiadoDialogOpen(false);
      setCashReceived("");
      setCardAmountInput("");
      setCardTxnNumber("");
      setPartialPayments({ cash: 0, card: 0, cardRef: "", fiado: 0 });
      setSelectedFiadoCustomer(null);
      setFiscalCustomer(null);
      setIsCheckoutProcessing(false);
      setLastSaleForPrint(null);
    }, 1200);
  }, [cart, profile, colmado, user, db, toast, partialPayments, committedSoFar, subtotal, grossSubtotal, discountPercent, discountAmount, customers, selectedFiadoCustomer, fiscalCustomer]);

  const handleAddBreakdown = useCallback(() => {
    if (!selectedProductForWeight || !breakdownAmount) return;
    const amountInDop = Number(breakdownAmount);
    addToCart(selectedProductForWeight, amountInDop / (selectedProductForWeight.salePrice || 1), true);
    setSelectedProductForWeight(null);
    setBreakdownAmount("");
  }, [selectedProductForWeight, breakdownAmount, addToCart]);

  const handleRegisterExpense = useCallback(() => {
    if (!profile?.colmadoId || !expenseDesc || !expenseAmount) return;
    setIsSavingExpense(true);
    const entryId = `exp_fast_${Date.now()}`;
    const now = new Date().toISOString();
    
    const isAutonomous = !!colmado?.isAutonomous;

    const entryData = {
      id: entryId, colmadoId: profile.colmadoId, entryType: "ProductExpense",
      description: isAutonomous ? `[CAJA] REINVERSIÓN: ${expenseDesc}` : `COMPRA CAJA: ${expenseDesc}`, 
      amount: -Math.abs(Number(expenseAmount)),
      category: "Inventario", entryDate: now, createdAt: now, updatedAt: now,
      userId: user?.uid, userName: profile?.firstName || "Administrador",
      cashRegisterSessionId: "active_session", isPayroll: false
    };

    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "bookkeepingEntries", entryId), entryData, { merge: true });
    
    toast({ 
      title: "Inversión Registrada", 
      description: "Se descontó del efectivo de caja." 
    });

    setIsExpenseDialogOpen(false); setExpenseDesc(""); setExpenseAmount(""); setIsSavingExpense(false);
  }, [profile, expenseDesc, expenseAmount, colmado, user, db, toast]);

  const handleFinalizeTurno = useCallback(async () => {
    if (!profile?.colmadoId || !physicalTotal || !colmado) return;
    
    setIsClosingProcess(true);
    const sessionId = `session_fast_${Date.now()}`;
    const now = new Date().toISOString();
    const staffName = profile?.firstName + " " + (profile?.lastName || "");

    const closingData = {
      id: sessionId, colmadoId: profile.colmadoId, openingUserId: user?.uid, staffName,
      closingBalanceExpected: quickStats.cashWithInitial, closingBalanceActual: physicalTotal,
      discrepancy: physicalTotal - quickStats.cashWithInitial, totalSales: quickStats.total,
      cashSales: quickStats.cash, cardSales: quickStats.card, fiadoSales: quickStats.fiado,
      initialCash: quickStats.initialCash, totalExpenses: quickStats.expenses,
      status: "Closed", closedAt: now, createdAt: now,
    };

    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "cashRegisterSessions", sessionId), closingData, { merge: true });
    
    toast({ title: "Cuadre Finalizado" });
    
    setTimeout(() => {
      if (colmado.allowLocalPdf !== false) {
        window.print();
      }
      setCounts(DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d]: "" }), {}));
      setMasterKeyInput("");
      setIsClosingOpen(false);
      setIsClosingProcess(false);
    }, 1500);
  }, [profile, physicalTotal, colmado, user, quickStats, db, toast]);

  const resetPartialPayments = () => {
    setPartialPayments({ cash: 0, card: 0, cardRef: "", fiado: 0 });
    setCashReceived("");
    setCardAmountInput("");
    setCardTxnNumber("");
    setSelectedFiadoCustomer(null);
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-muted/20 overflow-hidden relative">
      <style jsx global>{`
        @media print {
          @page { size: ${colmado?.printerPaperWidth === '58mm' ? '58mm' : '80mm'} auto; margin: 0; }
          body * { visibility: hidden !important; }
          .pos-receipt-print, .pos-receipt-print * { visibility: visible !important; }
          .pos-receipt-print {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${colmado?.printerPaperWidth === '58mm' ? '52mm' : '74mm'} !important;
            padding: 2mm !important;
            margin: 0 auto !important;
            font-family: 'Courier New', Courier, monospace !important;
            background: white !important;
            color: black !important;
            z-index: 9999999 !important;
            height: auto !important;
            overflow: visible !important;
          }
        }
      `}</style>

      {/* TICKET DE VENTA LOCAL FAST */}
      {lastSaleForPrint && (
        <div className="pos-receipt-print">
          <div className="flex flex-col gap-10">
            {/* Si es Fiado, imprime 2 copias, si no solo 1 */}
            {(lastSaleForPrint.paymentMethod === 'Fiado' || lastSaleForPrint.paymentMethod === 'Mixto' && lastSaleForPrint.fiadoAmount > 0 ? [1, 2] : [1]).map((i) => (
              <div key={i} className={i === 2 ? "pt-8 border-t-2 border-dashed border-black mt-8" : ""}>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-black uppercase">{lastSaleForPrint.colmadoName}</h2>
                  <p className="text-[14px] leading-tight">{lastSaleForPrint.colmadoAddress}</p>
                  {lastSaleForPrint.colmadoPhone && <p className="text-[12px]">Tel: {lastSaleForPrint.colmadoPhone}</p>}
                  <div className="border-b-2 border-black my-4" />
                  <h3 className="font-bold uppercase text-base">
                    {lastSaleForPrint.paymentMethod === 'Fiado' ? 'RECIBO DE FIADO (CRÉDITO)' : 'RECIBO DE VENTA FAST'}
                    {i === 2 ? " - COPIA" : " - ORIGINAL"}
                  </h3>
                  <p className="text-[12px]">{new Date().toLocaleString()}</p>
                  <p className="text-[12px] font-black uppercase mt-1">ATENDIDO POR: {lastSaleForPrint.cashierName}</p>
                  <p className="text-[11px]">ID: #{lastSaleForPrint.id.slice(-8)}</p>
                </div>

                {lastSaleForPrint.customerName && lastSaleForPrint.customerName !== "Venta General" && (
                  <div className="bg-black/5 p-3 rounded-lg mb-4 text-[12px]">
                    <p className="font-black text-base uppercase">CLIENTE: {lastSaleForPrint.customerName}</p>
                    {lastSaleForPrint.customerDebt !== undefined && (
                      <p className="font-black text-base mt-2 border-t border-black/20 pt-2">DEUDA TOTAL: RD${lastSaleForPrint.customerDebt.toLocaleString()}</p>
                    )}
                  </div>
                )}

                <div className="mb-6 text-[14px] space-y-2">
                  <div className="flex justify-between border-b-2 border-black font-black pb-2 mb-2">
                    <span className="w-1/2">DETALLE</span>
                    <span className="w-1/4 text-right">CANT</span>
                    <span className="w-1/4 text-right">TOTAL</span>
                  </div>
                  {lastSaleForPrint.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-1 border-b border-black/5 last:border-0">
                      <span className="w-1/2 truncate uppercase font-bold">{item.name}</span>
                      <span className="w-1/4 text-right font-black">{item.quantity.toFixed(1)}</span>
                      <span className="w-1/4 text-right font-black">RD${(item.amountInDop || item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {lastSaleForPrint.discountAmount > 0 && <div className="mb-2 text-sm font-bold"><div className="flex justify-between"><span>SUBTOTAL:</span><span>RD${lastSaleForPrint.subtotalBeforeDiscount.toLocaleString()}</span></div><div className="flex justify-between"><span>DESCUENTO ({lastSaleForPrint.discountPercent}%):</span><span>-RD${lastSaleForPrint.discountAmount.toLocaleString()}</span></div></div>}
                <div className="border-t-4 border-black pt-4 font-black text-4xl flex justify-between">
                  <span>TOTAL:</span>
                  <span>RD${lastSaleForPrint.totalAmount.toLocaleString()}</span>
                </div>

                <div className="mt-6 text-[13px] space-y-1.5 border-t-2 border-dashed border-black/20 pt-4">
                  <div className="flex justify-between"><span>METODO:</span><span className="font-black uppercase">{lastSaleForPrint.paymentMethod}</span></div>
                  {lastSaleForPrint.cashAmount > 0 && <div className="flex justify-between"><span>EFECTIVO:</span><span className="font-black">RD${lastSaleForPrint.cashAmount.toLocaleString()}</span></div>}
                  {lastSaleForPrint.cardAmount > 0 && <div className="flex justify-between"><span>TARJETA:</span><span className="font-black">RD${lastSaleForPrint.cardAmount.toLocaleString()}</span></div>}
                  {lastSaleForPrint.fiadoAmount > 0 && <div className="flex justify-between"><span>FIADO:</span><span className="font-black">RD${lastSaleForPrint.fiadoAmount.toLocaleString()}</span></div>}
                  <div className="flex justify-between font-black text-base border-t border-black/10 pt-1"><span>DEVUELTA:</span><span>RD${(lastSaleForPrint.changeGiven || 0).toLocaleString()}</span></div>
                </div>

                {lastSaleForPrint.fiadoAmount > 0 && (
                  <div className="mt-12 pt-8 border-t-2 border-black text-center">
                    <div className="h-16" />
                    <p className="font-black text-[11px] uppercase">FIRMA CONFORMIDAD CLIENTE</p>
                    <p className="text-[9px] mt-2 italic">Acepto la deuda arriba descrita conforme al Código de Comercio.</p>
                  </div>
                )}

                <FiscalReceiptFooter sale={lastSaleForPrint} />

                <div className="text-center mt-10 text-[11px] opacity-70 italic border-t border-black/5 pt-4">
                  <p>¡Gracias por preferirnos!</p>
                  <p className="font-black">COLMADOM FAST v4.2</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col p-4 lg:p-6 gap-4 lg:gap-6 no-print overflow-hidden">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-2 md:hidden" />
            <h1 className="text-xl lg:text-2xl font-black text-primary uppercase tracking-tighter">Mini Market FAST</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-9 lg:h-10 px-3 lg:px-4 rounded-xl border-orange-500 text-orange-600 font-black gap-2 text-xs lg:text-sm" onClick={() => setIsExpenseDialogOpen(true)}>
               <TrendingDown className="h-4 w-4" /> <span className="hidden sm:inline">GASTO</span>
            </Button>
            <Button variant="destructive" className="h-9 lg:h-10 px-3 lg:px-4 rounded-xl font-black text-xs lg:text-sm" onClick={() => setIsClosingAuthOpen(true)}>
               CERRAR CAJA
            </Button>
            <div className="flex flex-col items-end">
               <Badge variant="outline" className="h-8 lg:h-9 px-3 lg:px-4 rounded-xl border-primary/20 bg-white font-black text-primary uppercase text-[10px] lg:text-xs">
                 Cajero: {profile?.firstName || "---"}
               </Badge>
               <button 
                 onClick={handleLogout}
                 className="text-[9px] font-black text-destructive uppercase hover:underline mt-0.5 mr-1 flex items-center gap-1"
               >
                 <LogOut className="h-2 w-2" /> Cerrar Sesión
               </button>
            </div>
          </div>
        </header>

        <div className="relative">
          <Search className="absolute left-4 lg:left-6 top-1/2 -translate-y-1/2 h-6 lg:h-8 w-6 lg:w-8 text-primary" />
          <Input 
            ref={searchInputRef}
            placeholder="ESCANEA O BUSCA..."
            className="h-14 lg:h-24 pl-12 lg:pl-16 text-xl lg:text-4xl font-black border-4 border-primary/20 rounded-[1.5rem] lg:rounded-[2.5rem] bg-white shadow-2xl focus:border-primary transition-all uppercase"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 overflow-hidden">
          {/* PRODUCT RESULTS */}
          <Card className="shadow-xl border-none rounded-[1.5rem] lg:rounded-[2.5rem] overflow-hidden bg-white flex flex-col">
            <CardHeader className="bg-muted/30 pb-3 lg:pb-4">
               <CardTitle className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                 <Package className="h-4 w-4" /> Inventario
               </CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1">
              <div className="p-3 lg:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 gap-2 lg:gap-3">
                {isProductsLoading ? (
                  <div className="col-span-full py-20 text-center"><Loader2 className="animate-spin mx-auto text-primary opacity-20" /></div>
                ) : filteredDisplayProducts.length === 0 ? (
                  <div className="col-span-full py-20 text-center opacity-30 italic font-bold">Sin resultados.</div>
                ) : filteredDisplayProducts.map((p) => (
                  <Card key={p.id} className="p-1.5 lg:p-2 border-2 border-transparent hover:border-primary cursor-pointer active:scale-95 transition-all shadow-sm flex flex-col gap-1 lg:gap-2 rounded-xl lg:rounded-2xl bg-white" onClick={() => handleProductSelection(p)}>
                    <div className="aspect-square relative rounded-lg lg:rounded-xl overflow-hidden bg-muted/20 border">
                      {p.imageUrl ? <Image src={p.imageUrl} alt="" fill className="object-cover" unoptimized /> : <ImageIcon className="h-5 lg:h-6 w-5 lg:w-6 m-auto opacity-10" />}
                    </div>
                    <div className="px-0.5 min-w-0">
                      <p className="font-black text-[8px] lg:text-[9px] uppercase truncate leading-none mb-0.5 lg:mb-1 text-primary">{p.name}</p>
                      <p className="font-black text-xs">RD${p.salePrice}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </Card>

          {/* DESKTOP CART VIEW */}
          <Card className="hidden lg:flex shadow-xl border-none rounded-[2.5rem] overflow-hidden bg-white flex-col">
            <div className="flex flex-col h-full overflow-hidden">
              <Table>
                <TableHeader className="bg-primary text-white">
                  <TableRow className="h-16 hover:bg-transparent">
                    <TableHead className="font-black px-8 text-white">Carrito</TableHead>
                    <TableHead className="font-black text-center text-white">Cant.</TableHead>
                    <TableHead className="font-black text-right px-8 text-white">Total</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
              </Table>
              <ScrollArea className="flex-1">
                <Table>
                  <TableBody>
                    {cart.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="h-60 text-center opacity-10"><Barcode className="h-16 w-16 mx-auto" /><p className="text-lg font-black italic uppercase">Listo para escanear</p></TableCell></TableRow>
                    ) : cart.map((item) => (
                      <TableRow key={item.id} className="h-20 animate-in slide-in-from-right-4 duration-300">
                        <TableCell className="px-8 font-black text-primary uppercase text-xs">{item.name}</TableCell>
                        <TableCell className="text-center font-black text-sm">
                          <div className="flex items-center justify-center gap-2">
                             <Button variant="ghost" size="icon" className="h-8 w-8 text-primary border" onClick={() => updateQuantity(item.id, -1)}><Minus className="h-4 w-4" /></Button>
                             <span className="min-w-[40px]">{item.quantity.toFixed(1)} <span className="text-[9px] opacity-50 block leading-none">{item.unitType}</span></span>
                             <Button variant="ghost" size="icon" className="h-8 w-8 text-primary border" onClick={() => updateQuantity(item.id, 1)}><Plus className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right px-8 font-black text-lg text-primary">RD${(item.amountInDop || item.price * item.quantity).toLocaleString()}</TableCell>
                        <TableCell className="text-center pr-4"><Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => setCart(cart.filter(i => i.id !== item.id))}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </Card>
        </div>
      </div>

      {/* DESKTOP SIDE PANEL (TOTAL & CHECKOUT) */}
      <div className="hidden lg:flex w-[450px] bg-white border-l shadow-2xl flex flex-col h-full shrink-0 no-print">
         <div className="flex-1 p-8 flex flex-col justify-end space-y-6">
            
            {committedSoFar > 0 && (
              <div className="p-6 bg-muted/30 rounded-[2rem] space-y-3">
                 <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Pagos Parciales Registrados</p>
                 <div className="space-y-2">
                   {partialPayments.cash > 0 && (
                     <div className="flex justify-between items-center text-xs font-bold text-emerald-600">
                       <span>Efectivo:</span>
                       <span>RD${partialPayments.cash.toLocaleString()}</span>
                     </div>
                   )}
                   {partialPayments.card > 0 && (
                     <div className="flex justify-between items-center text-xs font-bold text-blue-600">
                       <span>Tarjeta:</span>
                       <span>RD${partialPayments.card.toLocaleString()}</span>
                     </div>
                   )}
                   {partialPayments.fiado > 0 && (
                     <div className="flex justify-between items-center text-xs font-bold text-orange-600">
                       <span>Fiado:</span>
                       <span>RD${partialPayments.fiado.toLocaleString()}</span>
                     </div>
                   )}
                 </div>
                 <Separator />
                 <div className="flex justify-between items-center font-black">
                    <span className="text-[10px] uppercase">Pendiente:</span>
                    <span className="text-xl text-primary">RD${remainingToPay.toLocaleString()}</span>
                 </div>
                 <Button variant="ghost" size="sm" className="w-full text-[9px] h-6 font-black text-destructive uppercase" onClick={resetPartialPayments}>Limpiar Pagos Parciales</Button>
              </div>
            )}

            {profile?.role === 'Admin' && cart.length > 0 && <Button variant="outline" className="w-full font-bold" disabled={committedSoFar > 0} onClick={() => { setDiscountInput(String(discountPercent || '')); setDiscountKeyInput(''); setIsDiscountOpen(true); }}><Tag className="mr-2 h-4 w-4" /> {discountPercent ? `Descuento ${discountPercent}% · Editar` : 'Aplicar descuento %'}</Button>}
            {colmado?.fiscalEnabled&&<Button variant={fiscalCustomer?'default':'outline'} className="w-full font-bold" disabled={cart.length===0||committedSoFar>0} onClick={()=>setIsFiscalCustomerOpen(true)}><Receipt className="mr-2 h-4 w-4"/>{fiscalCustomer?`Valor fiscal: ${fiscalCustomer.legalName}`:'Factura con valor fiscal'}</Button>}
            <div className="p-8 bg-primary/5 rounded-[2.5rem] border-4 border-primary/20 flex flex-col items-center justify-center text-center">
               <span className="text-xs font-black uppercase text-primary tracking-widest opacity-60">{discountAmount ? `Descuento -RD$${discountAmount.toLocaleString()} · Importe Total` : 'Importe Total'}</span>
               <span className="text-6xl font-black text-primary tracking-tighter">RD${subtotal.toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
               <Button className="h-20 rounded-[1.5rem] bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xl shadow-xl gap-4" onClick={() => { setIsCashDialogOpen(true); }} disabled={cart.length === 0}>
                <Banknote className="h-7 w-7" /> {committedSoFar > 0 ? 'ABONAR EFECTIVO' : 'COBRAR EFECTIVO'}
               </Button>
               
               <div className="grid grid-cols-2 gap-3">
                 <Button className="h-16 rounded-[1.25rem] bg-blue-600 hover:bg-blue-700 text-white font-black text-lg shadow-lg gap-2" onClick={() => { setIsCardDialogOpen(true); }} disabled={cart.length === 0}>
                  <CreditCard className="h-5 w-5" /> TARJETA
                 </Button>
                 <Button variant="outline" className="h-16 rounded-[1.25rem] border-orange-500 text-orange-600 hover:bg-orange-50 font-black text-lg shadow-md gap-2" onClick={() => { setIsFiadoDialogOpen(true); }} disabled={cart.length === 0}>
                  <UserPlus className="h-5 w-5" /> FIADO
                 </Button>
               </div>

               <Button variant="ghost" className="h-12 font-black text-muted-foreground mt-4" onClick={() => { setCart([]); resetPartialPayments(); }} disabled={cart.length === 0}>
                <RefreshCw className="h-4 w-4 mr-2" /> CANCELAR VENTA
               </Button>
            </div>
         </div>
      </div>

      {/* MOBILE BOTTOM BAR & SHEET */}
      <div className="lg:hidden no-print sticky bottom-0 left-0 right-0 z-50 bg-white border-t-4 border-primary/10 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
        <Sheet>
          <SheetTrigger asChild>
            <div className="flex items-center justify-between gap-3 cursor-pointer">
              <div className="flex-1 bg-primary/5 p-3 rounded-2xl border-2 border-primary/20 flex items-center justify-between px-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase text-primary/60">Total</span>
                  <span className="text-2xl font-black text-primary leading-none">RD${subtotal.toLocaleString()}</span>
                </div>
                <div className="h-10 w-10 bg-primary text-white rounded-xl flex items-center justify-center relative">
                   <ShoppingCart className="h-5 w-5" />
                   {cart.length > 0 && (
                     <Badge className="absolute -top-2 -right-2 bg-accent text-white border-2 border-white rounded-full h-5 w-5 flex items-center justify-center p-0 text-[10px] font-black">{cart.length}</Badge>
                   )}
                </div>
              </div>
              <Button size="lg" className="h-16 rounded-2xl bg-emerald-600 text-white font-black px-8 shadow-lg active:scale-95 transition-all" onClick={(e) => { e.stopPropagation(); setIsCashDialogOpen(true); }} disabled={cart.length === 0}>
                PAGAR
              </Button>
            </div>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh] rounded-t-[2.5rem] p-0 overflow-hidden flex flex-col border-none shadow-2xl">
            <SheetHeader className="p-6 bg-primary text-white shrink-0">
               <div className="flex items-center justify-between">
                  <SheetTitle className="text-2xl font-black text-white flex items-gap-3">
                    <ShoppingCart className="h-7 w-7" /> Mi Venta
                  </SheetTitle>
                  <Button variant="ghost" size="icon" className="text-white h-10 w-10" onClick={() => { setCart([]); resetPartialPayments(); }} disabled={cart.length === 0}>
                    <RefreshCw className="h-5 w-5" />
                  </Button>
               </div>
            </SheetHeader>
            
            <ScrollArea className="flex-1 p-4 bg-muted/10">
               {cart.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-[50vh] opacity-20 space-y-4">
                    <Package className="h-20 w-20" />
                    <p className="font-black text-xl">SIN ARTÍCULOS</p>
                 </div>
               ) : (
                 <div className="space-y-3">
                    {committedSoFar > 0 && (
                       <div className="p-4 bg-primary/5 rounded-2xl border-2 border-dashed border-primary/20 space-y-2 mb-4">
                          <p className="text-[9px] font-black uppercase text-primary">Pagado: RD${committedSoFar.toLocaleString()}</p>
                          <p className="text-lg font-black text-primary">Pendiente: RD${remainingToPay.toLocaleString()}</p>
                       </div>
                    )}
                    {cart.map((item) => (
                      <div key={item.id} className="bg-white p-4 rounded-2xl border shadow-sm flex items-center justify-between animate-in slide-in-from-bottom-2 duration-300">
                         <div className="min-w-0 flex-1">
                            <p className="font-black text-sm uppercase truncate text-primary">{item.name}</p>
                            <div className="flex items-center gap-2 mt-2">
                               <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateQuantity(item.id, -1)}><Minus className="h-4 w-4" /></Button>
                               <span className="text-sm font-black w-10 text-center">{item.quantity.toFixed(1)}</span>
                               <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateQuantity(item.id, 1)}><Plus className="h-4 w-4" /></Button>
                               <span className="text-[10px] font-bold text-muted-foreground uppercase">{item.unitType}</span>
                            </div>
                         </div>
                         <div className="flex items-center gap-4">
                            <span className="font-black text-lg">RD${(item.amountInDop || item.price * item.quantity).toLocaleString()}</span>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setCart(cart.filter(i => i.id !== item.id))}>
                               <Trash2 className="h-5 w-5" />
                            </Button>
                         </div>
                      </div>
                    ))}
                 </div>
               )}
            </ScrollArea>

            <SheetFooter className="p-6 bg-white border-t-2 shrink-0">
               <div className="w-full space-y-6">
                  <div className="flex justify-between items-end bg-primary/5 p-5 rounded-[2rem] border-2 border-primary/10">
                     <span className="text-[10px] font-black uppercase text-primary/60 tracking-widest mb-1">{committedSoFar > 0 ? 'Saldo Restante' : 'Cobro Final'}</span>
                     <span className="text-5xl font-black text-primary">RD${(committedSoFar > 0 ? remainingToPay : subtotal).toLocaleString()}</span>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {colmado?.fiscalEnabled&&<Button variant={fiscalCustomer?'default':'outline'} className="h-14 rounded-2xl font-black" disabled={committedSoFar>0} onClick={()=>setIsFiscalCustomerOpen(true)}><Receipt className="mr-2 h-5 w-5"/>{fiscalCustomer?fiscalCustomer.legalName:'FACTURA CON VALOR FISCAL'}</Button>}
                    <Button className="h-16 rounded-2xl bg-emerald-600 font-black text-xl gap-3 shadow-xl" onClick={() => { setIsCashDialogOpen(true); }}>
                      <Banknote className="h-6 w-6" /> COBRAR EFECTIVO
                    </Button>
                    <div className="grid grid-cols-2 gap-3">
                      <Button className="h-14 rounded-2xl bg-blue-600 text-white font-black shadow-lg gap-2" onClick={() => { setIsCardDialogOpen(true); }}>
                        <CreditCard className="h-5 w-5" /> TARJETA
                      </Button>
                      <Button className="h-14 rounded-2xl border-orange-500 text-orange-600 font-black shadow-lg gap-2" onClick={() => { setIsFiadoDialogOpen(true); }}>
                        <UserPlus className="h-5 w-5" /> FIADO
                      </Button>
                    </div>
                  </div>
               </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      <Dialog open={isDiscountOpen} onOpenChange={setIsDiscountOpen}><DialogContent><DialogHeader><DialogTitle>Descuento con clave maestra</DialogTitle><DialogDescription>Solo el dueño puede autorizar un descuento para este carrito.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label htmlFor="fast-discount-percent">Descuento (%)</Label><Input id="fast-discount-percent" type="number" min="0" max="99.99" step="0.01" value={discountInput} onChange={event => setDiscountInput(event.target.value)} /></div><div><Label htmlFor="fast-discount-key">Clave maestra</Label><Input id="fast-discount-key" type="password" value={discountKeyInput} onChange={event => setDiscountKeyInput(event.target.value)} /></div></div><DialogFooter><Button onClick={applyDiscount}>Aplicar al carrito</Button></DialogFooter></DialogContent></Dialog>
      {/* EFECTIVO DIALOG */}
      <FiscalCustomerDialog open={isFiscalCustomerOpen} onOpenChange={setIsFiscalCustomerOpen} onSelect={setFiscalCustomer} colmadoId={profile?.colmadoId}/>
      <Dialog open={isCashDialogOpen} onOpenChange={(open) => { setIsCashDialogOpen(open); if(!open) setCashReceived(""); }}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader><DialogTitle className="text-2xl font-black">Cobro Efectivo</DialogTitle></DialogHeader>
          <div className="py-6 space-y-6">
            <div className="p-6 bg-muted/30 rounded-3xl border-2 border-dashed flex justify-between items-center text-primary">
              <span className="text-xs font-black uppercase">Balance Pendiente</span>
              <span className="text-3xl font-black">RD${remainingToPay.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground">Monto Recibido (RD$)</Label>
              <input 
                type="number" 
                className="w-full h-20 text-5xl font-black text-center border-2 border-primary/20 rounded-3xl outline-none focus:border-primary transition-all" 
                value={cashReceived} 
                onChange={(e) => setCashReceived(e.target.value)} 
                autoFocus 
              />
            </div>

            {Number(cashReceived) >= remainingToPay && remainingToPay > 0 && (
              <div className="p-6 bg-emerald-50 rounded-3xl border-2 border-emerald-100 flex flex-col items-center">
                <span className="text-xs font-black uppercase text-emerald-600">Devuelta</span>
                <span className="text-5xl font-black text-emerald-600">RD${(Number(cashReceived) - remainingToPay).toLocaleString()}</span>
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-col gap-3">
            {Number(cashReceived) > 0 && Number(cashReceived) < remainingToPay && (
              <Button className="w-full h-16 text-lg font-black rounded-2xl bg-accent" onClick={() => handleCheckout("Efectivo", { cashAmount: Number(cashReceived), isPartial: true })}>
                 <Plus className="mr-2" /> APLICAR COMO ABONO
              </Button>
            )}
            <Button className="w-full h-16 text-xl font-black rounded-2xl bg-primary" onClick={() => handleCheckout("Efectivo", { cashAmount: remainingToPay, paidWithAmount: Number(cashReceived), changeGiven: Math.max(0, Number(cashReceived) - remainingToPay) })} disabled={!cashReceived || Number(cashReceived) < remainingToPay || isCheckoutProcessing}>
              FINALIZAR VENTA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TARJETA DIALOG */}
      <Dialog open={isCardDialogOpen} onOpenChange={(open) => { setIsCardDialogOpen(open); if(!open) { setCardAmountInput(""); setCardTxnNumber(""); } }}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader><DialogTitle className="text-2xl font-black">Cobro Tarjeta</DialogTitle></DialogHeader>
          <div className="py-6 space-y-6">
            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase">Monto a Cobrar</Label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-blue-600 opacity-40" />
                <input 
                  type="number" 
                  value={cardAmountInput || remainingToPay} 
                  onChange={(e) => setCardAmountInput(e.target.value)} 
                  className="w-full h-16 text-3xl font-black border-2 border-blue-200 focus:border-blue-600 pl-12 rounded-2xl outline-none text-center" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase">Ref. Verifone (Voucher)</Label>
              <Input placeholder="Código de transacción" value={cardTxnNumber} onChange={(e) => setCardTxnNumber(e.target.value)} className="h-12 font-mono font-bold rounded-xl text-center" />
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-3">
             {Number(cardAmountInput) > 0 && Number(cardAmountInput) < remainingToPay && (
               <Button className="w-full h-16 text-lg font-black rounded-2xl bg-blue-500" onClick={() => handleCheckout("Tarjeta", { cardAmount: Number(cardAmountInput), paymentRef: cardTxnNumber, isPartial: true })}>
                 APLICAR ABONO TARJETA
               </Button>
             )}
             <Button className="w-full h-16 text-xl font-black rounded-2xl bg-blue-600 shadow-xl" onClick={() => handleCheckout("Tarjeta", { paymentRef: cardTxnNumber, cardAmount: Number(cardAmountInput || remainingToPay) })} disabled={!cardTxnNumber || !cardAmountInput && remainingToPay <= 0 || isCheckoutProcessing}>
               CONFIRMAR PAGO TOTAL
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FIADO DIALOG */}
      <Dialog open={isFiadoDialogOpen} onOpenChange={(open) => { setIsFiadoDialogOpen(open); if(!open) setSelectedFiadoCustomer(null); }}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader><DialogTitle className="text-2xl font-black">Cargar a Libreta</DialogTitle></DialogHeader>
          <div className="py-6 space-y-6">
             <div className="p-4 bg-orange-50 border-2 border-orange-100 rounded-2xl flex justify-between items-center text-orange-800">
                <span className="text-xs font-black uppercase">Monto a Cargar</span>
                <span className="text-2xl font-black">RD${remainingToPay.toLocaleString()}</span>
             </div>
             <Input placeholder="Buscar cliente..." value={fiadoSearch} onChange={(e) => setFiadoSearch(e.target.value)} className="h-14 font-bold rounded-2xl" />
             <ScrollArea className="h-60 border rounded-2xl bg-white p-2">
                {customers?.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(fiadoSearch.toLowerCase())).map(c => (
                  <div key={c.id} className={`p-4 border-b last:border-0 cursor-pointer rounded-xl flex justify-between items-center ${selectedFiadoCustomer?.id === c.id ? 'bg-orange-50 border-orange-200' : 'hover:bg-muted/50'}`} onClick={() => setSelectedFiadoCustomer(c)}>
                    <span className="font-black text-xs uppercase">{c.firstName} {c.lastName}</span>
                    <Badge variant="outline">RD${c.currentDebt?.toLocaleString()}</Badge>
                  </div>
                ))}
             </ScrollArea>
          </div>
          <DialogFooter>
            <Button className="w-full h-16 text-xl font-black rounded-2xl bg-orange-600" onClick={() => handleCheckout("Fiado", { fiadoAmount: remainingToPay, customerId: selectedFiadoCustomer?.id })} disabled={!selectedFiadoCustomer || isCheckoutProcessing}>
              CARGAR BALANCE A CUENTA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GASTO DIALOG */}
      <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-orange-600 flex items-center gap-2"><TrendingDown className="h-6 w-6" /> Gasto de Caja</DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
             <div className="space-y-2">
               <Label className="font-black text-xs uppercase text-muted-foreground">Artículos Comprados / Motivo</Label>
               <Input placeholder="Ej: Fundas de hielo, Botellones..." value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} className="h-14 rounded-xl font-bold" />
             </div>
             <div className="space-y-2">
               <Label className="font-black text-xs uppercase text-muted-foreground">Monto Pagado (RD$)</Label>
               <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-orange-600 opacity-20">RD$</span>
                  <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} className="h-20 pl-16 text-4xl font-black border-orange-200" />
               </div>
             </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-16 font-black text-xl bg-orange-600 hover:bg-orange-700 rounded-2xl" onClick={handleRegisterExpense} disabled={!expenseDesc || !expenseAmount || isSavingExpense}>
              {isSavingExpense ? <Loader2 className="animate-spin" /> : "Confirmar Gasto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PESO / MONTO DIALOG */}
      <Dialog open={!!selectedProductForWeight} onOpenChange={(o) => !o && setSelectedProductForWeight(null)}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader><DialogTitle className="text-2xl font-black">Venta por Monto (RD$)</DialogTitle></DialogHeader>
          <div className="py-6 space-y-4 text-center">
             <p className="font-black text-primary uppercase text-xs">{selectedProductForWeight?.name}</p>
             <div className="space-y-2">
                <Label className="font-black text-xs uppercase text-muted-foreground">¿Cuánto en Pesos?</Label>
                <input type="number" placeholder="0.00" className="w-full h-24 text-6xl font-black text-center rounded-[2rem] border-4 outline-none focus:border-primary transition-all" value={breakdownAmount} onChange={(e) => setBreakdownAmount(e.target.value)} autoFocus />
             </div>
          </div>
          <DialogFooter><Button className="w-full h-16 font-black bg-primary text-xl rounded-2xl" onClick={handleAddBreakdown} disabled={!breakdownAmount}>AÑADIR</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CIERRE DE CAJA AUTH */}
      <Dialog open={isClosingAuthOpen} onOpenChange={setIsClosingAuthOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-2xl font-black uppercase text-center">Cerrar Turno</DialogTitle></DialogHeader>
          <div className="py-6 space-y-6">
             <div className="space-y-2">
                <Label className="font-black text-xs uppercase tracking-widest text-primary block text-center">Ingresa Llave Maestra</Label>
                <Input type="password" placeholder="••••••••" className="h-16 text-3xl font-black text-center border-2 border-primary/20 rounded-2xl" value={masterKeyInput} onChange={(e) => setMasterKeyInput(e.target.value)} autoFocus />
             </div>
          </div>
          <DialogFooter><Button className="w-full h-16 text-xl font-black bg-primary rounded-2xl" onClick={() => { if(masterKeyInput === colmado?.masterKey) { setIsClosingAuthOpen(false); setIsClosingOpen(true); } else { toast({ variant: 'destructive', title: 'Llave Incorrecta' }); } }}>Validar y Continuar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CIERRE DE CAJA (CUADRE) */}
      <Dialog open={isClosingOpen} onOpenChange={setIsClosingOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-2xl font-black">Cuadre de Efectivo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/30 rounded-xl"><p className="text-[10px] font-black uppercase opacity-50">Esperado Efectivo</p><p className="text-lg font-black">RD${quickStats.cashWithInitial.toLocaleString()}</p></div>
              <div className="p-3 bg-blue-50 rounded-xl"><p className="text-[10px] font-black uppercase text-blue-600">Ventas Tarjeta</p><p className="text-lg font-black text-blue-700">RD${quickStats.card.toLocaleString()}</p></div>
            </div>
            <div className="space-y-3">
              <Label className="font-black text-xs uppercase">Efectivo Contado</Label>
              <ScrollArea className="h-48 border rounded-xl p-3 bg-white">
                <div className="space-y-2">
                  {DENOMINATIONS.map(d => (
                    <div key={d} className="flex items-center gap-3">
                      <span className="w-16 font-bold text-xs">x RD${d}</span>
                      <Input type="number" value={counts[d]} onChange={(e) => setCounts({...counts, [d]: e.target.value})} className="h-8 text-right font-mono" placeholder="0" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="p-3 bg-primary/5 border-2 border-primary/20 rounded-xl flex justify-between items-center">
                 <span className="text-xs font-black uppercase">Total Contado:</span>
                 <span className="text-xl font-black text-primary">RD${physicalTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <DialogFooter><Button className="w-full h-16 font-black text-xl" onClick={handleFinalizeTurno} disabled={isClosingProcess}>Finalizar Cuadre e Imprimir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
