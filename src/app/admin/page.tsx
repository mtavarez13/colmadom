
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import NextLink from "next/link";
import { 
  Plus, 
  Store, 
  Phone, 
  Lock, 
  Unlock,
  Search, 
  Loader2, 
  ShieldAlert, 
  TrendingUp, 
  DollarSign, 
  CheckCircle2,
  Trash2,
  Settings,
  Upload,
  Globe,
  Users,
  Share2,
  FileSpreadsheet,
  FileJson,
  Smartphone,
  Edit3,
  ChevronRight,
  ShieldCheck,
  Check,
  Printer,
  FileText,
  MonitorSmartphone,
  Save,
  UserCog,
  Package,
  AlertTriangle,
  TrendingDown,
  Target,
  BarChart3,
  History,
  MapPin,
  Link as LinkIcon,
  MessageSquare,
  CreditCard,
  Wallet,
  UserPlus,
  Trophy,
  Zap,
  Truck,
  Box,
  ChevronUp,
  X,
  UserX,
  BellRing,
  ShieldQuestion,
  RotateCcw,
  Mail,
  Shield,
  Key,
  Globe2,
  ArrowRightCircle,
  ClipboardCheck
  ,Boxes
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, increment, query, where, orderBy, getDocs, getDoc, limit, onSnapshot, arrayUnion, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { isTrialExpired } from '@/lib/subscription';
import { productBarcodes } from '@/lib/shared-catalog';
import { SaasStoreIntegrations } from '@/components/saas-store-integrations';
import { SaasRecargasAdmin } from '@/components/saas-recargas-admin';
import { SaasUsersManager } from '@/components/saas-users-manager';
import { prorate } from '@/lib/saas-billing';

export const dynamic = 'force-dynamic';

const AVAILABLE_MODULES = [
  { id: 'minimarket', label: 'Mini Market FAST' },
  { id: 'pos', label: 'Punto de Venta (POS)' },
  { id: 'driver', label: 'Panel de Repartidor' },
  { id: 'bar', label: 'Módulo Bar' },
  { id: 'orders', label: 'Pedidos Digitales' },
  { id: 'whatsapp', label: 'WhatsApp CRM' },
  { id: 'top-sellers', label: 'Ranking de Ventas' },
  { id: 'hr', label: 'Recursos Humanos' },
  { id: 'inventory', label: 'Gestión Inventario' },
  { id: 'inventory-audit', label: 'Auditoría Stock' },
  { id: 'independent-audits', label: 'Inventarios Independientes' },
  { id: 'suppliers', label: 'Proveedores y Pagos' },
  { id: 'customers', label: 'Clientes (Fiados)' },
  { id: 'expenses', label: 'Gastos y Nómina' },
  { id: 'reconciliation', label: 'Cuadre de Caja' },
  { id: 'services', label: 'Recargas/Servicios' },
  { id: 'reports', label: 'Reportes/Dashboard' },
  { id: 'insights', label: 'AI Insights' },
];
const EXTRA_ECF_TYPES=['33','34','41','43','44','45','46','47'] as const;

export default function AdminSaaSPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Form States for creation
  const [storeName, setStoreName] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeOwnerPhone, setStoreOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [storePassword, setStorePassword] = useState("");
  const [storeMasterKey, setStoreMasterKey] = useState("VIP1234");
  const [initialStatus, setInitialStatus] = useState("Trial");
  const [storeFiscalEnabled, setStoreFiscalEnabled] = useState(false);
  const [storeRnc, setStoreRnc] = useState("");
  const [storeLegalName, setStoreLegalName] = useState("");

  const independentAccountantsQuery = useMemoFirebase(() => mounted ? query(collection(db, 'userProfiles'), where('role', '==', 'ContableIndependiente')) : null, [db, mounted]);
  const { data: independentAccountants } = useCollection(independentAccountantsQuery);

  
  // States for Editing/Managing
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editWhatsApp, setEditWhatsApp] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editMasterKey, setEditMasterKey] = useState("");
  const [editStatus, setEditStatus] = useState("Active");
  const [editBusinessType, setEditBusinessType] = useState("Standard");
  const [editPharmacyEnabled, setEditPharmacyEnabled] = useState(false);
  const [editMonthlyFee, setEditMonthlyFee] = useState("1500");
  const [editIsAutonomous, setEditIsAutonomous] = useState(false);
  const [editSystemNotice, setEditSystemNotice] = useState("");
  const [editOwnerEmail, setEditOwnerEmail] = useState("");
  const [editPrinterWidth, setEditPrinterWidth] = useState<'58mm' | '80mm'>('80mm');
  const [showTrialsOnly, setShowTrialsOnly] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [editBranchLimit, setEditBranchLimit] = useState('1');
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchPrinterWidth, setBranchPrinterWidth] = useState<'58mm' | '80mm'>('80mm');
  const [additionalBranchFee, setAdditionalBranchFee] = useState('0');
  const [editFiscalEnabled, setEditFiscalEnabled] = useState(false);
  const [editFiscalMode, setEditFiscalMode] = useState('disabled');
  const [editRnc, setEditRnc] = useState('');
  const [editLegalName, setEditLegalName] = useState('');
  const [editEcfAuthorized, setEditEcfAuthorized] = useState(false);
  const [editMsellerEnvironment, setEditMsellerEnvironment] = useState('TesteCF');
  const [editEcf31NextSequence, setEditEcf31NextSequence] = useState('1');
  const [editEcf31SequenceEnd, setEditEcf31SequenceEnd] = useState('9999999999');
  const [editEcf32NextSequence, setEditEcf32NextSequence] = useState('1');
  const [editEcf32SequenceEnd, setEditEcf32SequenceEnd] = useState('9999999999');
  const [editEcfSequenceExpiry, setEditEcfSequenceExpiry] = useState('');
  const [extraEcfRanges,setExtraEcfRanges]=useState<Record<string,{next:string;end:string;expiry:string}>>({});

  useEffect(() => { setMounted(true); }, []);

  const isSuperAdmin = 
    user?.email === "admin@colmadom.com" || 
    user?.email === "martin.tavarez.gomez@gmail.com" ||
    user?.email === "tavarezgomezmartin@gmail.com";

  const colmadosQuery = useMemoFirebase(() => {
    if (!db || !isSuperAdmin) return null;
    return collection(db, "colmados");
  }, [db, isSuperAdmin]);

  const { data: allColmados, isLoading: isColmadosLoading } = useCollection(colmadosQuery);

  if (!mounted || isUserLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  if (!isSuperAdmin) return <div className="h-screen flex items-center justify-center p-8 bg-muted/30"><Card className="max-w-md w-full text-center p-10"><ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4"/><CardTitle>Acceso Restringido</CardTitle><Button variant="outline" className="mt-6" onClick={() => window.location.href = "/"}>Volver</Button></Card></div>;

  const handleCreateStore = async () => {
    if (!storeName || !storePhone || !storeOwnerPhone || !storePassword || !db) return;
    setIsSaving(true);
    const colmadoId = `colmado_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(now.getDate() + 20);
    
    const monthlyFee = Number(editMonthlyFee) || 1500;
    const colmadoData = {
      id: colmadoId,
      code: storeCode || `CLM-${Math.floor(1000 + Math.random() * 9000)}`,
      name: storeName,
      slug: storeName.toLowerCase().replace(/\s+/g, '-'),
      address: "República Dominicana",
      phoneNumber: storePhone.replace(/\D/g, ""),
      businessPhone: storePhone.replace(/\D/g, ""),
      ownerPhone: storeOwnerPhone.replace(/\D/g, ""),
      ownerEmail: ownerEmail || null,
      branchLimit: 1,
      additionalBranchFee: 0,
      rootColmadoId: colmadoId,
      serviceBalance: 0,
      subscriptionStatus: initialStatus,
      trialEndDate: trialEnd.toISOString(),
      trialEndAtMillis: trialEnd.getTime(),
      printerPaperWidth: '80mm',
      monthlyFee,
      billingMonthlyFee: monthlyFee,
      billingActivationDate: now.toISOString(),
      billingDueDay: 25,
      billingGraceDays: 5,
      billingProrationAmount: prorate(monthlyFee, now),
      billingProrationPending: true,
      billingConfigured: true,
      businessType: "Standard",
      pharmacyEnabled: false,
      masterKey: storeMasterKey,
      fiscalEnabled: storeFiscalEnabled,
      fiscalMode: storeFiscalEnabled ? 'traditional' : 'disabled',
      rnc: storeFiscalEnabled ? storeRnc.replace(/\D/g, '') : '',
      legalName: storeFiscalEnabled ? (storeLegalName.trim() || storeName) : '',
      defaultEcfType: '32', electronicIssuerAuthorized: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    setDocumentNonBlocking(doc(db, "colmados", colmadoId), colmadoData, { merge: true });

    if (ownerEmail) {
      const ownerId = `owner_${Date.now()}`;
      setDocumentNonBlocking(doc(db, "userProfiles", ownerId), {
        id: ownerId,
        colmadoId,
        email: ownerEmail.toLowerCase(),
        accessPassword: storePassword,
        role: "Admin",
        isActive: true,
        firstName: storeName,
        phoneNumber: storeOwnerPhone.replace(/\D/g, ""),
        allowedModules: AVAILABLE_MODULES.map(m => m.id),
        createdAt: now.toISOString()
      }, { merge: true });
    }

    if (user) {
      try {
        const welcomeResponse = await fetch('/api/admin/send-welcome', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() }, body: JSON.stringify({ ownerPhone: storeOwnerPhone, ownerName: storeName, name: storeName }) });
        const welcome = await welcomeResponse.json();
        if (!welcomeResponse.ok) toast({ variant: 'destructive', title: 'Negocio creado; bienvenida pendiente', description: welcome.error });
      } catch { toast({ variant: 'destructive', title: 'Negocio creado; bienvenida pendiente', description: 'Puedes reenviar el mensaje cuando el canal de WhatsApp esté disponible.' }); }
    }

    toast({ title: "Colmado Registrado", description: initialStatus === 'Trial' ? 'Inicia con 20 días de prueba.' : 'Cuenta activa.' });
    setStoreName(""); setStorePhone(""); setStoreOwnerPhone(""); setStorePassword(""); setOwnerEmail(""); setStoreFiscalEnabled(false); setStoreRnc(''); setStoreLegalName('');
    setIsSaving(false);
  };

  const handleOpenManagement = (store: any) => {
    setSelectedStore(store);
    setEditName(store.name || "");
    setEditAddress(store.address || "");
    setEditWhatsApp(store.phoneNumber || "");
    setEditSlug(store.slug || "");
    setEditMasterKey(store.masterKey || "");
    setEditStatus(store.subscriptionStatus || "Active");
    setEditBusinessType(store.businessType || "Standard");
    setEditPharmacyEnabled(store.pharmacyEnabled === true);
    setEditMonthlyFee(store.monthlyFee?.toString() || "1500");
    setEditIsAutonomous(!!store.isAutonomous);
    setEditSystemNotice(store.systemNotice || "");
    setEditOwnerEmail(store.ownerEmail || "");
    setEditPrinterWidth(store.printerPaperWidth === '58mm' ? '58mm' : '80mm');
    setEditBranchLimit(String(store.branchLimit || 1));
    setAdditionalBranchFee(String(store.additionalBranchFee ?? 0));
    setEditFiscalEnabled(!!store.fiscalEnabled);
    setEditFiscalMode(store.fiscalMode || (store.fiscalEnabled ? 'traditional' : 'disabled'));
    setEditRnc(store.rnc || ''); setEditLegalName(store.legalName || '');
    setEditEcfAuthorized(!!store.electronicIssuerAuthorized);
    setEditMsellerEnvironment(store.msellerEnvironment || 'TesteCF');
    setEditEcf31NextSequence(String(store.ecf31NextSequence || 1));
    setEditEcf31SequenceEnd(String(store.ecf31SequenceEnd || 9999999999));
    setEditEcf32NextSequence(String(store.ecf32NextSequence || 1));
    setEditEcf32SequenceEnd(String(store.ecf32SequenceEnd || 9999999999));
    setEditEcfSequenceExpiry(store.ecfSequenceExpiry || '');
    setExtraEcfRanges(Object.fromEntries(EXTRA_ECF_TYPES.map(type=>[type,{next:String(store[`ecf${type}NextSequence`]??''),end:String(store[`ecf${type}SequenceEnd`]??''),expiry:String(store[`ecf${type}SequenceExpiry`]||'')}])));
    setBranchName(''); setBranchAddress(''); setBranchPhone(''); setBranchCode('');
    setBranchPrinterWidth(store.printerPaperWidth === '58mm' ? '58mm' : '80mm');
    setIsManagementOpen(true);
  };

  const handleUpdateProfile = () => {
    if (!selectedStore || !db) return;
    setIsSaving(true);
    updateDocumentNonBlocking(doc(db, "colmados", selectedStore.id), {
      ...(selectedStore.rootColmadoId && selectedStore.rootColmadoId !== selectedStore.id ? {} : { branchLimit: Math.max(1, Math.floor(Number(editBranchLimit) || 1)) }),
      ...(!selectedStore.rootColmadoId || selectedStore.rootColmadoId === selectedStore.id ? { additionalBranchFee: Math.max(0, Number(additionalBranchFee) || 0) } : {}),
      name: editName,
      address: editAddress,
      phoneNumber: editWhatsApp.replace(/\D/g, ""),
      slug: editSlug.toLowerCase().replace(/\s+/g, '-'),
      masterKey: editMasterKey,
      subscriptionStatus: editStatus,
      printerPaperWidth: editPrinterWidth,
      businessType: editBusinessType,
      pharmacyEnabled: editPharmacyEnabled,
      monthlyFee: Number(editMonthlyFee),
      ...(!selectedStore.rootColmadoId || selectedStore.rootColmadoId === selectedStore.id ? { billingMonthlyFee: Number(editMonthlyFee) } : {}),
      isAutonomous: editIsAutonomous,
      systemNotice: editSystemNotice,
      ownerEmail: editOwnerEmail,
      fiscalEnabled: editFiscalEnabled,
      fiscalMode: editFiscalEnabled ? editFiscalMode : 'disabled',
      rnc: editFiscalEnabled ? editRnc.replace(/\D/g, '') : '',
      legalName: editFiscalEnabled ? editLegalName.trim() : '',
      defaultEcfType: '32', electronicIssuerAuthorized: editFiscalEnabled && editEcfAuthorized,
      msellerEnvironment: editMsellerEnvironment,
      ecf31NextSequence: Math.max(1, Number(editEcf31NextSequence) || 1),
      ecf31SequenceEnd: Math.max(1, Number(editEcf31SequenceEnd) || 9999999999),
      ecf32NextSequence: Math.max(1, Number(editEcf32NextSequence) || 1),
      ecf32SequenceEnd: Math.max(1, Number(editEcf32SequenceEnd) || 9999999999),
      ecfSequenceExpiry: editEcfSequenceExpiry,
      ...Object.fromEntries(EXTRA_ECF_TYPES.flatMap(type=>{const range=extraEcfRanges[type];return range?.next&&range?.end?[[`ecf${type}NextSequence`,Math.max(1,Number(range.next))],[`ecf${type}SequenceEnd`,Math.max(1,Number(range.end))],[`ecf${type}SequenceExpiry`,range.expiry]]:[]})),
      updatedAt: new Date().toISOString()
    });

    if (!selectedStore.rootColmadoId || selectedStore.rootColmadoId === selectedStore.id) {
      allColmados?.filter(store => store.id !== selectedStore.id && store.rootColmadoId === selectedStore.id)
        .forEach(store => updateDocumentNonBlocking(doc(db, 'colmados', store.id), {
          pharmacyEnabled: editPharmacyEnabled, updatedAt: new Date().toISOString()
        }));
    }

    if (editOwnerEmail) {
      getDocs(query(collection(db, "userProfiles"), where("email", "==", editOwnerEmail.toLowerCase()), limit(1)))
        .then((snap) => {
          if (!snap.empty) {
            updateDocumentNonBlocking(doc(db, "userProfiles", snap.docs[0].id), {
              colmadoId: selectedStore.id,
              isActive: editStatus !== 'Suspended'
            });
          }
        });
    }

    toast({ title: "Cambios Guardados" });
    setIsSaving(false);
  };

  const handleCreateBranch = async () => {
    if (!selectedStore || !branchName.trim() || !branchAddress.trim() || !branchPhone.trim() || !db || !allColmados) {
      toast({ variant: 'destructive', title: 'Completa nombre, dirección y teléfono de la sucursal' });
      return;
    }
    const rootId = selectedStore.rootColmadoId || selectedStore.id;
    const root = allColmados.find(store => store.id === rootId);
    const branches = allColmados.filter(store => (store.rootColmadoId || store.id) === rootId);
    if (!root) return;
    setIsSaving(true);
    try {
      const newId = `colmado_${Math.random().toString(36).slice(2, 11)}`;
      const now = new Date().toISOString();
      const [ownerProfiles, linkedProfiles] = await Promise.all([
        getDocs(query(collection(db, 'userProfiles'), where('colmadoId', '==', rootId))),
        getDocs(query(collection(db, 'userProfiles'), where('allowedColmadoIds', 'array-contains', rootId)))
      ]);
      const admins = [...new Map<string, (typeof ownerProfiles.docs)[number]>([...ownerProfiles.docs, ...linkedProfiles.docs]
        .filter(item => item.data().role === 'Admin')
        .map(item => [item.id, item] as const)).values()];
      if (admins.length === 0) throw new Error('No hay un dueño vinculado a esta unidad.');
      const batch = writeBatch(db);
      batch.set(doc(db, 'colmados', newId), {
        id: newId, rootColmadoId: rootId, name: branchName.trim(),
        code: branchCode.trim() || `SUC-${Math.floor(1000 + Math.random() * 9000)}`,
        slug: branchName.trim().toLowerCase().replace(/\s+/g, '-'),
        address: branchAddress.trim(),
        phoneNumber: branchPhone.replace(/\D/g, ''), ownerEmail: root.ownerEmail || null,
        subscriptionStatus: root.subscriptionStatus || 'Active',
        trialEndDate: root.trialEndDate || null,
        trialEndAtMillis: root.trialEndAtMillis || null,
        printerPaperWidth: branchPrinterWidth,
        monthlyFee: 0, businessType: root.businessType || 'Standard',
        pharmacyEnabled: root.pharmacyEnabled === true,
        fiscalEnabled: !!root.fiscalEnabled, fiscalMode: root.fiscalMode || (root.fiscalEnabled ? 'traditional' : 'disabled'),
        rnc: root.rnc || '', legalName: root.legalName || root.name || '', defaultEcfType: root.defaultEcfType || '32',
        electronicIssuerAuthorized: !!root.electronicIssuerAuthorized,
        serviceBalance: 0, masterKey: root.masterKey || '', createdAt: now, updatedAt: now
      });
      batch.update(doc(db, 'colmados', rootId), { branchLimit: Math.max(root.branchLimit || 1, branches.length + 1), updatedAt: now });
      admins.forEach(item => batch.update(item.ref, { allowedColmadoIds: arrayUnion(rootId, newId) }));
      await batch.commit();
      setEditBranchLimit(String(Math.max(root.branchLimit || 1, branches.length + 1)));
      setBranchName(''); setBranchAddress(''); setBranchPhone(''); setBranchCode('');
      toast({ title: 'Sucursal habilitada', description: 'Ya tiene inventario, caja y reportes independientes.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo crear la sucursal', description: error instanceof Error ? error.message : 'Intenta de nuevo.' });
    } finally { setIsSaving(false); }
  };

  const handleRechargeBalance = () => {
    if (!selectedStore || !rechargeAmount || !db) return;
    updateDocumentNonBlocking(doc(db, "colmados", selectedStore.id), {
      serviceBalance: increment(Number(rechargeAmount)),
      updatedAt: new Date().toISOString()
    });
    toast({ title: "Cupo para Remesas Actualizado" });
    setRechargeAmount("");
  };

  const filtered = allColmados?.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (!showTrialsOnly || c.subscriptionStatus === 'Trial')) || [];
  const trialCount = allColmados?.filter(c => c.subscriptionStatus === 'Trial').length || 0;

  const handleSyncCatalogImages = async () => {
    if (!allColmados || !db) return;
    setIsSyncingCatalog(true);
    let linked = 0;
    try {
      const seen = new Set<string>();
      for (const store of allColmados) {
        const inventory = await getDocs(collection(db, 'colmados', store.id, 'products'));
        for (const product of inventory.docs) {
          const data = product.data();
          if (!data.imageUrl) continue;
          for (const barcode of productBarcodes(data)) {
            if (seen.has(barcode)) continue;
            seen.add(barcode);
            const sharedRef = doc(db, 'sharedCatalogImages', barcode);
            if ((await getDoc(sharedRef)).exists()) continue;
            await setDoc(sharedRef, { barcode, imageUrl: data.imageUrl, updatedAt: new Date().toISOString() });
            linked++;
          }
        }
      }
      toast({ title: 'Catálogo sincronizado', description: `${linked} códigos vinculados con una imagen compartida.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se completó la sincronización', description: 'Puedes volver a ejecutarla.' });
    } finally { setIsSyncingCatalog(false); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-black tracking-tight text-primary uppercase">SaaS Master</h1>
        </div>
        <div className="flex gap-2">
        <Button asChild variant="outline" className="h-12 font-bold"><NextLink href="/admin/global-inventory"><Boxes className="mr-2 h-4 w-4" />Inventario general</NextLink></Button>
        <Button asChild variant="outline" className="h-12 font-bold"><NextLink href="/admin/subscriptions"><CreditCard className="mr-2 h-4 w-4" />Contabilidad SaaS · MRR</NextLink></Button>
        <Button asChild variant="outline" className="h-12 font-bold"><NextLink href="/admin/payment-settings"><Settings className="mr-2 h-4 w-4" />Planes, módulos y farmacia</NextLink></Button>
        <Dialog>
          <DialogTrigger asChild><Button size="lg" className="gap-2 font-bold h-12 rounded-2xl shadow-xl bg-primary text-white"><Plus className="h-5 w-5" /> Registrar Nueva Unidad</Button></DialogTrigger>
          <DialogContent className="sm:max-w-2xl rounded-[2rem]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black text-primary">Alta de Negocio</DialogTitle>
              <DialogDescription className="font-bold">Define las credenciales iniciales para el nuevo propietario.</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Nombre Comercial</Label><Input placeholder="Ej: Alaska Drink" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="h-12 rounded-xl font-bold" /></div>
                 <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Teléfono del negocio</Label><Input placeholder="809..." value={storePhone} onChange={(e) => setStorePhone(e.target.value)} className="h-12 rounded-xl font-black" required /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-primary ml-1">WhatsApp del dueño</Label><Input placeholder="809..." value={storeOwnerPhone} onChange={(e) => setStoreOwnerPhone(e.target.value)} className="h-12 rounded-xl font-black" required /><p className="text-[10px] text-muted-foreground">Se usará para la bienvenida e instrucciones.</p></div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-primary ml-1">Email del Dueño (Login)</Label><Input type="email" placeholder="dueño@gmail.com" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="h-12 rounded-xl font-bold" /></div>
                 <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-primary ml-1">Contraseña de Acceso</Label><Input placeholder="****" value={storePassword} onChange={(e) => setStorePassword(e.target.value)} className="h-12 rounded-xl font-black" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Estado Inicial</Label>
                  <Select value={initialStatus} onValueChange={setInitialStatus}>
                    <SelectTrigger className="h-12 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Trial">Modo Prueba (20 Días)</SelectItem>
                      <SelectItem value="Active">Activo Full</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-destructive ml-1">Llave Maestra</Label><Input value={storeMasterKey} onChange={(e) => setStoreMasterKey(e.target.value)} className="h-12 rounded-xl font-black border-destructive/20 text-destructive" /></div>
              </div>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-4"><div className="flex items-center justify-between gap-4"><div><Label className="font-black">Configuración fiscal dominicana</Label><p className="text-xs text-muted-foreground">Opcional para este negocio.</p></div><Switch checked={storeFiscalEnabled} onCheckedChange={setStoreFiscalEnabled} /></div>{storeFiscalEnabled && <div className="grid grid-cols-2 gap-4"><Input value={storeRnc} onChange={e=>setStoreRnc(e.target.value)} placeholder="RNC"/><Input value={storeLegalName} onChange={e=>setStoreLegalName(e.target.value)} placeholder="Razón social"/></div>}</div>
            </div>
            <DialogFooter><Button onClick={handleCreateStore} disabled={isSaving} className="w-full h-14 text-lg font-black rounded-2xl bg-primary text-white shadow-xl">Activar Colmado</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </header>

      <RncDatasetAdminCard />
      <SaasUsersManager />

      <Card className="rounded-[2rem] border-2 border-blue-100 shadow-xl overflow-hidden">
        <CardHeader className="bg-blue-50"><CardTitle className="flex items-center gap-2 text-primary"><ClipboardCheck className="h-5 w-5" /> Contadores independientes</CardTitle><CardDescription>Crea sus accesos y habilita el módulo para inventariar negocios que todavía no están registrados en Colmadom Cloud.</CardDescription></CardHeader>
        <CardContent className="p-6 space-y-5"><div className="rounded-2xl bg-purple-950 text-white p-5 flex flex-wrap items-center justify-between gap-4"><div><p className="font-black">Registro exclusivo mediante Google</p><p className="text-sm text-purple-200">Comparte este enlace con el contador. Después de registrarse aparecerá aquí para habilitar su módulo.</p></div><Button asChild className="bg-purple-500 hover:bg-purple-400"><NextLink href="/login?mode=accountant" target="_blank"><UserPlus className="mr-2 h-4 w-4"/> Abrir registro de contador</NextLink></Button></div>
          <div className="space-y-2">{(independentAccountants||[]).length===0?<p className="text-sm text-muted-foreground">No hay contadores registrados con Google.</p>:(independentAccountants||[]).map(accountant=>{const enabled=accountant.allowedModules?.includes('independent-audits');return <div key={accountant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"><div><p className="font-black text-primary">{accountant.firstName} {accountant.lastName}</p><p className="text-xs text-muted-foreground">{accountant.email} · Google</p></div><div className="flex items-center gap-3"><Badge className={enabled?'bg-purple-600':'bg-black text-white'}>{enabled?'MÓDULO HABILITADO':'PENDIENTE DE HABILITAR'}</Badge><Button variant={enabled?'destructive':'default'} onClick={()=>updateDocumentNonBlocking(doc(db,'userProfiles',accountant.id),{allowedModules:enabled?[]:['independent-audits'],accountApprovalStatus:enabled?'PendingModuleApproval':'Approved',updatedAt:new Date().toISOString()})}>{enabled?'Deshabilitar módulo':'Habilitar módulo'}</Button></div></div>})}</div>
        </CardContent>
      </Card>

      <Card className="shadow-2xl border-none rounded-[2rem] overflow-hidden bg-white">
        <CardHeader className="bg-muted/10 p-8 flex flex-row items-center justify-between">
           <div className="space-y-1">
             <CardTitle className="text-2xl font-black text-primary uppercase tracking-tight">Red de Unidades</CardTitle>
             <CardDescription className="font-bold">{allColmados?.length || 0} negocios registrados en la plataforma.</CardDescription>
           </div>
           <div className="flex items-center gap-3">
             <Button variant="outline" disabled={isSyncingCatalog} onClick={handleSyncCatalogImages}>
               {isSyncingCatalog ? 'Sincronizando...' : 'Unificar imágenes existentes'}
             </Button>
             <Button variant={showTrialsOnly ? 'default' : 'outline'} onClick={() => setShowTrialsOnly(value => !value)}>
               En prueba: {trialCount}
             </Button>
           <div className="relative">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
             <Input placeholder="Buscar por nombre..." className="w-72 h-12 pl-12 rounded-2xl bg-white border-none shadow-inner font-bold" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
           </div>
           </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50 h-16">
              <TableRow>
                <TableHead className="font-black px-8 text-primary uppercase text-[10px]">Unidad / Modalidad</TableHead>
                <TableHead className="font-black text-primary uppercase text-[10px]">Estatus / Vencimiento</TableHead>
                <TableHead className="font-black text-primary uppercase text-[10px]">Balance Remesas</TableHead>
                <TableHead className="text-right font-black px-8 text-primary uppercase text-[10px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isColmadosLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-12 w-12 text-primary" /></TableCell></TableRow>
              ) : filtered.map((store) => (
                <TableRow key={store.id} className="hover:bg-muted/30 transition-colors h-24">
                  <TableCell className="font-black px-8">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black shadow-inner uppercase">{store.name?.[0]}</div>
                      <div>
                        <p className="text-sm font-black uppercase text-primary leading-none">{store.name}</p>
                        <p className="text-[10px] font-bold text-muted-foreground mt-1.5 uppercase flex items-center gap-1.5">
                          {store.businessType === 'Consignacion' ? <RotateCcw className="h-2.5 w-2.5" /> : <Store className="h-2.5 w-2.5" />}
                          {store.businessType || 'Standard'}
                        </p>
                        {store.ownerEmail && <p className="text-[10px] text-muted-foreground mt-1">Dueño: {store.ownerEmail}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                     <div className="flex flex-col gap-1">
                        <Badge className={cn(
                          "font-black text-[9px] uppercase px-3 py-1 border-none w-fit",
                          store.subscriptionStatus === 'Active' ? 'bg-emerald-500' : 
                          store.subscriptionStatus === 'Trial' && !isTrialExpired(store) ? 'bg-blue-500' : 'bg-destructive'
                        )}>
                           {isTrialExpired(store) ? 'Prueba vencida' : (store.subscriptionStatus || 'Trial')}
                        </Badge>
                        {store.subscriptionStatus === 'Trial' && store.trialEndDate && (
                          <p className="text-[9px] font-black text-muted-foreground uppercase">Expira: {mounted ? new Date(store.trialEndDate).toLocaleDateString() : '-'}</p>
                        )}
                     </div>
                  </TableCell>
                  <TableCell className="font-black text-primary text-lg">RD${(store.serviceBalance || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right px-8">
                    <Button variant="outline" className="font-black rounded-xl h-10 px-6 border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all" onClick={() => handleOpenManagement(store)}>Gestionar Unidad</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isManagementOpen} onOpenChange={setIsManagementOpen}>
        <DialogContent className="sm:max-w-6xl h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2.5rem] border-none shadow-2xl bg-white">
          {selectedStore && (
            <>
              <DialogHeader className="p-8 bg-primary text-white shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner"><Store className="h-8 w-8 text-white" /></div>
                    <div>
                      <DialogTitle className="text-3xl font-black uppercase tracking-tight">{selectedStore.name}</DialogTitle>
                      <DialogDescription className="text-white/70 font-bold uppercase tracking-widest text-[10px]">Administración Maestra & bull; {selectedStore.code}</DialogDescription>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setIsManagementOpen(false)}><X className="h-6 w-6" /></Button>
                </div>
              </DialogHeader>
              
              <div className="flex-1 overflow-hidden flex flex-col bg-white">
                <Tabs defaultValue="profile" className="flex-1 flex flex-col overflow-hidden">
                   <TabsList className="grid grid-cols-9 mb-0 shrink-0 h-16 bg-muted/20 rounded-none px-6 gap-2">
                     <TabsTrigger value="profile" className="font-black text-[10px] uppercase data-[state=active]:bg-primary data-[state=active]:text-white rounded-xl">Configuración</TabsTrigger>
                     <TabsTrigger value="subscription" className="font-black text-[10px] uppercase data-[state=active]:bg-destructive data-[state=active]:text-white rounded-xl bg-destructive/10 text-destructive">Suspensión / Avisos</TabsTrigger>
                     <TabsTrigger value="users" className="font-black text-[10px] uppercase data-[state=active]:bg-primary data-[state=active]:text-white rounded-xl">Usuarios / Accesos</TabsTrigger>
                     <TabsTrigger value="wallet" className="font-black text-[10px] uppercase data-[state=active]:bg-primary data-[state=active]:text-white rounded-xl">Cupo Remesas</TabsTrigger>
                     <TabsTrigger value="hardware" className="font-black text-[10px] uppercase data-[state=active]:bg-primary data-[state=active]:text-white rounded-xl">Hardware</TabsTrigger>
                     <TabsTrigger value="fiscal" className="font-black text-[10px] uppercase data-[state=active]:bg-primary data-[state=active]:text-white rounded-xl">DGII</TabsTrigger>
                     <TabsTrigger value="whatsapp-api" className="font-black text-[10px] uppercase data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-xl bg-emerald-50 text-emerald-800">WhatsApp API</TabsTrigger>
                     <TabsTrigger value="bencash" className="font-black text-[10px] uppercase data-[state=active]:bg-accent data-[state=active]:text-white rounded-xl">Bencash API</TabsTrigger>
                     <TabsTrigger value="recargas" className="font-black text-[10px] uppercase data-[state=active]:bg-orange-600 data-[state=active]:text-white rounded-xl">Recargas</TabsTrigger>
                   </TabsList>
                   
                   <div className="flex-1 overflow-hidden">
                     <ScrollArea className="h-full">
                       <TabsContent value="profile" className="h-full p-8 flex flex-col overflow-hidden">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-10">
                            <div className="space-y-6">
                              <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2"><Store className="h-3 w-3" /> Nombre Comercial</Label>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-14 rounded-2xl font-black text-xl border-2 shadow-sm" />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2"><Mail className="h-3 w-3" /> Correo del Dueño</Label>
                                <Input value={editOwnerEmail} onChange={(e) => setEditOwnerEmail(e.target.value)} className="h-14 rounded-2xl font-bold border-2" />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Modalidad</Label>
                                  <Select value={editBusinessType} onValueChange={setEditBusinessType}>
                                    <SelectTrigger className="h-12 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Standard">Standard</SelectItem>
                                      <SelectItem value="Consignacion">Consignación</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Mensualidad (RD$)</Label>
                                  <Input type="number" value={editMonthlyFee} onChange={(e) => setEditMonthlyFee(e.target.value)} className="h-12 rounded-xl font-black text-primary" />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label>Impresora de tickets</Label>
                                <Select value={editPrinterWidth} onValueChange={(value) => setEditPrinterWidth(value as '58mm' | '80mm')}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="80mm">80 mm</SelectItem><SelectItem value="58mm">58 mm</SelectItem></SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                                <div><Label className="font-bold">Ventas de farmacia a clientes registrados</Label><p className="text-xs text-muted-foreground">Habilita en POS y Mini Market el registro de pautas y la vista de reposición para el dueño.</p></div>
                                <Switch checked={editPharmacyEnabled} onCheckedChange={setEditPharmacyEnabled} />
                              </div>
                            </div>
                            <div className="space-y-6">
                              <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-destructive tracking-widest flex items-center gap-2"><Lock className="h-3 w-3" /> Llave Maestra</Label>
                                <Input value={editMasterKey} onChange={(e) => setEditMasterKey(e.target.value)} className="h-14 rounded-2xl font-black border-destructive/20 text-destructive bg-destructive/5 text-xl" />
                              </div>
                              <div className="p-6 bg-purple-50 rounded-[2rem] border-2 border-purple-100 flex items-center justify-between">
                                 <div className="flex items-center gap-4">
                                    <Zap className="h-5 w-5 text-purple-600" />
                                    <div className="space-y-0.5">
                                      <p className="font-black text-xs text-purple-900 uppercase">Modo Autónomo</p>
                                      <p className="text-[9px] font-bold text-purple-600">Gastos sin auditoría central.</p>
                                    </div>
                                 </div>
                                 <Switch checked={editIsAutonomous} onCheckedChange={setEditIsAutonomous} />
                              </div>
                            </div>
                          </div>
                          {(!selectedStore.rootColmadoId || selectedStore.rootColmadoId === selectedStore.id) && <div className="rounded-2xl border p-5 space-y-5 mb-6">
                            <div>
                              <h4 className="font-bold text-lg">Sucursales</h4>
                              <p className="text-sm text-muted-foreground">Cada sucursal tiene inventario, caja y reportes independientes. El dueño puede cambiar entre ellas.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl bg-muted/20 p-4">
                              <div className="space-y-2"><Label>Plan principal por mes (RD$)</Label><Input type="number" min="0" value={editMonthlyFee} onChange={e => setEditMonthlyFee(e.target.value)} /></div>
                              <div className="space-y-2"><Label>Adicional por cada sucursal al mes (RD$)</Label><Input type="number" min="0" value={additionalBranchFee} onChange={e => setAdditionalBranchFee(e.target.value)} /></div>
                              <p className="md:col-span-2 text-sm font-semibold">Total estimado: RD${((Number(editMonthlyFee) || 0) + Math.max(0, (allColmados?.filter(store => (store.rootColmadoId || store.id) === selectedStore.id).length || 1) - 1) * (Number(additionalBranchFee) || 0)).toLocaleString()} al mes · {allColmados?.filter(store => (store.rootColmadoId || store.id) === selectedStore.id).length || 1} locales</p>
                              <p className="md:col-span-2 text-xs text-muted-foreground">Guarda la unidad para aplicar estos precios.</p>
                            </div>
                            <div className="space-y-3">
                              <h5 className="font-bold">Abrir otra sucursal</h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input aria-label="Nombre de la sucursal" placeholder="Nombre de la sucursal *" value={branchName} onChange={e => setBranchName(e.target.value)} />
                                <Input aria-label="Código de la sucursal" placeholder="Código interno (opcional)" value={branchCode} onChange={e => setBranchCode(e.target.value)} />
                                <Input aria-label="Dirección de la sucursal" placeholder="Dirección completa *" value={branchAddress} onChange={e => setBranchAddress(e.target.value)} />
                                <Input aria-label="Teléfono de la sucursal" placeholder="Teléfono de contacto *" value={branchPhone} onChange={e => setBranchPhone(e.target.value)} />
                              </div>
                              <div className="flex flex-wrap items-center gap-3"><Label>Impresora</Label><Select value={branchPrinterWidth} onValueChange={value => setBranchPrinterWidth(value as '58mm' | '80mm')}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="80mm">80 mm</SelectItem><SelectItem value="58mm">58 mm</SelectItem></SelectContent></Select></div>
                              <Button onClick={handleCreateBranch} disabled={isSaving || !branchName.trim() || !branchAddress.trim() || !branchPhone.trim()}>Crear sucursal</Button>
                            </div>
                            <div className="space-y-2"><Label>Locales autorizados (incluye el principal)</Label><Input type="number" min="1" step="1" value={editBranchLimit} onChange={e => setEditBranchLimit(e.target.value)} /><p className="text-xs text-muted-foreground">Al crear una sucursal se aumenta este número automáticamente. Puedes fijar un cupo mayor para el futuro.</p></div>
                          </div>}
                          <Button onClick={handleUpdateProfile} className="w-full h-16 text-xl font-black rounded-2xl bg-primary text-white shadow-2xl" disabled={isSaving}>
                            {isSaving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />} Guardar Unidad
                          </Button>
                       </TabsContent>

                       <TabsContent value="fiscal" className="h-full p-8 space-y-6">
                         <div><h3 className="text-2xl font-black text-primary">DGII y facturación electrónica</h3><p className="text-sm text-muted-foreground">El administrador puede activar o actualizar el perfil fiscal del negocio seleccionado.</p></div>
                         <div className="rounded-2xl border p-6 space-y-5"><div className="flex items-center justify-between"><div><Label className="font-black">Activar funciones fiscales</Label><p className="text-xs text-muted-foreground">NCF, ITBIS, formularios y e-CF.</p></div><Switch checked={editFiscalEnabled} onCheckedChange={setEditFiscalEnabled}/></div>
                         {editFiscalEnabled && <><div className="grid md:grid-cols-2 gap-4"><div><Label>RNC / cédula fiscal</Label><Input value={editRnc} onChange={e=>setEditRnc(e.target.value)}/></div><div><Label>Razón social</Label><Input value={editLegalName} onChange={e=>setEditLegalName(e.target.value)}/></div></div><div><Label>Modalidad</Label><Select value={editFiscalMode} onValueChange={setEditFiscalMode}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="traditional">NCF tradicional</SelectItem><SelectItem value="ecf-test">e-CF pre-certificación</SelectItem><SelectItem value="ecf-production">e-CF producción</SelectItem></SelectContent></Select></div>{editFiscalMode.startsWith('ecf-')&&<div className="space-y-4"><label className="flex gap-3"><Checkbox checked={editEcfAuthorized} onCheckedChange={v=>setEditEcfAuthorized(v===true)}/><span><b>Emisor electrónico autorizado por DGII</b><small className="block text-muted-foreground">Requiere certificado y rangos e-NCF del contribuyente.</small></span></label><div><Label>Ambiente mSeller</Label><Select value={editMsellerEnvironment} onValueChange={setEditMsellerEnvironment}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="TesteCF">Pruebas</SelectItem><SelectItem value="CerteCF">Certificación</SelectItem><SelectItem value="eCF">Producción</SelectItem></SelectContent></Select></div><div className="grid md:grid-cols-3 gap-3"><Input type="number" value={editEcf31NextSequence} onChange={e=>setEditEcf31NextSequence(e.target.value)} placeholder="Próximo E31"/><Input type="number" value={editEcf31SequenceEnd} onChange={e=>setEditEcf31SequenceEnd(e.target.value)} placeholder="Último E31"/><Input type="number" value={editEcf32NextSequence} onChange={e=>setEditEcf32NextSequence(e.target.value)} placeholder="Próximo E32"/><Input type="number" value={editEcf32SequenceEnd} onChange={e=>setEditEcf32SequenceEnd(e.target.value)} placeholder="Último E32"/><Input value={editEcfSequenceExpiry} onChange={e=>setEditEcfSequenceExpiry(e.target.value)} placeholder="Vence 31-12-2026"/></div><div className="rounded-xl border p-4 space-y-3"><b>Rangos autorizados para documentos especiales</b>{EXTRA_ECF_TYPES.map(type=><div key={type} className="grid md:grid-cols-4 gap-2 items-center"><Label>Tipo {type}</Label><Input type="number" value={extraEcfRanges[type]?.next||''} onChange={e=>setExtraEcfRanges(v=>({...v,[type]:{...(v[type]||{end:'',expiry:''}),next:e.target.value}}))} placeholder="Próximo"/><Input type="number" value={extraEcfRanges[type]?.end||''} onChange={e=>setExtraEcfRanges(v=>({...v,[type]:{...(v[type]||{next:'',expiry:''}),end:e.target.value}}))} placeholder="Último"/><Input value={extraEcfRanges[type]?.expiry||''} onChange={e=>setExtraEcfRanges(v=>({...v,[type]:{...(v[type]||{next:'',end:''}),expiry:e.target.value}}))} placeholder="Vence dd-MM-aaaa"/></div>)}</div></div>}</>}
                         <Button onClick={handleUpdateProfile} className="w-full h-14 font-black" disabled={isSaving}>Guardar perfil fiscal</Button></div>
                         <SaasStoreIntegrations colmadoId={selectedStore.id} />
                       </TabsContent>

                       <TabsContent value="whatsapp-api" className="h-full p-8 space-y-6">
                         <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5"><h3 className="text-2xl font-black text-emerald-900">WhatsApp Cloud API</h3><p className="mt-1 text-sm text-emerald-800">Coloca aquí el WABA ID, Phone Number ID, token permanente, App Secret y token de verificación del webhook para el colmado seleccionado.</p></div>
                         <SaasStoreIntegrations colmadoId={selectedStore.id} />
                       </TabsContent>

                       <TabsContent value="subscription" className="h-full p-8 flex flex-col space-y-8">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <div className="space-y-6 text-center py-10">
                                <div className="h-20 w-20 bg-destructive/10 rounded-[2rem] flex items-center justify-center mx-auto text-destructive border-2 border-destructive/20">
                                   <AlertTriangle className="h-10 w-10" />
                                </div>
                                <h3 className="text-2xl font-black uppercase text-primary">Estatus del Servicio</h3>
                                <Select value={editStatus} onValueChange={setEditStatus}>
                                   <SelectTrigger className="h-16 rounded-2xl font-black text-lg text-center border-4">
                                      <SelectValue />
                                   </SelectTrigger>
                                   <SelectContent>
                                      <SelectItem value="Active">ACTIVO (Full Access)</SelectItem>
                                      <SelectItem value="Trial">PERIODO PRUEBA</SelectItem>
                                      <SelectItem value="Pending">PENDIENTE PAGO</SelectItem>
                                      <SelectItem value="Suspended">SUSPENDIDO (Bloqueado)</SelectItem>
                                   </SelectContent>
                                </Select>
                             </div>
                             <div className="space-y-4 bg-muted/20 p-8 rounded-[2.5rem] border-2 border-dashed">
                                <div className="flex items-center gap-3"><BellRing className="h-6 w-6 text-primary" /><h3 className="text-xl font-black uppercase text-primary">Aviso Global</h3></div>
                                <Textarea placeholder="Ej: Su pago está vencido..." className="min-h-[150px] rounded-2xl p-5 border-2" value={editSystemNotice} onChange={(e) => setEditSystemNotice(e.target.value)} />
                             </div>
                          </div>
                          <Button onClick={handleUpdateProfile} className="w-full h-16 text-xl font-black rounded-2xl bg-destructive text-white" disabled={isSaving}>Aplicar Cambios y Notificar</Button>
                       </TabsContent>

                       <TabsContent value="users" className="h-full p-0">
                          <UserManagementTab colmadoId={selectedStore.id} />
                       </TabsContent>

                       <TabsContent value="wallet" className="h-full p-8 flex flex-col justify-center items-center">
                          <div className="max-w-2xl w-full space-y-10">
                             <div className="p-12 bg-primary/5 rounded-[3rem] border-4 border-dashed border-primary/20 text-center">
                                <Wallet className="h-12 w-12 text-primary mx-auto mb-6" />
                                <p className="text-7xl font-black text-primary">RD${(selectedStore.serviceBalance || 0).toLocaleString()}</p>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-4">Fondo para Envíos de Remesas</p>
                             </div>
                             <div className="flex gap-4 p-4 bg-muted/20 rounded-[2rem] border">
                                <input type="number" placeholder="Monto de cupo..." value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} className="w-full h-16 pl-6 text-2xl font-black rounded-2xl outline-none" />
                                <Button onClick={handleRechargeBalance} className="h-16 px-10 rounded-2xl font-black text-lg bg-primary">Abonar Cupo</Button>
                             </div>
                          </div>
                       </TabsContent>

                       <TabsContent value="hardware" className="h-full p-8 space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <Card className="p-8 border-none shadow-xl rounded-[2.5rem] bg-white border-t-8 border-t-emerald-500">
                                <div className="flex items-start justify-between">
                                   <div className="flex items-center gap-5">
                                      <FileText className="h-8 w-8 text-emerald-600" />
                                      <div className="space-y-1"><p className="font-black text-xl text-primary uppercase">Impresión PDF</p><p className="text-xs font-bold text-muted-foreground">Tickets locales automáticos.</p></div>
                                   </div>
                                   <Switch checked={!!selectedStore.allowLocalPdf} onCheckedChange={(val) => updateDocumentNonBlocking(doc(db, "colmados", selectedStore.id), { allowLocalPdf: val })} />
                                </div>
                             </Card>
                             <Card className="p-8 border-none shadow-xl rounded-[2.5rem] bg-white border-t-8 border-t-blue-600">
                                <div className="flex items-start justify-between">
                                   <div className="flex items-center gap-5">
                                      <Smartphone className="h-8 w-8 text-blue-600" />
                                      <div className="space-y-1"><p className="font-black text-xl text-primary uppercase">Canal Kiosko</p><p className="text-xs font-bold text-muted-foreground">Receptor remoto en tiempo real.</p></div>
                                   </div>
                                   <Switch checked={!!selectedStore.allowRemotePrinting} onCheckedChange={(val) => updateDocumentNonBlocking(doc(db, "colmados", selectedStore.id), { allowRemotePrinting: val })} />
                                </div>
                             </Card>
                          </div>
                       </TabsContent>

                       <TabsContent value="bencash" className="h-full p-8 space-y-8">
                          <div className="max-w-4xl mx-auto space-y-8">
                            <Alert className="bg-accent/10 border-accent/20">
                               <Globe2 className="h-5 w-5 text-accent" />
                               <AlertTitle className="font-black uppercase text-xs">Integración de Remesas Bencash</AlertTitle>
                               <AlertDescription className="text-xs font-bold">
                                  La conexión está configurada exclusivamente para el canal de depósitos/remesas. El balance maestro en Bencash debe ser monitoreado desde su panel oficial.
                               </AlertDescription>
                            </Alert>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                               <Card className="rounded-3xl border-2 shadow-sm p-6 space-y-4">
                                  <div className="flex items-center gap-3">
                                     <div className="h-10 w-10 bg-muted rounded-xl flex items-center justify-center"><Key className="h-5 w-5 text-muted-foreground" /></div>
                                     <p className="font-black text-xs uppercase tracking-widest">Estado del Canal</p>
                                  </div>
                                  <div className="flex items-center justify-between bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                                     <span className="text-xs font-bold text-emerald-800">API de Remesas</span>
                                     <Badge className="bg-emerald-500 font-black">ACTIVA</Badge>
                                  </div>
                                  <p className="text-[9px] font-bold text-muted-foreground italic uppercase">URL: https://reseller.test.bencashgroup.com</p>
                               </Card>

                               <Card className="rounded-3xl border-2 shadow-sm p-6 space-y-4">
                                  <div className="flex items-center gap-3">
                                     <div className="h-10 w-10 bg-muted rounded-xl flex items-center justify-center"><ShieldCheck className="h-5 w-5 text-muted-foreground" /></div>
                                     <p className="font-black text-xs uppercase tracking-widest">Seguridad HMAC</p>
                                  </div>
                                  <div className="p-4 bg-muted/30 rounded-2xl border-2 border-dashed">
                                     <p className="text-[10px] font-mono break-all opacity-40">skml: {process.env.BENCASH_PRIVATE_KEY ? 'CONECTADO-CIFRADO' : 'PENDIENTE-CONFIG'}</p>
                                  </div>
                                  <p className="text-[9px] font-bold text-muted-foreground italic uppercase">Firma SHA256 para envíos seguros</p>
                               </Card>
                            </div>
                            
                            <Card className="rounded-3xl border-2 border-primary/10 overflow-hidden">
                               <CardHeader className="bg-primary/5 p-6 border-b">
                                  <CardTitle className="text-sm font-black uppercase">Panel de Control de Proveedor</CardTitle>
                               </CardHeader>
                               <CardContent className="p-6">
                                  <p className="text-sm font-bold text-muted-foreground mb-6">Utiliza el panel oficial para visualizar el balance maestro de remesas y el log de peticiones firmadas.</p>
                                  <Button className="w-full h-14 font-black rounded-xl gap-2" onClick={() => window.open('https://sellertest.bencashgroup.com', '_blank')}>
                                     Abrir Panel Bencash <ArrowRightCircle className="h-5 w-5" />
                                  </Button>
                                </CardContent>
                            </Card>
                          </div>
                       </TabsContent>
                       <TabsContent value="recargas" className="h-full p-0">
                         <SaasRecargasAdmin colmadoId={selectedStore.rootColmadoId || selectedStore.id} colmadoName={selectedStore.name || selectedStore.businessName || selectedStore.id} />
                       </TabsContent>
                       <ScrollBar orientation="vertical" />
                     </ScrollArea>
                   </div>
                </Tabs>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RncDatasetAdminCard() {
  const { user } = useUser();
  const { toast } = useToast();
  const [status, setStatus] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const loadStatus = useCallback(async () => {
    if (!user) return;
    const response = await fetch('/api/admin/rnc-dataset', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (response.ok) setStatus(await response.json());
  }, [user]);
  useEffect(() => { loadStatus().catch(() => undefined); }, [loadStatus]);
  const execute = async (mode: 'upload' | 'sync') => {
    if (!user || (mode === 'upload' && !file)) return;
    setBusy(true);
    setUploadProgress(0);
    try {
      const token = await user.getIdToken();
      const readResult = async (response: Response) => {
        const text = await response.text();
        try { return JSON.parse(text); }
        catch { return { error: `El servidor rechazó la carga (HTTP ${response.status}). Intenta nuevamente; el sistema continuará enviando bloques pequeños.` }; }
      };
      let response: Response;
      let result: any;
      if (mode === 'upload' && file && /\.(txt|csv)$/i.test(file.name)) {
        const chunkSize = 3 * 1024 * 1024;
        const chunks = Math.ceil(file.size / chunkSize);
        response = await fetch('/api/admin/rnc-dataset?action=start', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, size: file.size, chunks }) });
        result = await readResult(response);
        if (!response.ok) throw new Error(result.error || 'No se pudo iniciar la carga.');
        let records = 0;
        for (let index = 0; index < chunks; index++) {
          const block = await file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)).arrayBuffer();
          const bytes = new Uint8Array(block);
          for (let position = 0; position < bytes.length; position++) if (bytes[position] === 10) records++;
          response = await fetch(`/api/admin/rnc-dataset?action=chunk&session=${encodeURIComponent(result.sessionId)}&index=${index}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: block });
          const chunkResult = await readResult(response);
          if (!response.ok) throw new Error(chunkResult.error || `No se pudo subir el bloque ${index + 1}.`);
          setUploadProgress(Math.round(((index + 1) / chunks) * 95));
        }
        response = await fetch('/api/admin/rnc-dataset?action=complete', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: result.sessionId, records }) });
        result = await readResult(response);
      } else {
        const options: RequestInit = mode === 'upload'
          ? { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: (() => { const form = new FormData(); form.append('file', file!); return form; })() }
          : { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) };
        response = await fetch('/api/admin/rnc-dataset', options);
        result = await readResult(response);
      }
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar el listado.');
      setUploadProgress(100); setStatus(result); setFile(null);
      toast({ title: 'Listado RNC actualizado', description: `${Number(result.records || 0).toLocaleString()} contribuyentes disponibles.` });
    } catch (error) { toast({ variant: 'destructive', title: 'No se pudo actualizar RNC', description: error instanceof Error ? error.message : '' }); }
    finally { setBusy(false); }
  };
  return <Card className="rounded-[2rem] border-2 border-emerald-100 shadow-xl overflow-hidden"><CardHeader className="bg-emerald-50"><CardTitle className="flex items-center gap-2 text-emerald-900"><FileSpreadsheet className="h-5 w-5"/> Base oficial de RNC</CardTitle><CardDescription>Administra el archivo usado para completar automáticamente los datos de empresas en POS y Mini Market.</CardDescription></CardHeader><CardContent className="p-6 space-y-5"><div className="grid gap-4 md:grid-cols-[1fr_auto]"><div className="rounded-2xl border bg-white p-4"><p className="font-black text-sm">{status?.configured ? status.fileName : 'Se usará la descarga oficial automática de DGII'}</p><p className="text-xs text-muted-foreground mt-1">{status?.updatedAt ? `Actualizado: ${new Date(status.updatedAt).toLocaleString()} · ${Number(status.records || 0).toLocaleString()} registros · ${status.format}` : 'Puedes descargar y activar ahora el listado oficial.'}</p></div><Button onClick={()=>execute('sync')} disabled={busy} className="h-full min-h-14 bg-emerald-700 hover:bg-emerald-800">{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<RotateCcw className="mr-2 h-4 w-4"/>}Actualizar desde DGII</Button></div><div className="rounded-2xl border-2 border-dashed p-5 space-y-3"><Label htmlFor="rnc-dataset-file" className="font-black">Subir archivo oficial ZIP, TXT o CSV</Label><Input id="rnc-dataset-file" type="file" accept=".zip,.txt,.csv" disabled={busy} onChange={event=>{setFile(event.target.files?.[0]||null);setUploadProgress(0);}}/><Button variant="outline" onClick={()=>execute('upload')} disabled={busy||!file}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Upload className="mr-2 h-4 w-4"/>}{busy&&uploadProgress ? `Subiendo ${uploadProgress}%` : 'Subir y activar archivo RNC'}</Button>{busy&&uploadProgress>0&&<div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-600 transition-all" style={{width:`${uploadProgress}%`}}/></div>}<p className="text-xs text-muted-foreground">Los TXT y CSV grandes se envían por bloques para evitar el límite de carga de Hostinger. No cierres esta página hasta llegar al 100 %.</p></div></CardContent></Card>;
}

function UserManagementTab({ colmadoId }: { colmadoId: string }) {
  const db = useFirestore();
  const { user: signedInUser } = useUser();
  const { toast } = useToast();
  const [selectedUserForModules, setSelectedUserForModules] = useState<any>(null);
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState('Cajero');
  const [creatingStaff, setCreatingStaff] = useState(false);

  const createBranchStaff = async () => {
    if (!signedInUser || !staffName.trim() || !staffPhone.trim() || staffPassword.length < 4) return;
    setCreatingStaff(true);
    try {
      const response = await fetch('/api/phone-auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await signedInUser.getIdToken()}` },
        body: JSON.stringify({ action: 'createStaff', colmadoId, name: staffName.trim(), phone: staffPhone, password: staffPassword,
          role: staffRole, allowedModules: staffRole === 'Driver' ? ['driver'] : staffRole === 'Supervisor' ? AVAILABLE_MODULES.map(item => item.id) : ['pos', 'minimarket'] })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo crear el usuario.');
      setStaffName(''); setStaffPhone(''); setStaffPassword('');
      toast({ title: 'Usuario creado para esta sucursal' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo crear el usuario', description: error instanceof Error ? error.message : '' });
    } finally { setCreatingStaff(false); }
  };

  const usersQuery = useMemoFirebase(() => query(collection(db, "userProfiles"), where("colmadoId", "==", colmadoId)), [db, colmadoId]);
  const { data: rawUsers, isLoading } = useCollection(usersQuery);
  const credentialsQuery = useMemoFirebase(() => query(collection(db, 'phoneCredentials'), where('colmadoId', '==', colmadoId)), [db, colmadoId]);
  const { data: credentials, error: credentialsError } = useCollection(credentialsQuery, { permissionErrorIsLocal: true });

  const users = useMemo(() => {
    if (!rawUsers) return [];
    const byIdentity = new Map<string, any>();
    for (const candidate of rawUsers.filter(u => u.email !== "jhendersonramirez@gmail.com")) {
      const key = candidate.phoneNumber || candidate.email || candidate.id;
      const current = byIdentity.get(key);
      const canonicalUid = credentials?.find(item => item.phoneNumber === candidate.phoneNumber)?.uid;
      if (!current || candidate.id === canonicalUid) byIdentity.set(key, candidate);
    }
    return [...byIdentity.values()];
  }, [rawUsers, credentials]);

  const toggleUserStatus = (user: any) => {
    updateDocumentNonBlocking(doc(db, "userProfiles", user.id), { isActive: !user.isActive, updatedAt: new Date().toISOString() });
    toast({ title: user.isActive ? "Acceso Bloqueado" : "Acceso Restaurado", variant: user.isActive ? "destructive" : "default" });
  };

  const toggleModule = (user: any, moduleId: string) => {
    const currentModules = user.allowedModules || [];
    const updated = currentModules.includes(moduleId)
      ? currentModules.filter((m: string) => m !== moduleId)
      : [...currentModules, moduleId];
    
    updateDocumentNonBlocking(doc(db, "userProfiles", user.id), { allowedModules: updated });
    if (selectedUserForModules?.id === user.id) {
      setSelectedUserForModules({ ...selectedUserForModules, allowedModules: updated });
    }
  };

  return (
    <div className="h-full flex flex-col">
       <div className="p-5 border-b space-y-3"><h4 className="font-bold">Crear usuario para esta sucursal</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Input aria-label="Nombre del usuario" placeholder="Nombre completo" value={staffName} onChange={event => setStaffName(event.target.value)} /><Input aria-label="Teléfono de acceso" placeholder="Teléfono de acceso" value={staffPhone} onChange={event => setStaffPhone(event.target.value)} /><Input aria-label="Clave de acceso" type="password" placeholder="Clave de 4 dígitos o más" value={staffPassword} onChange={event => setStaffPassword(event.target.value)} /><Select value={staffRole} onValueChange={setStaffRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Cajero">Cajero</SelectItem><SelectItem value="Supervisor">Supervisor</SelectItem><SelectItem value="Driver">Repartidor</SelectItem></SelectContent></Select></div><Button onClick={createBranchStaff} disabled={creatingStaff || !staffName.trim() || !staffPhone.trim() || staffPassword.length < 4}>Crear usuario</Button><p className="text-xs text-muted-foreground">Para elegir otra sucursal, abre esa unidad y entra en Usuarios / Accesos.</p></div>
       <div className="bg-muted/10 p-6 border-b shrink-0 flex items-center justify-between">
          <div><h4 className="font-black text-primary uppercase text-sm">Personal Vinculado</h4></div>
          <Badge className="bg-primary text-white font-black">{users?.length || 0} Usuarios</Badge>
       </div>
       {credentialsError && <p role="alert" className="px-6 py-3 text-sm text-destructive">Firebase no permite consultar las claves. Publica las reglas de Firestore incluidas con esta versión.</p>}
       <ScrollArea className="flex-1">
          <Table>
            <TableHeader className="bg-muted/30 sticky top-0 z-10"><TableRow><TableHead className="font-black uppercase text-[10px] pl-10">Nombre / Rol</TableHead><TableHead className="font-black uppercase text-[10px]">Identidad (Login)</TableHead><TableHead className="font-black uppercase text-[10px]">Estado / Módulos</TableHead><TableHead className="text-right font-black uppercase text-[10px] pr-10">Acción</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-8 w-8 text-primary opacity-20" /></TableCell></TableRow>
              ) : users?.map(u => (
                <TableRow key={u.id} className="hover:bg-muted/10">
                  <TableCell className="pl-10 py-5"><div className="flex items-center gap-4"><div className={cn("h-10 w-10 rounded-xl flex items-center justify-center font-black text-white border uppercase", u.role === 'Admin' ? 'bg-orange-500' : 'bg-primary/10 text-primary')}>{u.firstName?.[0]}</div><div><p className="font-black text-sm uppercase text-primary leading-none">{u.firstName}</p><Badge variant="outline" className="text-[8px] font-black h-4 mt-1">{u.role}</Badge></div></div></TableCell>
                  <TableCell><p className="text-[10px] font-mono font-bold text-muted-foreground uppercase">{u.phoneNumber || u.email || '---'}</p>{u.phoneNumber && <p className="text-[10px] font-mono">Clave: {credentials?.find(c => c.uid === u.id)?.accessPassword || u.accessPassword || '—'}</p>}</TableCell>
                  <TableCell>
                     <div className="flex flex-col gap-1.5">
                        <Badge className={cn("font-black text-[9px] uppercase border-none h-5 px-3 w-fit", u.isActive !== false ? 'bg-emerald-500 text-white' : 'bg-destructive text-white')}>
                           {u.isActive !== false ? 'ACTIVO' : 'BLOQUEADO'}
                        </Badge>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">{u.allowedModules?.length || 0} Módulos Activos</p>
                     </div>
                  </TableCell>
                  <TableCell className="text-right pr-10">
                    <div className="flex justify-end gap-2">
                       <Button variant="outline" size="sm" className="font-black text-[10px] uppercase rounded-xl h-9 gap-2 border-primary text-primary" onClick={() => setSelectedUserForModules(u)}>
                         <Shield className="h-3 w-3" /> Permisos
                       </Button>
                       <Button variant={u.isActive !== false ? "destructive" : "default"} size="sm" className="font-black text-[10px] uppercase rounded-xl h-9 gap-2" onClick={() => toggleUserStatus(u)}>
                         {u.isActive !== false ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                         {u.isActive !== false ? "Bloquear" : "Habilitar"}
                       </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="vertical" />
       </ScrollArea>

       <Dialog open={!!selectedUserForModules} onOpenChange={(open) => !open && setSelectedUserForModules(null)}>
         <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
           <DialogHeader className="p-8 bg-primary text-white shrink-0">
             <div className="flex items-center gap-4">
                <div className="h-14 w-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center shadow-inner">
                   <Shield className="h-7 w-7 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black uppercase">Gestionar Módulos</DialogTitle>
                  <DialogDescription className="text-white/70 font-bold uppercase text-[10px] tracking-widest">Usuario: {selectedUserForModules?.firstName}</DialogDescription>
                </div>
             </div>
           </DialogHeader>
           <ScrollArea className="max-h-[60vh] p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-8">
                 {AVAILABLE_MODULES.map((m) => (
                   <div 
                     key={m.id} 
                     className={cn(
                       "flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer group",
                       selectedUserForModules?.allowedModules?.includes(m.id) ? "border-primary bg-primary/5 shadow-sm" : "border-transparent bg-muted/30 opacity-60"
                     )}
                     onClick={() => toggleModule(selectedUserForModules, m.id)}
                   >
                      <div className="flex items-center gap-3">
                         <Checkbox checked={selectedUserForModules?.allowedModules?.includes(m.id)} onCheckedChange={() => toggleModule(selectedUserForModules, m.id)} />
                         <span className="text-xs font-black uppercase tracking-tight group-hover:text-primary transition-colors">{m.label}</span>
                      </div>
                      <Badge variant="outline" className="text-[7px] font-black h-4 px-1.5 opacity-50 uppercase">{m.id}</Badge>
                   </div>
                 ))}
              </div>
              <ScrollBar orientation="vertical" />
           </ScrollArea>
           <DialogFooter className="p-6 bg-muted/10 border-t">
              <Button className="w-full h-14 font-black text-lg bg-primary rounded-xl" onClick={() => setSelectedUserForModules(null)}>Finalizar Auditoría de Permisos</Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
    </div>
  );
}

