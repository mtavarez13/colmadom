
"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Truck, 
  MapPin, 
  Search, 
  Loader2, 
  UserPlus, 
  Plus, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  Navigation, 
  AlertTriangle,
  Package,
  ArrowRight,
  ShieldCheck,
  Zap,
  MoreVertical,
  X,
  Smartphone,
  Locate,
  History,
  Phone,
  Edit3,
  Trash2,
  MessageSquare,
  Send,
  Lock,
  BellRing,
  Eye,
  ExternalLink,
  ShoppingBag,
  Mail
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, orderBy, increment, serverTimestamp, getDocs } from "firebase/firestore";
import { registerDeliveryWithFirebase } from "@/lib/delivery-phone-auth";
import { setDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { useToast } from "@/hooks/use-toast";
import { SidebarTrigger } from "@/components/ui/sidebar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export default function GoHubAdminPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [mounted, setMounted] = useState(false);
  const [isNewDriverOpen, setIsNewDriverOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverEmail, setDriverEmail] = useState("");
  const [driverVehicle, setDriverVehicle] = useState("Motor");
  const [driverPassword, setDriverPassword] = useState("");
  const [adminMessage, setAdminMessage] = useState("");

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

  const driversQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "drivers");
  }, [db, profile?.colmadoId]);
  const { data: drivers, isLoading: isDriversLoading } = useCollection(driversQuery);

  const ordersQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return query(
      collection(db, "colmados", profile.colmadoId, "orders"),
      where("status", "in", ["Pending", "Preparing", "Dispatched", "Assigned", "Accepted"]),
      orderBy("createdAt", "desc")
    );
  }, [db, profile?.colmadoId]);
  const { data: orders, isLoading: isOrdersLoading } = useCollection(ordersQuery);

  const handleOpenCreate = () => {
    setSelectedDriver(null);
    setDriverName("");
    setDriverPhone("");
    setDriverEmail("");
    setDriverVehicle("Motor");
    setDriverPassword("");
    setIsNewDriverOpen(true);
  };

  const handleOpenEdit = (driver: any) => {
    setSelectedDriver(driver);
    setDriverName(driver.fullName);
    setDriverPhone(driver.phoneNumber);
    setDriverEmail(driver.email || "");
    setDriverVehicle(driver.vehicleType);
    setDriverPassword(""); 
    setIsNewDriverOpen(true);
  };

  const handleOpenDetails = (order: any) => {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  const handleRegisterDriver = async () => {
    if (!profile?.colmadoId || profile.role !== 'Admin' || !driverName.trim()) return;
    const normalizedPhone = driverPhone.replace(/\D/g, '');
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      toast({ variant: 'destructive', title: 'Teléfono inválido', description: 'Escribe el número completo del repartidor.' });
      return;
    }
    if (!selectedDriver && driverPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Asigna una clave', description: 'Debe tener al menos 6 caracteres.' });
      return;
    }
    setIsSaving(true);
    const driverId = selectedDriver?.id || `drv_${Date.now()}`;
    const now = new Date().toISOString();

    const driverData = {
      id: driverId,
      colmadoId: profile.colmadoId,
      fullName: driverName,
      phoneNumber: normalizedPhone,
      email: driverEmail.toLowerCase().trim(),
      vehicleType: driverVehicle,
      isAvailable: selectedDriver ? selectedDriver.isAvailable : false,
      rating: selectedDriver ? selectedDriver.rating : 5,
      updatedAt: now
    };

    if (!selectedDriver) {
      (driverData as any).createdAt = now;
    }

    try {
      const response = await fetch('/api/phone-auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user?.getIdToken()}` },
        body: JSON.stringify({ action: selectedDriver ? 'updateStaff' : 'createStaff', uid: selectedDriver?.uid || `u_${driverId}`,
          driverId, colmadoId: profile.colmadoId, name: driverName, phone: driverPhone, email: driverEmail,
          password: driverPassword, role: 'Driver',
          allowedModules: ['driver'] })
      });
      const result = await response.json();
      if (!response.ok) {
        if (!selectedDriver && response.status >= 500) {
          await registerDeliveryWithFirebase({ db, colmadoId: profile.colmadoId, driverId,
            name: driverName, phone: normalizedPhone, password: driverPassword,
            email: driverEmail, vehicleType: driverVehicle });
        } else throw new Error(result.error || 'No se pudo registrar el repartidor.');
      }
      if (!response.ok) {
        toast({ title: 'Repartidor registrado', description: 'Puede entrar con su teléfono y clave.' });
        setDriverName(''); setDriverPhone(''); setDriverEmail(''); setDriverPassword(''); setIsNewDriverOpen(false);
        return;
      }
      setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "drivers", driverId), driverData, { merge: true });

    toast({ 
      title: selectedDriver ? "Driver Actualizado" : "Driver Registrado", 
      description: selectedDriver ? 'Datos actualizados.' : 'Ya puede entrar a Delivery con su teléfono y la clave asignada.'
    });
    
    setDriverName(""); setDriverPhone(""); setDriverEmail(""); setDriverPassword(""); setIsNewDriverOpen(false);
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo guardar el repartidor', description: error instanceof Error ? error.message : '' });
    } finally { setIsSaving(false); }
  };

  const handleDeleteDriver = async (driver: any) => {
    if (!profile?.colmadoId) return;
    const response = await fetch('/api/phone-auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user?.getIdToken()}` },
      body: JSON.stringify({ action: 'deleteStaff', uid: driver.uid || `u_${driver.id}`, driverId: driver.id, phone: driver.phoneNumber })
    });
    if (!response.ok) { toast({ variant: 'destructive', title: 'No se pudo eliminar el acceso' }); return; }
    toast({ variant: "destructive", title: "Driver Eliminado" });
  };

  const handleSendMessage = () => {
    if (!profile?.colmadoId || !selectedDriver || !adminMessage) return;
    const notificationId = `notif_${Date.now()}`;
    
    setDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "drivers", selectedDriver.id, "notifications", notificationId), {
      id: notificationId,
      message: adminMessage,
      type: "admin_message",
      status: "unread",
      createdAt: new Date().toISOString()
    }, { merge: true });

    toast({ title: "Notificación Enviada" });
    setAdminMessage("");
    setIsMessageOpen(false);
  };

  const handleAssignOrder = (orderId: string, driverId: string) => {
    if (!profile?.colmadoId) return;
    updateDocumentNonBlocking(doc(db, "colmados", profile.colmadoId, "orders", orderId), {
      status: "Assigned",
      assignedDriverId: driverId,
      assignedAt: new Date().toISOString()
    });
    toast({ title: "Pedido Asignado" });
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 999;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="h-12 w-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent">
            <Truck className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-primary uppercase tracking-tight">Repartidores</h1>
            <p className="text-sm text-muted-foreground font-bold">Logística y despacho en tiempo real.</p>
          </div>
        </div>
        <div className="flex gap-2">
           <Button size="lg" className="bg-accent hover:bg-accent/90 font-black h-12 rounded-xl shadow-lg gap-2" onClick={handleOpenCreate}>
             <UserPlus className="h-5 w-5" /> Registrar Repartidor
           </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
           <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white h-[700px] flex flex-col">
              <CardHeader className="bg-primary text-white p-6 shrink-0">
                 <CardTitle className="text-xl font-black uppercase flex items-center gap-2">
                    <Smartphone className="h-5 w-5" /> Flota en Línea
                 </CardTitle>
              </CardHeader>
              <ScrollArea className="flex-1">
                 <div className="p-4 space-y-3">
                    {isDriversLoading ? (
                      <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-primary opacity-20" /></div>
                    ) : !drivers || drivers.length === 0 ? (
                      <div className="py-20 text-center italic opacity-30 font-black uppercase text-xs">Sin flota registrada</div>
                    ) : drivers.map(drv => (
                      <div key={drv.id} className={cn(
                        "p-4 rounded-2xl border-2 transition-all group relative",
                        drv.isAvailable ? 'bg-emerald-50 border-emerald-100' : 'bg-muted/30 opacity-60'
                      )}>
                         <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                               <div className={cn(
                                 "h-10 w-10 rounded-xl flex items-center justify-center font-black text-white shadow-md uppercase",
                                 drv.isAvailable ? 'bg-emerald-500' : 'bg-muted-foreground'
                               )}>
                                 {drv.fullName[0]}
                               </div>
                               <div>
                                  <p className="font-black text-xs uppercase text-primary leading-none">{drv.fullName}</p>
                                  <p className="text-[9px] font-bold text-muted-foreground mt-1 uppercase">
                                    {drv.vehicleType} • {drv.phoneNumber} {drv.email ? `• ${drv.email}` : ""}
                                  </p>
                               </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-black/5">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-xl border-none shadow-2xl p-2 w-48">
                                <DropdownMenuItem className="gap-2 font-bold cursor-pointer rounded-lg h-10" onClick={() => handleOpenEdit(drv)}>
                                  <Edit3 className="h-4 w-4 text-primary" /> Editar Perfil
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 font-bold cursor-pointer rounded-lg h-10" onClick={() => { setSelectedDriver(drv); setIsMessageOpen(true); }}>
                                  <MessageSquare className="h-4 w-4 text-accent" /> Enviar Mensaje
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="gap-2 font-bold cursor-pointer rounded-lg h-10 text-destructive focus:text-destructive" onClick={() => handleDeleteDriver(drv)}>
                                  <Trash2 className="h-4 w-4" /> Eliminar Driver
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                         </div>
                         {drv.isAvailable && drv.currentLatitude ? (
                           <div className="flex items-center gap-1.5 text-[8px] font-black text-emerald-700 uppercase bg-white/50 p-1.5 rounded-lg border border-emerald-200">
                             <Locate className="h-3 w-3 animate-pulse" /> Sincronizado hace {drv.lastLocationUpdate ? Math.round((Date.now() - new Date(drv.lastLocationUpdate).getTime()) / 60000) : '---'} min
                           </div>
                         ) : (
                           <div className="text-[8px] font-black text-muted-foreground uppercase bg-muted/50 p-1.5 rounded-lg border">
                             Desconectado
                           </div>
                         )}
                      </div>
                    ))}
                 </div>
              </ScrollArea>
           </Card>
        </div>

        <div className="lg:col-span-8 space-y-6">
           <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white h-[700px] flex flex-col">
              <CardHeader className="bg-muted/50 border-b p-8 flex flex-row items-center justify-between shrink-0">
                 <div>
                    <CardTitle className="text-2xl font-black text-primary uppercase">Tablero de Despacho</CardTitle>
                    <p className="text-xs font-bold text-muted-foreground">Supervisión de pedidos en proceso de entrega.</p>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="text-right">
                       <p className="text-[10px] font-black uppercase text-muted-foreground">Pendientes</p>
                       <p className="text-2xl font-black text-primary">{orders?.filter(o => o.status === 'Pending').length || 0}</p>
                    </div>
                    <Separator orientation="vertical" className="h-10" />
                    <div className="text-right">
                       <p className="text-[10px] font-black uppercase text-muted-foreground">En Camino</p>
                       <p className="text-2xl font-black text-accent">{orders?.filter(o => o.status === 'Dispatched' || o.status === 'Accepted').length || 0}</p>
                    </div>
                 </div>
              </CardHeader>
              <ScrollArea className="flex-1">
                 <div className="p-8 space-y-4">
                    {isOrdersLoading ? (
                      <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-primary opacity-20" /></div>
                    ) : !orders || orders.length === 0 ? (
                      <div className="py-40 text-center opacity-10 space-y-4">
                         <Package className="h-20 w-20 mx-auto" />
                         <p className="text-2xl font-black uppercase tracking-widest">Sin Pedidos Activos</p>
                      </div>
                    ) : orders.map(order => {
                      const statusMap = {
                        'Pending': { label: 'POR ASIGNAR', color: 'bg-orange-500', icon: Clock },
                        'Assigned': { label: 'ASIGNADO (ESPERA)', color: 'bg-blue-500 animate-pulse', icon: History },
                        'Accepted': { label: 'EN CAMINO', color: 'bg-accent animate-pulse', icon: Truck },
                        'Delivered': { label: 'ENTREGADO', color: 'bg-emerald-500', icon: CheckCircle2 }
                      };
                      const status = statusMap[order.status as keyof typeof statusMap] || { label: order.status, color: 'bg-muted', icon: Package };
                      
                      const assignedDriver = drivers?.find(d => d.id === order.assignedDriverId);
                      
                      return (
                        <div key={order.id} className="bg-white border-2 rounded-[2rem] overflow-hidden shadow-sm hover:border-primary/20 transition-all flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x">
                           <div className="flex-1 p-6 space-y-4">
                              <div className="flex justify-between items-start">
                                 <div>
                                    <Badge className={cn("border-none text-[8px] font-black uppercase px-2 mb-2", status.color)}>
                                       {status.label}
                                    </Badge>
                                    <h4 className="text-lg font-black uppercase leading-none">{order.customerName}</h4>
                                 </div>
                                 <p className="text-lg font-black text-primary">RD${order.totalAmount?.toLocaleString()}</p>
                              </div>
                              <div className="flex items-start gap-2 text-xs font-bold text-muted-foreground">
                                 <MapPin className="h-4 w-4 text-accent shrink-0" />
                                 <p className="line-clamp-2">{order.customerAddress}</p>
                              </div>
                              <Button variant="outline" size="sm" className="h-8 rounded-lg font-black text-[10px] gap-2 border-primary/20 text-primary" onClick={() => handleOpenDetails(order)}>
                                <Eye className="h-3 w-3" /> VER DETALLES DE PRODUCTOS
                              </Button>
                           </div>

                           <div className="w-full md:w-72 p-6 bg-muted/5 flex flex-col justify-center gap-4">
                              {order.status === 'Pending' || order.status === 'Preparing' ? (
                                <div className="space-y-4">
                                   <p className="text-[10px] font-black uppercase text-muted-foreground text-center">Asignación Inteligente</p>
                                   <div className="grid grid-cols-1 gap-2">
                                      {drivers?.filter(d => d.isAvailable).sort((a,b) => {
                                        const distA = calculateDistance(Number(colmado?.latitude), Number(colmado?.longitude), Number(a.currentLatitude), Number(a.currentLongitude));
                                        const distB = calculateDistance(Number(colmado?.latitude), Number(colmado?.longitude), Number(b.currentLatitude), Number(b.currentLongitude));
                                        return distA - distB;
                                      }).slice(0, 2).map(d => (
                                        <Button 
                                          key={d.id} 
                                          variant="outline" 
                                          className="h-12 rounded-xl text-[10px] font-black border-2 border-primary/20 hover:bg-primary hover:text-white"
                                          onClick={() => handleAssignOrder(order.id, d.id)}
                                        >
                                          ASIGNAR A: {d.fullName.split(' ')[0]}
                                        </Button>
                                      ))}
                                      {drivers?.filter(d => d.isAvailable).length === 0 && (
                                        <div className="text-center p-3 border-2 border-dashed rounded-xl border-destructive/20 text-destructive text-[8px] font-black uppercase">
                                           No hay drivers disponibles
                                        </div>
                                      )}
                                   </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                   <p className="text-[10px] font-black uppercase text-muted-foreground">Repartidor:</p>
                                   <div className="flex items-center gap-3 bg-white p-3 rounded-xl border">
                                      <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-white font-black text-xs uppercase">
                                        {assignedDriver?.fullName[0] || 'D'}
                                      </div>
                                      <div>
                                         <p className="text-xs font-black text-primary uppercase leading-none">{assignedDriver?.fullName || '---'}</p>
                                         <p className="text-[8px] font-bold text-muted-foreground mt-1 uppercase">{assignedDriver?.vehicleType}</p>
                                      </div>
                                   </div>
                                </div>
                              )}
                           </div>
                        </div>
                      );
                    })}
                 </div>
              </ScrollArea>
           </Card>
        </div>
      </div>

      <Dialog open={isNewDriverOpen} onOpenChange={setIsNewDriverOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">{selectedDriver ? "Editar repartidor" : "Registrar repartidor"}</DialogTitle>
            <DialogDescription className="font-bold">{selectedDriver ? "Actualiza sus datos o su clave de acceso." : "Escribe su nombre, teléfono y una clave. Podrá entrar directamente a su panel Delivery."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
               <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Nombre Completo</Label>
               <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} className="h-12 rounded-xl font-bold" />
            </div>
            <div className="space-y-2">
               <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Email (Opcional - Google Auth)</Label>
               <div className="relative">
                 <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <Input value={driverEmail} onChange={(e) => setDriverEmail(e.target.value)} type="email" placeholder="ejemplo@gmail.com" className="h-12 pl-9 rounded-xl font-bold" />
               </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Teléfono (Login)</Label>
                  <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="809..." className="h-12 rounded-xl font-black" />
               </div>
               <div className="space-y-2">
                  <Label className="font-black text-[10px] uppercase text-muted-foreground ml-1">Vehículo</Label>
                  <Select value={driverVehicle} onValueChange={setDriverVehicle}>
                     <SelectTrigger className="h-12 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                     <SelectContent>
                        <SelectItem value="Motor">Motor</SelectItem>
                        <SelectItem value="Pasola">Pasola</SelectItem>
                        <SelectItem value="Bicicleta">Bicicleta</SelectItem>
                        <SelectItem value="Carro">Carro (Taxi)</SelectItem>
                     </SelectContent>
                  </Select>
               </div>
            </div>
            <div className="space-y-2 p-4 bg-muted/20 rounded-2xl border-2 border-dashed">
               <Label className="font-black text-[10px] uppercase text-primary ml-1 flex items-center gap-1.5"><Lock className="h-3 w-3" /> {selectedDriver ? "Cambiar Contraseña (Opcional)" : "Asignar Contraseña"}</Label>
               <Input 
                 type="password" 
                 placeholder={selectedDriver ? "Dejar en blanco para no cambiar" : "****"} 
                 value={driverPassword} 
                 onChange={(e) => setDriverPassword(e.target.value)} 
                 className="h-12 rounded-xl font-black" 
               />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleRegisterDriver} className="w-full h-14 text-lg font-black bg-primary rounded-xl shadow-xl shadow-primary/20" disabled={isSaving || !driverName.trim() || driverPhone.replace(/\D/g, '').length < 10 || (!selectedDriver && driverPassword.length < 6)}>
              {isSaving ? <Loader2 className="animate-spin" /> : (selectedDriver ? "Guardar Cambios" : "Activar Repartidor")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMessageOpen} onOpenChange={setIsMessageOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem]">
          <DialogHeader>
            <div className="h-12 w-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent mx-auto mb-4">
              <BellRing className="h-6 w-6" />
            </div>
            <DialogTitle className="text-2xl font-black text-center uppercase">Notificación a Driver</DialogTitle>
            <DialogDescription className="text-center font-bold">Envía instrucciones directas a {selectedDriver?.fullName.split(' ')[0]}.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <span className="sr-only">Escribir mensaje</span>
             <Textarea 
               placeholder="Escribe el mensaje aquí..." 
               className="min-h-[150px] rounded-2xl font-medium border-2"
               value={adminMessage}
               onChange={(e) => setAdminMessage(e.target.value)}
               autoFocus
             />
          </div>
          <DialogFooter>
            <Button onClick={handleSendMessage} className="w-full h-14 text-lg font-black bg-accent rounded-xl shadow-xl gap-2" disabled={!adminMessage}>
              <Send className="h-5 w-5" /> Enviar Ahora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          {selectedOrder && (
            <>
              <DialogHeader className="p-8 bg-primary text-white shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                      <ShoppingBag className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <DialogTitle className="text-2xl font-black uppercase tracking-tight">Contenido del Pedido</DialogTitle>
                      <DialogDescription className="text-white/80 font-bold uppercase text-[10px]">Cliente: {selectedOrder.customerName}</DialogDescription>
                    </div>
                  </div>
                  <Badge className="bg-white text-primary font-black px-4 py-1 rounded-full uppercase border-none text-[10px]">Total: RD${selectedOrder.totalAmount?.toLocaleString()}</Badge>
                </div>
              </DialogHeader>
              <div className="p-8 space-y-6">
                <div className="p-5 bg-muted/30 rounded-2xl border-2 border-dashed space-y-2">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Dirección de Entrega:</p>
                  <p className="text-sm font-bold leading-relaxed">{selectedOrder.customerAddress}</p>
                  <Button variant="link" className="p-0 h-auto text-accent text-[10px] font-black gap-1 uppercase" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedOrder.customerAddress)}`, "_blank")}>
                    <ExternalLink className="h-3 w-3" /> Abrir en Google Maps
                  </Button>
                </div>
                <div className="space-y-4">
                  <h4 className="font-black text-xs uppercase tracking-widest text-primary flex items-center gap-2 border-b pb-2">
                    <Package className="h-4 w-4" /> Artículos en la Orden
                  </h4>
                  <ScrollArea className="h-64 border rounded-2xl bg-white p-2">
                     <OrderItemsFetcher orderId={selectedOrder.id} colmadoId={profile?.colmadoId} />
                  </ScrollArea>
                </div>
              </div>
              <DialogFooter className="p-8 bg-muted/10 border-t">
                <Button variant="secondary" className="w-full h-14 font-black rounded-xl" onClick={() => setIsDetailsOpen(false)}>Cerrar Visor</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderItemsFetcher({ orderId, colmadoId }: { orderId: string | undefined; colmadoId: string | undefined }) {
  const db = useFirestore();
  const itemsRef = useMemoFirebase(() => {
    if (!colmadoId || !orderId) return null;
    return collection(db, "colmados", colmadoId, "orders", orderId, "items");
  }, [colmadoId, orderId]);
  
  const { data: items, isLoading } = useCollection(itemsRef);

  if (isLoading) return <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto h-8 w-8 text-primary" /></div>;
  if (!items || items.length === 0) return <p className="text-xs text-center py-4 opacity-50">Sin artículos.</p>;

  return (
    <div className="space-y-2">
      {items.map((item: any) => (
        <div key={item.id} className="flex justify-between items-center text-xs py-2 px-4 border-b last:border-0 border-primary/5">
          <div className="flex-1 min-w-0 pr-2">
            <p className="font-black truncate uppercase text-primary">{item.productName}</p>
            <p className="text-[10px] text-muted-foreground font-bold">{item.quantity?.toFixed(1)} x RD${item.unitPrice?.toLocaleString()}</p>
          </div>
          <span className="font-black text-sm">RD${item.lineTotal?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
