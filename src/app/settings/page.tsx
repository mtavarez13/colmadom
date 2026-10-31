
"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Landmark, 
  Users, 
  Plus, 
  Edit3,
  Loader2,
  Trash2,
  CheckCircle2,
  Zap,
  Phone,
  Lock,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Save,
  UserCog,
  Trophy,
  MapPin,
  IdCard,
  LocateFixed,
  Smartphone,
  RotateCcw,
  Globe,
  Camera,
  ImageIcon,
  Image as ImageIconLucide,
  Shield
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, updateDoc } from "firebase/firestore";
import { updateDocumentNonBlocking, setDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { registerDeliveryWithFirebase } from "@/lib/delivery-phone-auth";

const AVAILABLE_MODULES = [
  { id: 'minimarket', label: 'Mini Market FAST' },
  { id: 'pos', label: 'Punto de Venta (POS)' },
  { id: 'bar', label: 'Módulo Bar' },
  { id: 'orders', label: 'Pedidos Digitales' },
  { id: 'whatsapp', label: 'WhatsApp CRM' },
  { id: 'top-sellers', label: 'Ranking de Ventas' },
  { id: 'hr', label: 'Recursos Humanos' },
  { id: 'inventory', label: 'Gestión Inventario' },
  { id: 'inventory-audit', label: 'Auditoría Stock' },
  { id: 'suppliers', label: 'Proveedores y Pagos' },
  { id: 'customers', label: 'Clientes (Fiados)' },
  { id: 'expenses', label: 'Gastos y Nómina' },
  { id: 'reconciliation', label: 'Cuadre de Caja' },
  { id: 'services', label: 'Recargas/Servicios' },
  { id: 'reports', label: 'Reportes/Dashboard' },
  { id: 'insights', label: 'AI Insights' },
];

const STAFF_ROLES = ['Supervisor', 'Cajero', 'Driver', 'Contable'] as const;

export default function SettingsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isCapturingGPS, setIsCapturingGPS] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Colmado Local States
  const [colName, setColName] = useState("");
  const [colAddress, setColAddress] = useState("");
  const [colOwnerName, setColOwnerName] = useState("");
  const [colOwnerCedula, setColOwnerCedula] = useState("");
  const [ownerMarketingConsent, setOwnerMarketingConsent] = useState(false);
  const [savingMarketingConsent, setSavingMarketingConsent] = useState(false);
  const [colPhone, setColPhone] = useState("");
  const [colLat, setColLat] = useState("");
  const [colLng, setColLng] = useState("");
  const [colBusinessType, setColBusinessType] = useState("Standard");
  const [colLogoUrl, setColLogoUrl] = useState("");
  const [colBannerUrl, setColBannerUrl] = useState("");
  const [colMasterKey, setColMasterKey] = useState("");
  const [fiscalEnabled, setFiscalEnabled] = useState(false);
  const [fiscalMode, setFiscalMode] = useState("disabled");
  const [fiscalRnc, setFiscalRnc] = useState("");
  const [legalName, setLegalName] = useState("");
  const [electronicIssuerAuthorized, setElectronicIssuerAuthorized] = useState(false);
  const [msellerEnvironment, setMsellerEnvironment] = useState("TesteCF");
  const [msellerEmail, setMsellerEmail] = useState("");
  const [msellerPassword, setMsellerPassword] = useState("");
  const [msellerApiKey, setMsellerApiKey] = useState("");
  const [msellerConfigured, setMsellerConfigured] = useState(false);
  const [msellerStatus, setMsellerStatus] = useState("");
  const [isSavingMseller, setIsSavingMseller] = useState(false);
  const [isTestingMseller, setIsTestingMseller] = useState(false);
  const [ecf31NextSequence, setEcf31NextSequence] = useState("1");
  const [ecf31SequenceEnd, setEcf31SequenceEnd] = useState("9999999999");
  const [ecf32NextSequence, setEcf32NextSequence] = useState("1");
  const [ecf32SequenceEnd, setEcf32SequenceEnd] = useState("9999999999");
  const [ecfSequenceExpiry, setEcfSequenceExpiry] = useState("");

  // Form states for new user
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<(typeof STAFF_ROLES)[number]>('Cajero');
  const [staffBranchId, setStaffBranchId] = useState('');
  const [accountingBranchIds, setAccountingBranchIds] = useState<string[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>(['pos', 'minimarket', 'inventory', 'customers']);

  // Edit states
  const [isManagingModules, setIsManagingModules] = useState<any>(null);
  const [isEditingUserInfo, setIsEditingUserInfo] = useState<any>(null);

  useEffect(() => { setMounted(true); }, []);

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc(profileRef);
  const canManageStaff = profile?.role === 'Admin';
  const managedBranchIds: string[] = canManageStaff ? Array.from(new Set([profile?.colmadoId, ...(profile?.allowedColmadoIds || [])].filter(Boolean))) as string[] : [];
  const currentStaffBranchId = managedBranchIds.includes(staffBranchId) ? staffBranchId : (profile?.colmadoId || '');
  const branchesRef = useMemoFirebase(() => managedBranchIds.length > 1 ? collection(db, 'colmados') : null, [db, managedBranchIds.join('|')]);
  const { data: allBranches } = useCollection(branchesRef);

  const colmadoRef = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);
  const { data: colmado } = useDoc(colmadoRef);
  const rootRef = useMemoFirebase(() => colmado?.rootColmadoId && colmado.rootColmadoId !== colmado.id
    ? doc(db, 'colmados', colmado.rootColmadoId) : null, [db, colmado?.rootColmadoId, colmado?.id]);
  const { data: rootColmado } = useDoc(rootRef);
  useEffect(() => { setOwnerMarketingConsent((rootColmado || colmado)?.ownerMarketingConsent === true); }, [rootColmado, colmado]);

  const updateMarketingConsent = async () => {
    if (!user) return;
    setSavingMarketingConsent(true);
    try {
      const response = await fetch('/api/messaging/consent', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ enabled: ownerMarketingConsent }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar.');
      toast({ title: 'Preferencia de mensajes guardada' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo guardar la preferencia', description: error instanceof Error ? error.message : '' });
    } finally { setSavingMarketingConsent(false); }
  };

  useEffect(() => {
    if (colmado) {
      setColName(colmado.name || "");
      setColAddress(colmado.address || "");
      setColOwnerName(colmado.ownerFullName || "");
      setColOwnerCedula(colmado.ownerCedula || "");
      setColPhone(colmado.phoneNumber || "");
      setColLat(colmado.latitude?.toString() || "");
      setColLng(colmado.longitude?.toString() || "");
      setColBusinessType(colmado.businessType || "Standard");
      setColLogoUrl(colmado.logoUrl || "");
      setColBannerUrl(colmado.bannerUrl || "");
      setColMasterKey(colmado.masterKey || "");
      setFiscalEnabled(!!colmado.fiscalEnabled);
      setFiscalMode(colmado.fiscalMode || 'disabled');
      setFiscalRnc(colmado.rnc || '');
      setLegalName(colmado.legalName || '');
      setElectronicIssuerAuthorized(!!colmado.electronicIssuerAuthorized);
      setMsellerEnvironment(colmado.msellerEnvironment || 'TesteCF');
      setEcf31NextSequence(String(colmado.ecf31NextSequence || 1));
      setEcf31SequenceEnd(String(colmado.ecf31SequenceEnd || 9999999999));
      setEcf32NextSequence(String(colmado.ecf32NextSequence || 1));
      setEcf32SequenceEnd(String(colmado.ecf32SequenceEnd || 9999999999));
      setEcfSequenceExpiry(colmado.ecfSequenceExpiry || '');
    }
  }, [colmado]);


  const teamQuery = useMemoFirebase(() => {
    if (!canManageStaff || !currentStaffBranchId) return null;
    return query(collection(db, "userProfiles"), where("colmadoId", "==", currentStaffBranchId));
  }, [db, canManageStaff, currentStaffBranchId]);
  const { data: teamMembers, isLoading: isTeamLoading } = useCollection(teamQuery);
  const credentialsQuery = useMemoFirebase(() => canManageStaff && currentStaffBranchId
    ? query(collection(db, 'phoneCredentials'), where('colmadoId', '==', currentStaffBranchId)) : null,
    [db, canManageStaff, currentStaffBranchId]);
  const { data: staffCredentials, error: staffCredentialsError } = useCollection(credentialsQuery, { permissionErrorIsLocal: true });
  const visibleTeamMembers = useMemo(() => {
    const byPhone = new Map<string, any>();
    for (const member of teamMembers || []) {
      const key = member.phoneNumber || member.email || member.id;
      const current = byPhone.get(key);
      const canonicalUid = staffCredentials?.find(item => item.phoneNumber === member.phoneNumber)?.uid;
      if (!current || member.id === canonicalUid) byPhone.set(key, member);
    }
    return [...byPhone.values()];
  }, [teamMembers, staffCredentials]);

  const handleUpdate = async () => {
    if (!colmado || !db) return;
    if (profile?.role === 'Admin' && colMasterKey.trim().length < 6) {
      toast({ variant: 'destructive', title: 'Clave maestra demasiado corta', description: 'Usa al menos 6 caracteres.' });
      return;
    }
    setIsSaving(true);
    try {
    await updateDoc(doc(db, "colmados", colmado.id), { 
      name: colName, 
      address: colAddress, 
      ownerFullName: colOwnerName,
      ownerCedula: colOwnerCedula,
      phoneNumber: colPhone.replace(/\D/g, ""),
      latitude: colLat ? Number(colLat) : null,
      longitude: colLng ? Number(colLng) : null,
      businessType: colBusinessType,
      logoUrl: colLogoUrl,
      bannerUrl: colBannerUrl,
      ...(profile?.role === 'Admin' ? { masterKey: colMasterKey.trim() } : {}),
      updatedAt: new Date().toISOString() 
    });
    toast({ title: "Perfil Actualizado", description: "Los cambios se han guardado exitosamente." });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: error instanceof Error ? error.message : '' });
    } finally { setIsSaving(false); }
  };

  const handleImageUpload = (type: 'logo' | 'banner', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (type === 'logo') setColLogoUrl(dataUrl);
      else setColBannerUrl(dataUrl);
    };
  };

  const handleCaptureGPS = () => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "GPS No Soportado", description: "Tu navegador no permite geolocalización." });
      return;
    }
    setIsCapturingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setColLat(pos.coords.latitude.toString());
        setColLng(pos.coords.longitude.toString());
        setIsCapturingGPS(false);
        toast({ title: "Ubicación Capturada", description: "Coordenadas actualizadas desde tu GPS." });
      },
      (err) => {
        setIsCapturingGPS(false);
        toast({ variant: "destructive", title: "Error GPS", description: "No se pudo obtener la ubicación. Verifica los permisos." });
      }
    );
  };

  const handleAddMember = async () => {
    const emailCashier = newMemberRole === 'Cajero' && newMemberEmail.trim();
    if (!canManageStaff || !currentStaffBranchId || !newMemberName || !newMemberPassword || (!emailCashier && !newMemberPhone)) return;
    try {
      const response = await fetch(emailCashier ? '/api/staff-users' : '/api/phone-auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user?.getIdToken()}` },
        body: JSON.stringify(emailCashier
          ? { action: 'create', colmadoId: currentStaffBranchId, name: newMemberName, email: newMemberEmail, phone: newMemberPhone, password: newMemberPassword, allowedModules: selectedModules }
          : { action: 'createStaff', colmadoId: currentStaffBranchId, name: newMemberName,
              phone: newMemberPhone, password: newMemberPassword, role: newMemberRole,
              allowedColmadoIds: newMemberRole === 'Contable' ? (accountingBranchIds.length ? accountingBranchIds : [currentStaffBranchId]) : undefined,
              allowedModules: newMemberRole === 'Driver' ? ['driver'] : newMemberRole === 'Contable' ? ['inventory-audit'] : selectedModules })
      });
      const result = await response.json();
      if (!response.ok) {
        if (newMemberRole === 'Driver' && response.status >= 500) {
          if (currentStaffBranchId !== profile?.colmadoId)
            throw new Error('Abre primero esa sucursal para registrar Delivery desde esta vista local.');
          await registerDeliveryWithFirebase({ db, colmadoId: currentStaffBranchId,
            driverId: `drv_${crypto.randomUUID()}`, name: newMemberName,
            phone: newMemberPhone, password: newMemberPassword });
        } else throw new Error(result.error);
      }
      toast({ title: 'Staff Registrado' });
      setNewMemberName(''); setNewMemberEmail(''); setNewMemberPhone(''); setNewMemberPassword(''); setNewMemberRole('Cajero'); setAccountingBranchIds([]);
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo registrar', description: error instanceof Error ? error.message : '' });
    }
  };

  const handleUpdateUserInfo = async () => {
    if (!canManageStaff || !isEditingUserInfo || !STAFF_ROLES.includes(isEditingUserInfo.role)) return;
    try {
      const emailCashier = isEditingUserInfo.role === 'Cajero' && Boolean(isEditingUserInfo.email);
      const response = await fetch(emailCashier ? '/api/staff-users' : '/api/phone-auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user?.getIdToken()}` },
        body: JSON.stringify({ action: emailCashier ? 'update' : 'updateStaff', uid: isEditingUserInfo.id, name: isEditingUserInfo.firstName, colmadoId: isEditingUserInfo.colmadoId,
          phone: isEditingUserInfo.phoneNumber, password: isEditingUserInfo.accessPassword,
          role: isEditingUserInfo.role })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      toast({ title: 'Perfil Actualizado' });
      setIsEditingUserInfo(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo actualizar', description: error instanceof Error ? error.message : '' });
    }
  };

  const toggleModule = (user: any, moduleId: string) => {
    const currentModules = user.allowedModules || [];
    const updated = currentModules.includes(moduleId)
      ? currentModules.filter((m: string) => m !== moduleId)
      : [...currentModules, moduleId];
    
    updateDocumentNonBlocking(doc(db, "userProfiles", user.id), { allowedModules: updated });
    setIsManagingModules({ ...user, allowedModules: updated });
  };

  const handleDeleteMember = async (member: any) => {
    if (!canManageStaff || !user || member.id === user.uid) return;
    const emailCashier = member.role === 'Cajero' && Boolean(member.email);
    const response = await fetch(emailCashier ? '/api/staff-users' : '/api/phone-auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(emailCashier ? { action: 'delete', uid: member.id, colmadoId: member.colmadoId } : { action: 'deleteStaff', uid: member.id, phone: member.phoneNumber })
    });
    if (!response.ok) toast({ variant: 'destructive', title: 'No se pudo eliminar el usuario' });
    else toast({ title: 'Usuario eliminado' });
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <h1 className="text-3xl md:text-4xl font-black text-primary tracking-tight uppercase">Configuración de Unidad</h1>

      <Tabs defaultValue="identity">
        <TabsList className="grid grid-cols-3 mb-8 h-16 bg-muted/20 rounded-2xl p-1">
          <TabsTrigger value="identity" className="font-black uppercase text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg">Perfil del Colmado</TabsTrigger>
          <TabsTrigger value="team" disabled={!canManageStaff} className="font-black uppercase text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg">Gestión de Staff</TabsTrigger>
          <TabsTrigger value="fiscal" disabled={!canManageStaff} className="font-black uppercase text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg">Estado DGII</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-6 animate-in fade-in slide-in-from-top-2">
          <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
            <CardHeader className="bg-primary text-white p-8">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center shadow-inner">
                  <Landmark className="h-7 w-7 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black uppercase">Información del Negocio</CardTitle>
                  <CardDescription className="text-white/70 font-bold uppercase text-[10px] tracking-widest">Expediente oficial de la unidad</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-12">
              {/* IMAGENES DE IDENTIDAD */}
              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b pb-2">
                  <ImageIconLucide className="h-4 w-4" /> Identidad Visual (Marketing)
                </h3>
                <div className="grid md:grid-cols-12 gap-8">
                  <div className="md:col-span-4 space-y-3">
                    <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Logo / Perfil</Label>
                    <div className="aspect-square relative rounded-3xl border-4 border-dashed bg-muted/20 flex flex-col items-center justify-center overflow-hidden group">
                      {colLogoUrl ? (
                        <Image src={colLogoUrl} alt="Logo" fill className="object-cover" unoptimized />
                      ) : (
                        <Camera className="h-8 w-8 text-muted-foreground/30" />
                      )}
                      <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleImageUpload('logo', e)} />
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 p-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[8px] text-white font-black uppercase">Cambiar Logo</span>
                      </div>
                    </div>
                  </div>
                  <div className="md:col-span-8 space-y-3">
                    <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Portada / Banner de Catálogo</Label>
                    <div className="aspect-[21/9] relative rounded-3xl border-4 border-dashed bg-muted/20 flex flex-col items-center justify-center overflow-hidden group">
                      {colBannerUrl ? (
                        <Image src={colBannerUrl} alt="Banner" fill className="object-cover" unoptimized />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                      )}
                      <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleImageUpload('banner', e)} />
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 p-3 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-white font-black uppercase">Cambiar Portada</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {profile?.role === 'Admin' && <div className="space-y-2"><Label htmlFor="owner-master-key" className="font-black text-primary">Clave maestra del negocio</Label><Input id="owner-master-key" type="password" autoComplete="new-password" className="max-w-sm" value={colMasterKey} onChange={event => setColMasterKey(event.target.value)} /><p className="text-sm text-muted-foreground">Se usa para autorizar descuentos en el carrito. Cambia la clave inicial antes de usarla.</p></div>}

              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b pb-2">
                  <Zap className="h-4 w-4" /> Datos de Operación
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Nombre Comercial</Label>
                    <Input className="h-14 font-black text-lg border-2 rounded-2xl" value={colName} onChange={(e) => setColName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Dirección Física</Label>
                    <Input className="h-14 font-bold border-2 rounded-2xl" value={colAddress} onChange={(e) => setColAddress(e.target.value)} />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                      <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Teléfono Principal</Label>
                      <Input className="h-14 font-black text-lg border-2 rounded-2xl" value={colPhone} onChange={(e) => setColPhone(e.target.value)} />
                   </div>
                   <div className="space-y-2">
                      <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Modalidad de Negocio</Label>
                      <Select value={colBusinessType} onValueChange={setColBusinessType}>
                         <SelectTrigger className="h-14 rounded-2xl font-black uppercase">
                            <SelectValue />
                         </SelectTrigger>
                         <SelectContent>
                            <SelectItem value="Standard">NEGOCIO ESTÁNDAR</SelectItem>
                            <SelectItem value="Consignacion">NEGOCIO POR CONSIGNACIÓN</SelectItem>
                         </SelectContent>
                      </Select>
                   </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b pb-2">
                  <UserCog className="h-4 w-4" /> Información del Propietario
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Nombre Completo del Dueño</Label>
                    <Input className="h-14 font-black border-2 rounded-2xl" value={colOwnerName} onChange={(e) => setColOwnerName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Cédula de Identidad</Label>
                    <Input className="h-14 font-black border-2 rounded-2xl font-mono" value={colOwnerCedula} onChange={(e) => setColOwnerCedula(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b pb-2">
                  <MapPin className="h-4 w-4" /> Ubicación GPS (Marketing / Catálogo)
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Latitud</Label>
                    <Input className="h-14 font-mono font-bold border-2 rounded-2xl" value={colLat} onChange={(e) => setColLat(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Longitud</Label>
                    <Input className="h-14 font-mono font-bold border-2 rounded-2xl" value={colLng} onChange={(e) => setColLng(e.target.value)} />
                  </div>
                </div>
                <Button variant="outline" className="w-full md:w-auto h-12 px-6 rounded-xl font-black gap-2 border-primary text-primary" onClick={handleCaptureGPS} disabled={isCapturingGPS}>
                  {isCapturingGPS ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                  Capturar Ubicación Actual (GPS)
                </Button>
              </div>

              <div className="pt-6">
                {canManageStaff && <div className="mb-6 rounded-2xl border border-purple-200 bg-purple-50/50 p-4 space-y-3">
                  <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={ownerMarketingConsent} onChange={event => setOwnerMarketingConsent(event.target.checked)} />
                    <span><strong>Recibir consejos y recomendaciones de Colmadom Cloud</strong><small className="block text-muted-foreground">Opcional. Esta preferencia se aplica al dueño de todas las sucursales.</small></span></label>
                  <Button type="button" variant="outline" disabled={savingMarketingConsent} onClick={updateMarketingConsent}>Guardar preferencia de mensajes</Button>
                </div>}
                <Button onClick={handleUpdate} className="w-full h-16 text-xl font-black rounded-2xl shadow-xl bg-primary gap-2" disabled={isSaving}>
                  {isSaving ? <Loader2 className="animate-spin h-6 w-6" /> : <Save className="h-6 w-6" />}
                  Guardar Cambios de Perfil
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fiscal" className="space-y-6">
          <Card className="rounded-[2rem] border-none shadow-xl"><CardHeader className="bg-primary text-white rounded-t-[2rem]"><CardTitle>Estado fiscal del negocio</CardTitle><CardDescription className="text-white/70">La configuración DGII y las credenciales de mSeller son administradas exclusivamente por Colmadom Cloud SaaS.</CardDescription></CardHeader><CardContent className="p-8 space-y-4"><div className="flex flex-wrap gap-2"><Badge>{colmado?.fiscalEnabled ? 'DGII ACTIVO' : 'DGII NO HABILITADO'}</Badge>{colmado?.fiscalEnabled && <Badge variant="outline">{colmado?.fiscalMode || 'traditional'}</Badge>}{colmado?.msellerConfigured && <Badge className="bg-emerald-600">mSeller configurado</Badge>}</div><p className="text-sm text-muted-foreground">RNC: <b>{colmado?.rnc || 'Pendiente'}</b></p><p className="text-sm text-muted-foreground">Razón social: <b>{colmado?.legalName || 'Pendiente'}</b></p><Alert><ShieldCheck className="h-4 w-4"/><AlertTitle>Configuración protegida</AlertTitle><AlertDescription>Solicita al administrador SaaS cualquier activación, cambio de ambiente, secuencia o credencial.</AlertDescription></Alert></CardContent></Card>
        </TabsContent>

        {canManageStaff && <TabsContent value="team" className="space-y-8 animate-in fade-in slide-in-from-top-2">
          <Card className="p-5 flex flex-wrap items-center justify-between gap-4"><div><p className="font-black text-primary">¿Vas a registrar un repartidor?</p><p className="text-sm text-muted-foreground">Crea su acceso con teléfono y clave, y asígnale pedidos desde Repartidores y entregas.</p></div><Button asChild><Link href="/admin/go-hub">Registrar repartidor</Link></Button></Card>
          {managedBranchIds.length > 1 && <Card className="p-6 space-y-3"><Label className="font-bold">Sucursal cuyos usuarios deseas administrar</Label><Select value={currentStaffBranchId} onValueChange={setStaffBranchId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{managedBranchIds.map(id => <SelectItem key={id} value={id}>{allBranches?.find(branch => branch.id === id)?.name || (id === profile?.colmadoId ? colmado?.name : id)}</SelectItem>)}</SelectContent></Select><p className="text-sm text-muted-foreground">Los usuarios nuevos trabajarán únicamente en la sucursal seleccionada.</p></Card>}
          <Card className="border-4 border-dashed bg-primary/5 rounded-[2.5rem] overflow-hidden shadow-inner">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-xl font-black uppercase text-primary flex items-center gap-3">
                 <UserPlus className="h-6 w-6 text-accent" /> Alta de Nuevo Usuario
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 pt-0 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Nombre Completo</Label>
                  <Input placeholder="Ej: Juan El Delivery" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} className="h-14 rounded-2xl font-black text-lg border-2 shadow-sm" />
                </div>
                {newMemberRole === 'Cajero' && <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Correo para iniciar sesión</Label>
                  <Input type="email" autoComplete="email" placeholder="cajero@correo.com" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} className="h-14 rounded-2xl font-black text-lg border-2 shadow-sm" />
                </div>}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">{newMemberRole === 'Cajero' ? 'Teléfono de contacto (opcional)' : 'Teléfono (Login)'}</Label>
                  <Input placeholder="809..." value={newMemberPhone} onChange={(e) => setNewMemberPhone(e.target.value)} className="h-14 rounded-2xl font-black text-lg border-2 shadow-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">{newMemberRole === 'Cajero' && newMemberEmail ? 'Contraseña (mínimo 6 caracteres)' : 'Clave Numérica'}</Label>
                  <Input type="password" autoComplete="new-password" placeholder={newMemberRole === 'Cajero' && newMemberEmail ? 'Mínimo 6 caracteres' : '****'} value={newMemberPassword} onChange={(e) => setNewMemberPassword(e.target.value)} className="h-14 rounded-2xl font-black text-lg border-2 shadow-sm" />
                </div>
              </div>
              <div className="space-y-1.5 max-w-xs">
                <Label>Rol del usuario</Label>
                <Select value={newMemberRole} onValueChange={(value) => setNewMemberRole(value as (typeof STAFF_ROLES)[number])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAFF_ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {newMemberRole === 'Driver' ? <p className="rounded-xl bg-accent/10 p-4 text-sm font-bold text-primary">Delivery tendrá acceso únicamente a Mi Ruta (Delivery). La clave debe tener al menos 6 caracteres.</p> : newMemberRole === 'Contable' ? <div className="space-y-3 rounded-2xl bg-blue-50 p-5 border border-blue-200"><p className="font-black text-primary">Acceso contable protegido</p><p className="text-sm text-muted-foreground">Tendrá acceso exclusivamente a Auditoría de Inventario para los colmados seleccionados. Allí podrá generar PDF y registrar facturas de gastos o reinversión.</p><div className="flex flex-wrap gap-2">{managedBranchIds.map(id => { const selected=accountingBranchIds.includes(id) || (!accountingBranchIds.length && id===currentStaffBranchId); const label=allBranches?.find(branch=>branch.id===id)?.name || (id===profile?.colmadoId?colmado?.name:id); return <Badge key={id} variant={selected?'default':'outline'} className="cursor-pointer px-4 py-2" onClick={()=>setAccountingBranchIds(prev=>{const base=prev.length?prev:[currentStaffBranchId];return base.includes(id)?base.filter(x=>x!==id):[...base,id]})}>{label}</Badge>})}</div></div> : <div className="space-y-3">
                <p className="text-[10px] font-black uppercase text-primary tracking-widest ml-1">Módulos permitidos para este usuario:</p>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_MODULES.map(m => (
                    <Badge key={m.id} variant={selectedModules.includes(m.id) ? "default" : "outline"} className={cn("cursor-pointer text-[9px] h-9 uppercase font-black px-5 transition-all rounded-xl", selectedModules.includes(m.id) ? "bg-primary text-white" : "hover:bg-primary/5")} onClick={() => setSelectedModules(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])}>
                      {m.label}
                    </Badge>
                  ))}
                </div>
              </div>}
              {newMemberRole === 'Cajero' && <p className="text-sm text-muted-foreground">Si escribes un correo, el cajero iniciará sesión con correo y contraseña. Si lo dejas vacío, conservará el acceso telefónico actual.</p>}
              <Button onClick={handleAddMember} disabled={newMemberRole === 'Cajero' && newMemberEmail.trim() ? newMemberPassword.length < 6 : newMemberPassword.length < 4 || (!newMemberPhone && !(newMemberRole === 'Cajero' && newMemberEmail.trim()))} className="w-full h-16 rounded-2xl font-black uppercase text-xl shadow-2xl bg-primary text-white">Activar Acceso Staff</Button>
            </CardContent>
          </Card>

          <div className="border-2 rounded-[3rem] bg-white shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-muted/10 p-8 border-b shrink-0 flex items-center justify-between">
               <h4 className="text-xl font-black uppercase tracking-tight text-primary">Plantilla de Personal</h4>
               <Badge className="bg-primary text-white text-xs font-black h-10 px-6 rounded-2xl uppercase border-none shadow-lg">{visibleTeamMembers.length} MIEMBROS</Badge>
            </div>
            {staffCredentialsError && <p role="alert" className="px-8 py-3 text-sm text-destructive">Firebase no permite consultar las claves. Publica las reglas de Firestore incluidas con esta versión.</p>}
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader className="bg-muted/30 h-16">
                   <TableRow>
                     <TableHead className="font-black uppercase text-[10px] pl-10 text-primary">Nombre / Login</TableHead>
                     <TableHead className="font-black uppercase text-[10px] text-primary">Módulos</TableHead>
                     <TableHead className="text-right font-black uppercase text-[10px] pr-10 text-primary">Gestión</TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {isTeamLoading ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-20"><Loader2 className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
                  ) : visibleTeamMembers.map(m => (
                    <TableRow key={m.id} className="hover:bg-muted/20 transition-all h-24">
                      <TableCell className="pl-10">
                        <div className="flex items-center gap-4">
                           <div className="h-12 w-12 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-xl uppercase">{m.firstName?.[0]}</div>
                           <div>
                             <p className="font-black text-lg text-primary uppercase leading-none">{m.firstName}</p>
                             <p className="text-[10px] font-mono text-muted-foreground mt-2 uppercase">{m.role} · {m.email || m.phoneNumber || 'Sin identificador'}</p>
                             <p className="text-[10px] font-mono text-muted-foreground mt-1">{m.email ? 'Acceso mediante correo y contraseña' : `Clave: ${staffCredentials?.find(c => c.uid === m.id)?.accessPassword || m.accessPassword || '—'}`}</p>
                           </div>
                        </div>
                      </TableCell>
                      <TableCell>
                         <div className="flex flex-wrap gap-1">
                            {m.allowedModules?.slice(0, 3).map((modId: string) => (
                               <Badge key={modId} variant="secondary" className="text-[7px] uppercase font-black">{modId}</Badge>
                            ))}
                            {(m.allowedModules?.length || 0) > 3 && <Badge variant="outline" className="text-[7px] font-black">+{m.allowedModules.length - 3}</Badge>}
                         </div>
                      </TableCell>
                      <TableCell className="text-right pr-10">
                         <div className="flex justify-end gap-2">
                           {m.role !== 'Driver' && <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl border-accent text-accent font-black gap-2" onClick={() => setIsManagingModules(m)}>
                              <Shield className="h-3.5 w-3.5" /> PERMISOS
                           </Button>}
                           {STAFF_ROLES.includes(m.role) && <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl border-2 font-black" onClick={() => setIsEditingUserInfo({ ...m, accessPassword: staffCredentials?.find(c => c.uid === m.id)?.accessPassword || m.accessPassword || '' })}>DATOS</Button>}
                           <Button variant="ghost" size="icon" className="text-destructive h-10 w-10" onClick={() => handleDeleteMember(m)} disabled={m.id === user?.uid || !STAFF_ROLES.includes(m.role)}><Trash2 className="h-4 w-4" /></Button>
                         </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </TabsContent>}
      </Tabs>

      {/* MODAL EDICION USUARIO (DATOS) */}
      <Dialog open={!!isEditingUserInfo} onOpenChange={(o) => !o && setIsEditingUserInfo(null)}>
        <DialogContent className="sm:max-w-md rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase">Editar Perfil Staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {isEditingUserInfo?.id !== user?.uid && STAFF_ROLES.includes(isEditingUserInfo?.role) && <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={isEditingUserInfo?.role} onValueChange={(role) => setIsEditingUserInfo({...isEditingUserInfo, role})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STAFF_ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
              </Select>
            </div>}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Nombre</Label>
              <Input value={isEditingUserInfo?.firstName || ""} onChange={(e) => setIsEditingUserInfo({...isEditingUserInfo, firstName: e.target.value})} className="h-12 rounded-xl font-bold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Teléfono</Label>
              <Input value={isEditingUserInfo?.phoneNumber || ""} onChange={(e) => setIsEditingUserInfo({...isEditingUserInfo, phoneNumber: e.target.value})} className="h-12 rounded-xl font-black" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Nueva Clave</Label>
              <Input type="password" value={isEditingUserInfo?.accessPassword || ""} onChange={(e) => setIsEditingUserInfo({...isEditingUserInfo, accessPassword: e.target.value})} className="h-12 rounded-xl font-black" />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-14 font-black bg-primary rounded-xl" onClick={handleUpdateUserInfo}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL GESTION DE MODULOS / PERMISOS */}
      <Dialog open={!!isManagingModules} onOpenChange={(o) => !o && setIsManagingModules(null)}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
           <DialogHeader className="p-8 bg-primary text-white shrink-0">
             <div className="flex items-center gap-4">
                <div className="h-14 w-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center shadow-inner">
                   <ShieldCheck className="h-7 w-7 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black uppercase">Gestionar Permisos</DialogTitle>
                  <DialogDescription className="text-white/70 font-bold uppercase text-[10px] tracking-widest">Usuario: {isManagingModules?.firstName}</DialogDescription>
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
                       isManagingModules?.allowedModules?.includes(m.id) ? "border-primary bg-primary/5 shadow-sm" : "border-transparent bg-muted/30 opacity-60"
                     )}
                     onClick={() => toggleModule(isManagingModules, m.id)}
                   >
                      <div className="flex items-center gap-3">
                         <Checkbox checked={isManagingModules?.allowedModules?.includes(m.id)} onCheckedChange={() => toggleModule(isManagingModules, m.id)} />
                         <span className="text-xs font-black uppercase tracking-tight group-hover:text-primary transition-colors">{m.label}</span>
                      </div>
                      <Badge variant="outline" className="text-[7px] font-black h-4 px-1.5 opacity-50 uppercase">{m.id}</Badge>
                   </div>
                 ))}
              </div>
              <ScrollBar orientation="vertical" />
           </ScrollArea>
           <DialogFooter className="p-6 bg-muted/10 border-t">
              <Button className="w-full h-14 font-black text-lg bg-primary rounded-xl" onClick={() => setIsManagingModules(null)}>Finalizar Auditoría de Permisos</Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
