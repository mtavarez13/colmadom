"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { 
  Plus, 
  Minus, 
  Trash2, 
  Loader2, 
  ImageIcon,
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
  BellRing,
  X,
  Coins,
  ArrowRight,
  Zap,
  DollarSign,
  Edit3,
  RefreshCw,
  Barcode,
  History,
  Lock,
  Tag,
  TrendingDown,
  Volume2,
  Package,
  Wallet
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, increment, query, where, getDocs, onSnapshot, orderBy, getDoc, limit } from "firebase/firestore";
import { setDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Image from "next/image";
import { parseVariableWeightBarcode } from "@/lib/barcode-utils";
import { fiscalSnapshot } from "@/lib/dominican-fiscal";
import { FiscalReceiptFooter } from "@/components/fiscal-receipt-footer";
import { FiscalCustomerDialog } from "@/components/fiscal-customer-dialog";
import { PharmacySaleDialog } from "@/components/pharmacy-sale-dialog";
import { buildPharmacyFollowUps, emptyPharmacySelection } from "@/lib/pharmacy-follow-up";
import { useWhatsAppPosNotifications } from "@/hooks/use-whatsapp-pos-notifications";

export const dynamic = 'force-dynamic';

const DENOMINATIONS = [2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1];
type CheckoutOptions = { paymentRef?: string; cardAmount?: number; cashAmount?: number; fiadoAmount?: number; customerId?: string | null; paidWithAmount?: number; changeGiven?: number; isPartial?: boolean };

export default function POSPage() {
  useWhatsAppPosNotifications();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
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
  const [isPharmacyDialogOpen, setIsPharmacyDialogOpen] = useState(false);
  const [pharmacySelection, setPharmacySelection] = useState(emptyPharmacySelection);
  const lastScannedCodeRef = useRef<string>("");

  const [isClosingOpen, setIsClosingOpen] = useState(false);
  const [isClosingProcess, setIsClosingProcess] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Payment states
  const [isCashDialogOpen, setIsCashDialogOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState("");
  const [isCardDialogOpen, setIsCardDialogOpen] = useState(false);
  const [cardTxnNumber, setCardTxnNumber] = useState("");
  const [cardAmountInput, setCardAmountInput] = useState("");
  const [isFiadoDialogOpen, setIsFiadoDialogOpen] = useState(false);
  const [fiadoSearch, setFiadoSearch] = useState("");
  const [selectedFiadoCustomer, setSelectedFiadoCustomer] = useState<any>(null);

  // Mixed Payment state
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

  // Weight Dialog
  const [selectedProductForWeight, setSelectedProductForWeight] = useState<any>(null);
  const [breakdownAmount, setBreakdownAmount] = useState("");

  const [lastSaleForPrint, setLastSaleForPrint] = useState<any>(null);
  const [isAutoPrintOrdersEnabled, setIsAutoPrintOrdersEnabled] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>(
    DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d]: "" }), {})
  );

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { 
    setMounted(true); 
    const saved = localStorage.getItem('auto_print_orders');
    if (saved === 'true') setIsAutoPrintOrdersEnabled(true);

    const focusInterval = setInterval(() => {
      if (document.activeElement?.tagName !== 'INPUT' && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 2000);
    return () => clearInterval(focusInterval);
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
  useEffect(() => {
    if (cart.length === 0 || colmado?.pharmacyEnabled === false) {
      setPharmacySelection(emptyPharmacySelection());
      setIsPharmacyDialogOpen(false);
    }
  }, [cart.length, colmado?.pharmacyEnabled]);

  const productsQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId || !db) return null;
    return collection(db, "colmados", profile.colmadoId, "products");
  }, [db, profile?.colmadoId]);
  const { data: products } = useCollection(productsQuery);

  const customersQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId || !db) return null;
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

  const handleToggleAutoPrint = (val: boolean) => {
    setIsAutoPrintOrdersEnabled(val);
    localStorage.setItem('auto_print_orders', String(val));
    toast({ title: val ? "Autoprint KIOSKO: ON" : "Autoprint KIOSKO: OFF" });
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
    const uniqueId = isFromWeightScan ? `${product.id}_w_${Date.now()}` : product.id;
    setCart((prev) => {
      const price = Number(product.salePrice) || 0;
      if (isFromWeightScan) {
        return [{ 
          id: uniqueId, productId: product.id, name: product.name, price, costPrice: Number(product.basePrice) || 0, quantity, 
          isBreakdown: true, amountInDop: price * quantity, unitType: product.unitType || 'lb',
          isCombo: product.isCombo || false, comboItems: product.comboItems || [],
          isExtra: product.isExtra || false, sourceProductId: product.sourceProductId || "",
          unitsToDiscount: product.unitsToDiscount || 1
        }, ...prev];
      }
      const existing = prev.find((item) => item.productId === product.id && !item.isBreakdown && !item.isGeneric);
      if (existing) return prev.map((item) => (item.productId === product.id && !item.isBreakdown && !item.isGeneric) ? { ...item, quantity: item.quantity + 1 } : item);
      return [{ 
        id: uniqueId, productId: product.id, name: product.name, price, costPrice: Number(product.basePrice) || 0, quantity: 1, unitType: product.unitType || 'ud',
        isCombo: product.isCombo || false, comboItems: product.comboItems || [],
        isExtra: product.isExtra || false, sourceProductId: product.sourceProductId || "",
        unitsToDiscount: product.unitsToDiscount || 1
      }, ...prev];
    });
  }, []);

  const handleProductSelection = useCallback((product: any) => {
    if (product.isFractionalOnly || product.isBreakdownAllowed) {
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
      const product = products.find(p => parsed.type === 'article' ? (p.barcode === parsed.articleCode || p.barcode2 === parsed.articleCode || p.barcode3 === parsed.articleCode || p.codigoBalanza?.toString() === parsed.articleCode) : (p.codigoBalanza?.toString() === parsed.plu?.toString()));
      if (product) { addToCart(product, parsed.weight, true); setSearchTerm(""); return true; }
    }
    const match = products.find(p => p.barcode === term || p.barcode2 === term || p.barcode3 === term || p.codigoBalanza?.toString() === term || (term.length === 13 && term.startsWith("0") && p.barcode === term.substring(1)) || (term.length === 14 && term.startsWith("0") && p.barcode === term.substring(1)));
    if (match) { if (term.length >= 13) { addToCart(match); } else { handleProductSelection(match); } setSearchTerm(""); return true; }
    return false;
  }, [products, addToCart, handleProductSelection]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); processBarcode(searchTerm); }
  };

  useEffect(() => { if (searchTerm.length >= 13) { processBarcode(searchTerm); } }, [searchTerm, processBarcode]);

  const handleAddBreakdown = useCallback(() => {
    if (!selectedProductForWeight || !breakdownAmount) return;
    addToCart(selectedProductForWeight, Number(breakdownAmount) / selectedProductForWeight.salePrice, true);
    setSelectedProductForWeight(null);
    setBreakdownAmount("");
  }, [selectedProductForWeight, breakdownAmount, addToCart]);

  const handleCheckout = useCallback(async (method: string, options: CheckoutOptions = {}) => {
    if (cart.length === 0 || !profile?.colmadoId || !colmado) return;
    const paymentRef = options.paymentRef || '';
    const customerId = options.customerId || null;
    const paidWithAmount = options.paidWithAmount || 0;
    const changeGiven = options.changeGiven || 0;
    if (options.isPartial) {
      const amount = Number(method === 'Efectivo' ? options.cashAmount : options.cardAmount);
      if (!Number.isFinite(amount) || amount <= 0 || amount >= remainingToPay) return;
      setPartialPayments(previous => ({
        ...previous,
        cash: previous.cash + (method === 'Efectivo' ? amount : 0),
        card: previous.card + (method === 'Tarjeta' ? amount : 0),
        cardRef: method === 'Tarjeta' ? paymentRef : previous.cardRef
      }));
      setIsCashDialogOpen(false); setIsCardDialogOpen(false);
      setCashReceived(''); setCardAmountInput('');
      return;
    }
    setIsCheckoutProcessing(true);
    const transactionId = `txn_${Date.now()}`;
    const now = new Date().toISOString();
    const colmadoId = profile.colmadoId;

    let cashAmount = method === "Efectivo" ? subtotal : 0;
    let cardAmount = method === "Tarjeta" ? subtotal : 0;
    let fiadoAmount = method === "Fiado" ? subtotal : 0;
    let finalMethod = method;

    if (committedSoFar > 0) {
      finalMethod = "Mixto";
      cashAmount = partialPayments.cash + (method === "Efectivo" ? remainingToPay : 0);
      cardAmount = partialPayments.card + (method === "Tarjeta" ? remainingToPay : 0);
      fiadoAmount = partialPayments.fiado + (method === "Fiado" ? remainingToPay : 0);
    }

    const pharmacyAllowed = colmado.pharmacyEnabled === true && ['Admin', 'Cajero'].includes(profile.role) && fiadoAmount === 0;
    if (pharmacySelection.customerId && !pharmacyAllowed) {
      toast({ variant: 'destructive', title: 'El seguimiento de farmacia requiere una venta de contado.' });
      setIsCheckoutProcessing(false);
      return;
    }
    let pharmacyFollowUps;
    try {
      pharmacyFollowUps = pharmacyAllowed ? buildPharmacyFollowUps(cart, pharmacySelection, new Date(now)) : [];
    } catch (error) {
      toast({ variant: 'destructive', title: 'Revisa la pauta registrada', description: error instanceof Error ? error.message : 'Datos incompletos.' });
      setIsCheckoutProcessing(false);
      return;
    }

    const customer = customerId ? customers?.find(c => c.id === customerId) : (selectedFiadoCustomer || (pharmacyAllowed && pharmacySelection.customerId ? customers?.find(c => c.id === pharmacySelection.customerId) || { id: pharmacySelection.customerId, firstName: pharmacySelection.customerName, lastName: '', phoneNumber: pharmacySelection.customerPhone } : null));
    const customerName = customer ? `${customer.firstName} ${customer.lastName}` : "Venta General";
    const previousDebt = Number(customer?.currentDebt) || 0;
    const customerDebt = (customer) ? previousDebt + fiadoAmount : previousDebt;
    const effectiveFiscalCustomer=fiscalCustomer||(customer?.isFiscalCustomer&&customer?.rnc?{rnc:customer.rnc,legalName:customer.legalName||customerName,commercialName:'',status:'ACTIVO'}:null);

    const saleData = {
      id: transactionId, colmadoId, transactionType: "Sale", userId: user?.uid,
      cashierName: profile?.firstName || "Cajero",
      totalAmount: subtotal, subtotalBeforeDiscount: grossSubtotal, discountPercent, discountAmount,
      discountApprovedBy: discountPercent ? user?.uid : null,
      cashAmount: Number(cashAmount), cardAmount: Number(cardAmount), fiadoAmount: Number(fiadoAmount),
      paymentMethod: finalMethod, paymentRef: paymentRef || partialPayments.cardRef || "", 
      paidAmount: paidWithAmount || (cardAmount + cashAmount), 
      changeGiven: changeGiven || 0, isComplete: true, 
      customerId: customer?.id || null, customerName, customerDebt, 
      customerPhone: customer?.phoneNumber || '',
      hasPharmacyFollowUp: pharmacyFollowUps.length > 0,
      pharmacyFollowUps,
      pharmacyFollowUpConsent: pharmacyFollowUps.length > 0 && pharmacySelection.followUpConsent,
      createdAt: now, cashRegisterSessionId: "active_session", items: [...cart],
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
        Object.assign(saleData, result);
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
      updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "customers", customer.id), { currentDebt: increment(fiadoAmount), updatedAt: now });
    }
    if (fiadoAmount > 0 && customer?.id) {
      void (async()=>{try{await fetch('/api/whatsapp/automation',{method:'POST',headers:{Authorization:`Bearer ${await user?.getIdToken()}`,'Content-Type':'application/json'},body:JSON.stringify({action:'fiado_invoice',transactionId,sale:saleData})});}catch(error){console.error('No se pudo enviar factura automática por WhatsApp',error)}})();
    }

    cart.forEach(item => {
      if (item.isCombo && item.comboItems) {
      item.comboItems.forEach((component: any) => updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "products", component.id), { quantityInStock: increment(-(component.quantity * item.quantity)) }));
      } else {
        updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "products", item.productId), { quantityInStock: increment(-item.quantity) });
      }
    });

    setLastSaleForPrint({ ...saleData, colmadoName: colmado.name, colmadoAddress: colmado.address, colmadoPhone: colmado.phoneNumber });
    toast({ title: "Venta Exitosa" });
    
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
      setSelectedFiadoCustomer(null);
      setFiscalCustomer(null);
      setPharmacySelection(emptyPharmacySelection());
      setPartialPayments({ cash: 0, card: 0, cardRef: "", fiado: 0 });
      setIsCheckoutProcessing(false);
      setLastSaleForPrint(null);
    }, 1200);
  }, [cart, profile, colmado, user, db, toast, partialPayments, committedSoFar, subtotal, grossSubtotal, discountPercent, discountAmount, customers, selectedFiadoCustomer, remainingToPay, fiscalCustomer, pharmacySelection]);

  const resetPartialPayments = () => {
    setPartialPayments({ cash: 0, card: 0, cardRef: "", fiado: 0 });
    setCashReceived("");
    setCardAmountInput("");
    setCardTxnNumber("");
    setSelectedFiadoCustomer(null);
  };

  const handleSaveExpense = useCallback(() => {
    if (!profile?.colmadoId || !expenseDesc || !expenseAmount) return;
    setIsSavingExpense(true);
    const entryId = `exp_pos_${Date.now()}`;
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
    
    toast({ title: "Reinversión Registrada" });

    setIsExpenseDialogOpen(false); setExpenseDesc(""); setExpenseAmount(""); setIsSavingExpense(false);
  }, [profile, expenseDesc, expenseAmount, colmado, user, db, toast]);

  const handleFinalizeTurno = useCallback(async () => {
    if (!profile?.colmadoId || !physicalTotal || !colmado) return;
    setIsClosingProcess(true);
    const sessionId = `session_${Date.now()}`;
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
      setIsClosingOpen(false);
      setIsClosingProcess(false);
    }, 1500);
  }, [profile, physicalTotal, colmado, user, quickStats, db, toast]);

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

  if (!mounted) return null;

  return (
    <div className="flex h-screen flex-col lg:flex-row bg-background overflow-hidden">
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

      {/* TICKET DE IMPRESION DINÁMICO */}
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
                    {lastSaleForPrint.paymentMethod === 'Fiado' ? 'RECIBO DE FIADO (CRÉDITO)' : 'RECIBO DE VENTA'}
                    {i === 2 ? " - COPIA" : " - ORIGINAL"}
                  </h3>
                  <p className="text-[12px]">{new Date(lastSaleForPrint.createdAt).toLocaleString()}</p>
                  <p className="text-[12px] font-black uppercase mt-1">CAJERO: {lastSaleForPrint.cashierName}</p>
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
                  <span>TOTAL:</span><span>RD${lastSaleForPrint.totalAmount.toLocaleString()}</span>
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
                  </div>
                )}

                <FiscalReceiptFooter sale={lastSaleForPrint} />

                <div className="text-center mt-10 text-[11px] opacity-70 italic border-t border-black/5 pt-4">
                  <p>Gracias por preferirnos</p>
                  <p className="font-black">SISTEMA COLMADOM CLOUD</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-hidden no-print">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-2 md:hidden" />
            <h1 className="text-2xl font-black text-primary uppercase tracking-tighter">Ventas POS</h1>
            <div className="ml-4 flex items-center gap-3 bg-white p-2 px-3 rounded-xl border shadow-sm">
               <BellRing className={`h-4 w-4 ${isAutoPrintOrdersEnabled ? 'text-accent animate-bounce' : 'text-muted-foreground'}`} />
               <div className="flex flex-col">
                 <Label className="text-[8px] font-black uppercase leading-none">Impresión Pedidos</Label>
                 <span className="text-[7px] font-bold text-muted-foreground">{isAutoPrintOrdersEnabled ? 'KIOSKO ON' : 'MANUAL'}</span>
               </div>
               <Switch checked={isAutoPrintOrdersEnabled} onCheckedChange={handleToggleAutoPrint} className="scale-75" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="font-black h-11 border-orange-500 text-orange-600 hover:bg-orange-50 gap-2" onClick={() => setIsExpenseDialogOpen(true)}>
               <TrendingDown className="h-4 w-4" /> Gasto
            </Button>
            <Button variant="destructive" className="font-black h-11" onClick={() => setIsClosingOpen(true)}>Cerrar Caja</Button>
          </div>
        </header>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-primary" />
          <Input 
            ref={searchInputRef}
            placeholder="BUSCAR O ESCANEAR ARTÍCULOS..." 
            className="h-16 pl-12 text-2xl font-black rounded-2xl bg-white text-primary border-none shadow-xl uppercase"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <ScrollArea className="flex-1 bg-muted/5 rounded-[2rem] p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {filteredDisplayProducts.map((p: any) => (
              <Card key={p.id} className="p-2 flex items-center gap-3 hover:border-primary cursor-pointer shadow-sm active:scale-95 transition-all rounded-2xl bg-white border-2" onClick={() => handleProductSelection(p)}>
                <div className="h-12 w-12 rounded-xl relative overflow-hidden border bg-muted/20 shrink-0">
                  {p.imageUrl ? <Image src={p.imageUrl} alt="" fill className="object-cover" /> : <ImageIcon className="h-5 w-5 m-auto opacity-10" />}
                </div>
                <div className="flex-1 min-w-0">
                   <p className="font-black text-[10px] uppercase truncate text-primary">{p.name}</p>
                   <p className="font-black text-primary">RD${p.salePrice}</p>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="w-full lg:w-[450px] bg-white border-l shadow-2xl flex flex-col h-[50vh] lg:h-full no-print">
        <ScrollArea className="flex-1 p-6">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-20 py-20">
               <Barcode className="h-20 w-20" />
               <p className="font-black italic">LISTO PARA COBRAR</p>
            </div>
          ) : cart.map(item => (
            <div key={item.id} className="flex justify-between items-center mb-4 p-4 border-2 rounded-2xl bg-white shadow-sm">
              <div className="flex-1 min-w-0 pr-4">
                <p className="font-black text-sm uppercase truncate">{item.name}</p>
                <p className="text-xs font-bold text-primary">RD${item.price} x {item.quantity.toFixed(1)}</p>
              </div>
              <div className="flex items-center gap-3">
                 <span className="font-black text-xl">RD${(item.amountInDop || item.price * item.quantity).toLocaleString()}</span>
                 <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setCart(cart.filter(i => i.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </ScrollArea>

        <div className="p-8 bg-muted/30 border-t space-y-4 shrink-0">
           {profile?.role === 'Admin' && cart.length > 0 && <Button variant="outline" className="w-full font-bold" disabled={committedSoFar > 0} onClick={() => { setDiscountInput(String(discountPercent || '')); setDiscountKeyInput(''); setIsDiscountOpen(true); }}><Tag className="mr-2 h-4 w-4" /> {discountPercent ? `Descuento ${discountPercent}% · Editar` : 'Aplicar descuento %'}</Button>}
           {colmado?.fiscalEnabled&&<Button variant={fiscalCustomer?'default':'outline'} className="w-full font-bold" disabled={cart.length===0||committedSoFar>0} onClick={()=>setIsFiscalCustomerOpen(true)}><Receipt className="mr-2 h-4 w-4"/>{fiscalCustomer?`Valor fiscal: ${fiscalCustomer.legalName}`:'Factura con valor fiscal'}</Button>}
           {colmado?.pharmacyEnabled === true && ['Admin', 'Cajero'].includes(profile?.role || '') && <Button variant="outline" className="w-full font-bold" disabled={cart.length === 0} onClick={() => setIsPharmacyDialogOpen(true)}><UserPlus className="mr-2 h-4 w-4" />{pharmacySelection.customerId ? `Cliente: ${pharmacySelection.customerName}` : 'Cliente de contado · Farmacia'}</Button>}
           {committedSoFar > 0 && (
              <div className="p-5 bg-white border-2 border-dashed border-primary/20 rounded-2xl space-y-2">
                 <p className="text-[10px] font-black uppercase text-muted-foreground">Pagos Parciales:</p>
                 {partialPayments.cash > 0 && <div className="flex justify-between text-xs font-bold text-emerald-600"><span>Efectivo:</span><span>RD${partialPayments.cash.toLocaleString()}</span></div>}
                 {partialPayments.card > 0 && <div className="flex justify-between text-xs font-bold text-blue-600"><span>Tarjeta:</span><span>RD${partialPayments.card.toLocaleString()}</span></div>}
                 <Separator />
                 <div className="flex justify-between items-center font-black">
                   <span className="text-[10px] uppercase">Pendiente:</span>
                   <span className="text-2xl text-primary">RD${remainingToPay.toLocaleString()}</span>
                 </div>
                 <Button variant="ghost" className="w-full h-6 text-[8px] font-black text-destructive" onClick={resetPartialPayments}>CANCELAR PAGOS PARCIALES</Button>
              </div>
           )}

           <div className="flex justify-between items-end bg-white p-6 rounded-3xl border-2 border-primary/10 shadow-inner">
              <span className="text-xs font-black uppercase text-muted-foreground">{discountAmount ? `Descuento -RD$${discountAmount.toLocaleString()} · Total` : 'Total'}</span>
              <span className="text-5xl font-black text-primary tracking-tighter">RD${subtotal.toLocaleString()}</span>
           </div>
           <div className="grid grid-cols-3 gap-2">
              <Button className="h-16 rounded-2xl font-black flex flex-col gap-1 text-[10px] uppercase" onClick={() => { setIsCashDialogOpen(true); }} disabled={cart.length === 0}>
                <Banknote className="h-5 w-5" /> <span>Efectivo</span>
              </Button>
              <Button className="h-16 rounded-2xl bg-accent text-white font-black flex flex-col gap-1 text-[10px] uppercase" onClick={() => setIsCardDialogOpen(true)} disabled={cart.length === 0}>
                <CreditCard className="h-5 w-5" /> <span>Tarjeta</span>
              </Button>
              <Button variant="outline" className="h-16 rounded-2xl border-orange-500 text-orange-600 hover:bg-orange-50 font-black flex flex-col gap-1 text-[10px] uppercase px-1" onClick={() => setIsFiadoDialogOpen(true)} disabled={cart.length === 0}>
                <UserPlus className="h-5 w-5" /> <span>Fiado</span>
              </Button>
           </div>
        </div>
      </div>

      {/* DIALOGOS DE COBRO */}
      <FiscalCustomerDialog open={isFiscalCustomerOpen} onOpenChange={setIsFiscalCustomerOpen} onSelect={setFiscalCustomer} colmadoId={profile?.colmadoId}/>
      {colmado?.pharmacyEnabled === true && profile?.colmadoId && <PharmacySaleDialog open={isPharmacyDialogOpen} onOpenChange={setIsPharmacyDialogOpen} colmadoId={profile.colmadoId} customers={customers || []} cart={cart} value={pharmacySelection} onChange={setPharmacySelection} />}
      <Dialog open={isDiscountOpen} onOpenChange={setIsDiscountOpen}><DialogContent><DialogHeader><DialogTitle>Descuento con clave maestra</DialogTitle><DialogDescription>Solo el dueño puede autorizar un descuento para este carrito.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label htmlFor="pos-discount-percent">Descuento (%)</Label><Input id="pos-discount-percent" type="number" min="0" max="99.99" step="0.01" value={discountInput} onChange={event => setDiscountInput(event.target.value)} /></div><div><Label htmlFor="pos-discount-key">Clave maestra</Label><Input id="pos-discount-key" type="password" value={discountKeyInput} onChange={event => setDiscountKeyInput(event.target.value)} /></div></div><DialogFooter><Button onClick={applyDiscount}>Aplicar al carrito</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isCashDialogOpen} onOpenChange={(open) => { setIsCashDialogOpen(open); if(!open) setCashReceived(""); }}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader><DialogTitle className="text-2xl font-black">Cobro Efectivo</DialogTitle></DialogHeader>
          <div className="py-6 space-y-6">
            <div className="p-5 bg-muted/30 rounded-2xl border-2 border-dashed flex justify-between items-center text-primary">
              <span className="text-xs font-black uppercase">Balance Pendiente</span>
              <span className="text-3xl font-black">RD${remainingToPay.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground">Efectivo Recibido</Label>
              <input type="number" className="w-full h-20 text-5xl font-black text-center border-2 border-primary/20 rounded-3xl outline-none focus:border-primary transition-all" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} autoFocus />
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
               <Button className="w-full h-16 text-lg font-black rounded-2xl bg-accent text-white" onClick={() => handleCheckout("Efectivo", { cashAmount: Number(cashReceived), isPartial: true })}>
                 APLICAR ABONO PARCIAL
               </Button>
             )}
             <Button className="w-full h-16 text-xl font-black rounded-2xl bg-primary text-white" onClick={() => handleCheckout("Efectivo", { cashAmount: remainingToPay, paidWithAmount: Number(cashReceived), changeGiven: Math.max(0, Number(cashReceived) - remainingToPay) })} disabled={!cashReceived || Number(cashReceived) < remainingToPay || isCheckoutProcessing}>
               FINALIZAR VENTA
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
               <Button className="w-full h-16 text-lg font-black rounded-2xl bg-blue-500 text-white" onClick={() => handleCheckout("Tarjeta", { cardAmount: Number(cardAmountInput), paymentRef: cardTxnNumber, isPartial: true })}>
                 APLICAR ABONO TARJETA
               </Button>
             )}
             <Button className="w-full h-16 text-xl font-black rounded-2xl bg-blue-600 text-white shadow-xl" onClick={() => handleCheckout("Tarjeta", { paymentRef: cardTxnNumber, cardAmount: Number(cardAmountInput || remainingToPay) })} disabled={!cardTxnNumber || Number(cardAmountInput || remainingToPay) < remainingToPay || isCheckoutProcessing}>
               CONFIRMAR COBRO TOTAL
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFiadoDialogOpen} onOpenChange={(open) => { setIsFiadoDialogOpen(open); if(!open) setSelectedFiadoCustomer(null); }}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader><DialogTitle className="text-2xl font-black">Cobro Fiado</DialogTitle></DialogHeader>
          <div className="py-6 space-y-6">
             <div className="p-4 bg-orange-50 border-2 border-orange-100 rounded-2xl flex justify-between items-center text-orange-700">
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
            <Button className="w-full h-16 text-xl font-black rounded-2xl bg-orange-600 text-white" onClick={() => handleCheckout("Fiado", { fiadoAmount: remainingToPay, customerId: selectedFiadoCustomer?.id })} disabled={!selectedFiadoCustomer || isCheckoutProcessing}>CARGAR A CUENTA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GASTO / REINVERSIÓN DIALOG */}
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
               <Label className="font-black text-xs uppercase text-muted-foreground">Monto Pagado de Caja (RD$)</Label>
               <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-orange-600 opacity-20">RD$</span>
                  <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} className="h-20 pl-16 text-4xl font-black border-orange-200" />
               </div>
             </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-16 font-black text-xl bg-orange-600 hover:bg-orange-700 rounded-2xl text-white" onClick={handleSaveExpense} disabled={!expenseDesc || !expenseAmount || isSavingExpense}>
              {isSavingExpense ? <Loader2 className="animate-spin" /> : "Confirmar Inversión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedProductForWeight} onOpenChange={(o) => !o && setSelectedProductForWeight(null)}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader><DialogTitle className="text-2xl font-black">Venta por Monto (RD$)</DialogTitle></DialogHeader>
          <div className="py-6 space-y-4 text-center">
             <p className="font-black text-primary uppercase text-xs">{selectedProductForWeight?.name}</p>
             <div className="space-y-2">
                <Label className="font-black text-xs uppercase text-muted-foreground">Monto en Pesos (RD$)</Label>
                <input type="number" placeholder="0.00" className="w-full h-24 text-6xl font-black text-center rounded-[2rem] border-4 outline-none focus:border-primary transition-all" value={breakdownAmount} onChange={(e) => setBreakdownAmount(e.target.value)} autoFocus />
             </div>
          </div>
          <DialogFooter><Button className="w-full h-16 font-black bg-primary text-white text-xl rounded-2xl" onClick={handleAddBreakdown} disabled={!breakdownAmount}>AÑADIR</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cierre de Caja Modal */}
      <Dialog open={isClosingOpen} onOpenChange={(open) => !open && setIsClosingOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-2xl font-black">Cierre de Turno Local</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/30 rounded-xl"><p className="text-[10px] font-black uppercase opacity-50">Esperado Efectivo</p><p className="text-lg font-black">RD${quickStats.cashWithInitial.toLocaleString()}</p></div>
              <div className="p-3 bg-blue-50 rounded-xl"><p className="text-[10px] font-black uppercase text-blue-600">Ventas Tarjeta</p><p className="text-lg font-black text-blue-700">RD${quickStats.card.toLocaleString()}</p></div>
            </div>
            <div className="space-y-3">
              <Label className="font-black text-xs uppercase">Efectivo Contado (Sencillo)</Label>
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
          <DialogFooter><Button className="w-full h-16 font-black text-xl" onClick={handleFinalizeTurno} disabled={isClosingProcess}>Finalizar Turno e Imprimir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
