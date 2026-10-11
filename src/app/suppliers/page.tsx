"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Truck, 
  Search, 
  Phone, 
  Mail, 
  MapPin, 
  Plus, 
  Loader2, 
  Trash2, 
  Eye, 
  Calendar, 
  Receipt, 
  ChevronDown, 
  Package, 
  CheckCircle2, 
  Clock, 
  Wallet,
  ArrowRight,
  TrendingDown,
  FileText,
  AlertTriangle,
  Banknote,
  DollarSign,
  Briefcase,
  History,
  Building2,
  Scale,
  Info
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, orderBy } from "firebase/firestore";
import { setDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export default function SuppliersPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Modals
  const [selectedSupplierForHistory, setSelectedSupplierForHistory] = useState<any>(null);
  const [isNewSupplierDialogOpen, setIsNewSupplierDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState<any>(null);

  // Form states
  const [newName, setNewName] = useState("");
  const [newRnc, setNewRnc] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newAddress, setNewAddress] = useState("");
  
  // Payment states
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc(profileRef);

  const suppliersQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "suppliers");
  }, [db, profile?.colmadoId]);
  const { data: suppliers, isLoading: isSuppliersLoading } = useCollection(suppliersQuery);

  const entriesQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return query(
      collection(db, "colmados", profile.colmadoId, "bookkeepingEntries"),
      where("entryType", "==", "ProductExpense")
    );
  }, [db, profile?.colmadoId]);
  const { data: allPurchases, isLoading: isEntriesLoading } = useCollection(entriesQuery);

  const pendingPayables = useMemo(() => {
    if (!allPurchases) return [];
    return allPurchases.filter(p => p.paymentStatus === 'Pending' || (Number(p.amount) < 0 && !p.paymentStatus));
  }, [allPurchases]);

  const totalDebt = useMemo(() => {
    return pendingPayables.reduce((sum, p) => sum + Math.abs(Number(p.amount) || 0), 0);
  }, [pendingPayables]);

  const filteredSuppliers = suppliers?.filter(s => 
    String(s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.contactPerson && s.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const handleRegisterSupplier = () => {
    if (!profile?.colmadoId || !newName) return;
    setIsSaving(true);
    const supplierId = `supp_${Date.now()}`;
    const now = new Date().toISOString();

    const supplierData = {
      id: supplierId,
      colmadoId: profile.colmadoId,
      name: newName,
      rnc: newRnc,
      contactPerson: newContact,
      phoneNumber: newPhone,
      email: newEmail,
      address: newAddress,
      createdAt: now,
      updatedAt: now,
    };

    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "suppliers", supplierId), supplierData, { merge: true });
    toast({ title: "Proveedor Registrado" });
    resetForm();
    setIsNewSupplierDialogOpen(false);
    setIsSaving(false);
  };

  const resetForm = () => {
    setNewName(""); setNewRnc(""); setNewContact(""); setNewPhone(""); setNewEmail(""); setNewAddress("");
  };

  const handleDelete = (id: string) => {
    if (!profile?.colmadoId) return;
    deleteDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "suppliers", id));
    toast({ variant: "destructive", title: "Proveedor Eliminado" });
  };

  const handleProcessPayment = async () => {
    if (!profile?.colmadoId || !isPaymentDialogOpen || !paymentAmount) return;
    setIsProcessingPayment(true);
    
    const amount = Number(paymentAmount);
    const colmadoId = profile.colmadoId;
    const now = new Date().toISOString();

    try {
      // 1. Marcar factura como pagada (En esta versión simplificada marcamos total)
      updateDocumentNonBlocking(doc(db, "colmados", colmadoId, "bookkeepingEntries", isPaymentDialogOpen.id), {
        paymentStatus: "Paid",
        paidAt: now,
        updatedAt: now
      });

      toast({ title: "Pago Registrado", description: `Se ha liquidado la deuda de RD$${amount.toLocaleString()}.` });
      setIsPaymentDialogOpen(null);
      setPaymentAmount("");
    } catch (e) {
      toast({ variant: "destructive", title: "Error" });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-sm">
             <Truck className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary uppercase">Proveedores & Pagos</h1>
            <p className="text-sm text-muted-foreground font-bold">Gestión de abastecimiento y cuentas por pagar.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={isNewSupplierDialogOpen} onOpenChange={setIsNewSupplierDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2 bg-primary font-black h-12 rounded-xl shadow-lg">
                <Plus className="h-5 w-5" /> Nuevo Proveedor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl rounded-[2rem]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black text-primary">Registrar Entidad Comercial</DialogTitle>
                <DialogDescription className="font-bold">Añade un nuevo distribuidor a tu red de suministros.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Razón Social</Label>
                    <Input placeholder="Ej: Cervecería Nacional" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-12 rounded-xl font-bold" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">RNC / Cédula</Label>
                    <Input placeholder="1-31-..." value={newRnc} onChange={(e) => setNewRnc(e.target.value)} className="h-12 rounded-xl font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Contacto Directo</Label>
                    <Input placeholder="Nombre del preventa" value={newContact} onChange={(e) => setNewContact(e.target.value)} className="h-12 rounded-xl font-bold" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Teléfono</Label>
                    <Input placeholder="809..." value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="h-12 rounded-xl font-black" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground">Dirección / Almacén</Label>
                  <Input placeholder="Ubicación para despachos..." value={newAddress} onChange={(e) => setNewAddress(e.target.value)} className="h-12 rounded-xl font-bold" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleRegisterSupplier} className="w-full h-14 text-lg font-black bg-primary rounded-xl" disabled={isSaving}>
                  {isSaving ? <Loader2 className="animate-spin" /> : "Guardar Proveedor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-2 bg-primary text-white border-none shadow-xl overflow-hidden relative group rounded-[2rem]">
          <div className="absolute right-[-10px] top-[-10px] opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-500">
            <Scale className="h-40 w-40" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest opacity-80 text-white">Total Cuentas por Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">RD${totalDebt.toLocaleString()}</div>
            <p className="text-[10px] mt-2 opacity-70 font-bold uppercase">{pendingPayables.length} Facturas Pendientes</p>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-none rounded-[2rem] bg-white border-l-8 border-l-accent">
          <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
            <CardTitle className="text-[9px] font-black uppercase text-muted-foreground">Suministros Mes</CardTitle>
            <Package className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <p className="text-2xl font-black text-primary">{allPurchases?.length || 0}</p>
            <p className="text-[8px] font-bold text-muted-foreground uppercase mt-1">Órdenes Recibidas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid grid-cols-2 h-16 bg-muted/20 rounded-2xl p-1 mb-8">
          <TabsTrigger value="list" className="font-black uppercase text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg">
            <Building2 className="mr-2 h-4 w-4" /> Directorio de Proveedores
          </TabsTrigger>
          <TabsTrigger value="payables" className="font-black uppercase text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg">
            <Wallet className="mr-2 h-4 w-4" /> Cuentas por Pagar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-6 animate-in fade-in slide-in-from-top-2">
           <div className="bg-card rounded-[2rem] border-none shadow-2xl overflow-hidden bg-white">
              <div className="p-6 border-b bg-muted/10">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/40" />
                  <Input
                    placeholder="Buscar proveedor por nombre o RNC..."
                    className="pl-12 h-14 bg-white rounded-2xl font-black text-lg border-none shadow-inner"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50 h-16">
                    <TableRow>
                      <TableHead className="font-black px-8 text-primary uppercase text-[10px]">Empresa / RNC</TableHead>
                      <TableHead className="font-black text-primary uppercase text-[10px]">Contacto</TableHead>
                      <TableHead className="font-black text-primary uppercase text-[10px]">Teléfono / Email</TableHead>
                      <TableHead className="font-black text-primary uppercase text-[10px] text-right">Deuda Pendiente</TableHead>
                      <TableHead className="text-right font-black px-8 text-primary uppercase text-[10px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isSuppliersLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-12 w-12 text-primary opacity-20" /></TableCell></TableRow>
                    ) : filteredSuppliers.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-32 italic opacity-30 font-black uppercase tracking-widest text-lg">Sin proveedores registrados.</TableCell></TableRow>
                    ) : filteredSuppliers.map((s) => {
                      const suppDebt = pendingPayables.filter(p => p.supplierId === s.id).reduce((sum, p) => sum + Math.abs(p.amount), 0);
                      return (
                        <TableRow key={s.id} className="hover:bg-muted/20 transition-all h-20">
                          <TableCell className="px-8 py-5">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary font-black text-xl shadow-inner border uppercase">{s.name[0]}</div>
                              <div>
                                <p className="font-black text-sm uppercase text-primary leading-none">{s.name}</p>
                                <p className="text-[10px] font-mono text-muted-foreground mt-1.5 uppercase">RNC: {s.rnc || 'S/N'}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-bold text-xs text-muted-foreground">{s.contactPerson || '---'}</TableCell>
                          <TableCell>
                            <p className="font-black text-[11px] text-primary">{s.phoneNumber}</p>
                            <p className="text-[9px] text-muted-foreground italic truncate max-w-[150px]">{s.email || ''}</p>
                          </TableCell>
                          <TableCell className="text-right">
                             <p className={cn("font-black text-lg", suppDebt > 0 ? "text-destructive" : "text-emerald-600")}>
                               RD${suppDebt.toLocaleString()}
                             </p>
                          </TableCell>
                          <TableCell className="text-right px-8">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="font-black rounded-xl h-10 border-2 gap-2" onClick={() => setSelectedSupplierForHistory(s)}>
                                <History className="h-4 w-4" /> Historial
                              </Button>
                              <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" onClick={() => handleDelete(s.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
           </div>
        </TabsContent>

        <TabsContent value="payables" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
           <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
              <CardHeader className="bg-destructive/5 p-8 border-b border-destructive/10">
                 <div className="flex items-center gap-4">
                    <div className="h-14 w-14 bg-destructive/10 rounded-2xl flex items-center justify-center text-destructive shadow-sm">
                       <Wallet className="h-7 w-7" />
                    </div>
                    <div>
                       <CardTitle className="text-2xl font-black text-destructive uppercase tracking-tight">Facturas por Liquidar</CardTitle>
                       <CardDescription className="font-bold">Listado de compromisos financieros pendientes con proveedores.</CardDescription>
                    </div>
                 </div>
              </CardHeader>
              <CardContent className="p-0">
                 <Table>
                    <TableHeader className="bg-muted/50 h-16">
                       <TableRow>
                          <TableHead className="font-black px-8 uppercase text-[10px]">Fecha / Documento</TableHead>
                          <TableHead className="font-black uppercase text-[10px]">Proveedor / Concepto</TableHead>
                          <TableHead className="font-black uppercase text-[10px] text-right">Monto Adeudado</TableHead>
                          <TableHead className="text-right font-black px-8 uppercase text-[10px]">Gestión de Pago</TableHead>
                       </TableRow>
                    </TableHeader>
                    <TableBody>
                       {isEntriesLoading ? (
                         <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin mx-auto h-12 w-12 text-primary opacity-20" /></TableCell></TableRow>
                       ) : pendingPayables.length === 0 ? (
                         <TableRow><TableCell colSpan={4} className="text-center py-32 italic font-black opacity-30 uppercase tracking-[0.2em] text-lg">No hay cuentas por pagar.</TableCell></TableRow>
                       ) : pendingPayables.map((p) => {
                         const supplier = suppliers?.find(s => s.id === p.supplierId);
                         return (
                           <TableRow key={p.id} className="hover:bg-destructive/5 transition-all h-24">
                              <TableCell className="px-8 py-6">
                                 <p className="font-black text-xs uppercase leading-none">{mounted ? new Date(p.entryDate || p.createdAt).toLocaleDateString() : '-'}</p>
                                 <p className="text-[9px] font-mono font-bold text-muted-foreground mt-2 uppercase">NCF: {p.invoiceNumber || 'S/N'}</p>
                              </TableCell>
                              <TableCell>
                                 <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-muted rounded-xl flex items-center justify-center text-muted-foreground"><Briefcase className="h-5 w-5" /></div>
                                    <div>
                                       <p className="font-black text-sm uppercase text-primary">{supplier?.name || 'Proveedor No Identificado'}</p>
                                       <p className="text-[10px] font-bold text-muted-foreground italic">{p.description}</p>
                                    </div>
                                 </div>
                              </TableCell>
                              <TableCell className="text-right">
                                 <p className="text-xl font-black text-destructive">RD${Math.abs(p.amount).toLocaleString()}</p>
                                 <Badge className="bg-orange-100 text-orange-700 border-none text-[8px] font-black uppercase px-2 h-4.5 mt-1">VENCIMIENTO PENDIENTE</Badge>
                              </TableCell>
                              <TableCell className="text-right px-8">
                                 <Button 
                                    className="h-12 px-6 rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 shadow-lg gap-2"
                                    onClick={() => setIsPaymentDialogOpen(p)}
                                 >
                                    <Banknote className="h-4 w-4" /> Registrar Pago
                                 </Button>
                              </TableCell>
                           </TableRow>
                         );
                       })}
                    </TableBody>
                 </Table>
              </CardContent>
           </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL HISTORIAL PROVEEDOR */}
      <Dialog open={!!selectedSupplierForHistory} onOpenChange={(open) => !open && setSelectedSupplierForHistory(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2.5rem] border-none shadow-2xl">
          {selectedSupplierForHistory && (
            <>
              <DialogHeader className="p-8 bg-primary text-white shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center font-black text-3xl shadow-inner uppercase">
                      {selectedSupplierForHistory.name[0]}
                    </div>
                    <div>
                      <DialogTitle className="text-3xl font-black uppercase tracking-tight">{selectedSupplierForHistory.name}</DialogTitle>
                      <p className="text-white/70 font-bold mt-1 flex items-center gap-1.5 uppercase text-[10px]"><Building2 className="h-3 w-3" /> RNC: {selectedSupplierForHistory.rnc || 'S/N'}</p>
                    </div>
                  </div>
                  <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20 font-black h-10 gap-2">
                    <FileText className="h-4 w-4" /> Estado de Cuenta
                  </Button>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-hidden bg-white p-8 space-y-8">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 rounded-[1.5rem] border-2 bg-destructive/5 border-destructive/10 relative overflow-hidden group">
                       <p className="text-[10px] font-black uppercase text-destructive tracking-widest">Saldo Pendiente</p>
                       <p className="text-3xl font-black text-destructive mt-1">
                          RD${pendingPayables.filter(p => p.supplierId === selectedSupplierForHistory.id).reduce((sum, p) => sum + Math.abs(p.amount), 0).toLocaleString()}
                       </p>
                    </div>
                    <div className="p-6 rounded-[1.5rem] border-2 bg-muted/30 border-muted relative overflow-hidden">
                       <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Contacto</p>
                       <p className="text-xl font-black text-primary mt-1">{selectedSupplierForHistory.contactPerson || 'Sin contacto'}</p>
                       <p className="text-[10px] font-bold text-primary/60 mt-1">{selectedSupplierForHistory.phoneNumber}</p>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <h4 className="font-black text-sm uppercase tracking-widest text-primary flex items-center gap-2">
                       <History className="h-4 w-4" /> Historial de Compras y Suministros
                    </h4>
                    <div className="border rounded-2xl overflow-hidden shadow-inner">
                       <ScrollArea className="h-64 bg-muted/5">
                          <Table>
                             <TableHeader className="bg-muted/50 sticky top-0 z-10 h-12">
                                <TableRow>
                                   <TableHead className="font-black text-[9px] uppercase pl-6">Fecha / NCF</TableHead>
                                   <TableHead className="font-black text-[9px] uppercase">Detalle Artículos</TableHead>
                                   <TableHead className="font-black text-[9px] uppercase text-center">Estado</TableHead>
                                   <TableHead className="text-right font-black text-[9px] uppercase pr-6">Monto</TableHead>
                                </TableRow>
                             </TableHeader>
                             <TableBody>
                                {allPurchases?.filter(p => p.supplierId === selectedSupplierForHistory.id).length === 0 ? (
                                  <TableRow><TableCell colSpan={4} className="text-center py-20 italic font-bold opacity-30 text-xs">Sin movimientos.</TableCell></TableRow>
                                ) : allPurchases?.filter(p => p.supplierId === selectedSupplierForHistory.id).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((p) => (
                                  <TableRow key={p.id}>
                                     <TableCell className="pl-6 py-4">
                                        <p className="font-bold text-[10px]">{mounted ? new Date(p.entryDate || p.createdAt).toLocaleDateString() : '-'}</p>
                                        <p className="text-[8px] font-mono opacity-50 uppercase">{p.invoiceNumber || 'S/NCF'}</p>
                                     </TableCell>
                                     <TableCell>
                                        <p className="text-[10px] font-bold uppercase truncate max-w-[200px]">{p.description}</p>
                                     </TableCell>
                                     <TableCell className="text-center">
                                        <Badge className={cn(
                                          "text-[7px] font-black uppercase border-none",
                                          p.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
                                        )}>
                                          {p.paymentStatus === 'Paid' ? 'PAGADO' : 'PENDIENTE'}
                                        </Badge>
                                     </TableCell>
                                     <TableCell className="text-right pr-6 font-black text-sm">RD${Math.abs(p.amount).toLocaleString()}</TableCell>
                                  </TableRow>
                                ))}
                             </TableBody>
                          </Table>
                       </ScrollArea>
                    </div>
                 </div>
              </div>

              <DialogFooter className="p-8 bg-muted/10 border-t">
                <Button variant="secondary" className="h-14 w-full font-black text-lg rounded-xl" onClick={() => setSelectedSupplierForHistory(null)}>Cerrar Visor</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL REGISTRAR PAGO A FACTURA */}
      <Dialog open={!!isPaymentDialogOpen} onOpenChange={(open) => !open && setIsPaymentDialogOpen(null)}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
           <DialogHeader className="bg-emerald-600 text-white p-8">
              <div className="flex items-center gap-4">
                 <div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                    <Banknote className="h-8 w-8 text-white" />
                 </div>
                 <div>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Liquidación de Factura</DialogTitle>
                    <DialogDescription className="text-white/80 font-bold uppercase text-[10px]">Abono a Cuenta por Pagar</DialogDescription>
                 </div>
              </div>
           </DialogHeader>
           <div className="p-8 space-y-8">
              <div className="p-6 bg-emerald-50 rounded-[2rem] border-2 border-dashed border-emerald-200 text-center space-y-1">
                 <p className="text-[10px] font-black uppercase text-emerald-600">Balance de la Factura</p>
                 <p className="text-5xl font-black text-emerald-700">RD${Math.abs(isPaymentDialogOpen?.amount || 0).toLocaleString()}</p>
                 <p className="text-[10px] font-bold text-emerald-600/60 mt-2 uppercase">{isPaymentDialogOpen?.description}</p>
              </div>

              <div className="space-y-4">
                 <div className="space-y-2">
                    <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground block text-center">Confirmar Monto Pagado</Label>
                    <div className="relative">
                       <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 h-8 w-8 text-emerald-600 opacity-20" />
                       <Input 
                          type="number" 
                          placeholder="0.00" 
                          className="h-20 text-4xl font-black text-center border-4 border-emerald-100 rounded-3xl focus:border-emerald-600 transition-all"
                          value={paymentAmount || Math.abs(isPaymentDialogOpen?.amount || 0)}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          autoFocus
                       />
                    </div>
                 </div>
                 
                 <Alert className="bg-emerald-50 border-emerald-100">
                    <Info className="h-4 w-4 text-emerald-600" />
                    <AlertDescription className="text-[10px] font-bold text-emerald-700 leading-tight">
                       Al confirmar, la factura se marcará como pagada y se descontará del reporte de Cuentas por Pagar.
                    </AlertDescription>
                 </Alert>
              </div>
           </div>
           <DialogFooter className="p-8 bg-muted/10 border-t">
              <Button 
                className="w-full h-16 text-xl font-black bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-xl gap-3 transition-all active:scale-95" 
                onClick={handleProcessPayment}
                disabled={isProcessingPayment || !paymentAmount}
              >
                {isProcessingPayment ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="h-6 w-6" />}
                Confirmar Pago de Factura
              </Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
