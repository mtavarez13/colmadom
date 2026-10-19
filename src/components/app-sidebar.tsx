
"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ShoppingCart, 
  Beer, 
  ClipboardList, 
  MessageSquare, 
  Navigation, 
  Package, 
  Users, 
  Receipt, 
  Calculator, 
  Smartphone, 
  Scale, 
  Sparkles, 
  Settings, 
  LogOut, 
  ShieldAlert, 
  Store,
  Zap,
  ClipboardCheck,
  Trophy,
  Truck,
  Briefcase,
  CreditCard,
  BellRing,
  Info,
  ShieldCheck as ShieldIcon,
  AlertTriangle
  ,CalendarClock
  ,Building2
} from "lucide-react";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem, 
  useSidebar,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarSeparator
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useUser, useFirestore, useDoc, useMemoFirebase, useAuth } from "@/firebase";
import { doc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { collection, updateDoc } from "firebase/firestore";
import { useCollection } from "@/firebase";
import { isSubscriptionBlocked } from '@/lib/subscription';
import { billingState } from '@/lib/saas-billing';
import { canViewBusinessBilling } from '@/lib/billing-audience';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function santoDomingoToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const datePart = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
}

export function AppSidebar() {
  const { user } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [paymentReminderOpen, setPaymentReminderOpen] = useState(false);
  const [cardReminderOpen, setCardReminderOpen] = useState(false);
  const [todayInDR, setTodayInDR] = useState('');
  const { state } = useSidebar();

  useEffect(() => {
    setMounted(true);
    setTodayInDR(santoDomingoToday());
    const timer = window.setInterval(() => setTodayInDR(santoDomingoToday()), 60_000);
    return () => window.clearInterval(timer);
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
  const planRef = useMemoFirebase(() => colmado?.rootColmadoId ? doc(db, 'colmados', colmado.rootColmadoId) : null, [db, colmado?.rootColmadoId]);
  const { data: rootPlan } = useDoc(planRef);
  const subscription = colmado?.rootColmadoId && colmado.rootColmadoId !== colmado.id ? rootPlan : colmado;
  const platformConfigRef = useMemoFirebase(() => doc(db, 'platformConfig', 'general'), [db]);
  const { data: platformConfig } = useDoc(platformConfigRef);
  const freeModules: string[] = Array.isArray(platformConfig?.freeModules) ? platformConfig.freeModules : ['independent-audits','hr','business-market'];
  const currentModuleId = pathname.split('/').filter(Boolean)[0] || '';
  const currentModuleIsFree = freeModules.includes(currentModuleId);
  const billing = billingState(subscription || {});
  useEffect(() => {
    const width = colmado?.printerPaperWidth === '58mm' ? '52mm' : '74mm';
    document.documentElement.style.setProperty('--ticket-content-width', width);
  }, [colmado?.printerPaperWidth]);
  const branchesRef = useMemoFirebase(() => profile?.allowedColmadoIds?.length > 1 ? collection(db, 'colmados') : null, [db, profile?.allowedColmadoIds]);
  const { data: allBranches } = useCollection(branchesRef);
  const accessibleBranches = allBranches?.filter(branch => profile?.allowedColmadoIds?.includes(branch.id)) || [];

  const switchBranch = async (colmadoId: string) => {
    if (!user || !profile?.allowedColmadoIds?.includes(colmadoId)) return;
    await updateDoc(doc(db, 'userProfiles', user.uid), { colmadoId, updatedAt: new Date().toISOString() });
    router.refresh();
  };

  const isAdmin = mounted && (
    profile?.role === 'Admin' || 
    isSuperAdmin(user?.email || null)
  );

  const isPlatformAdmin = mounted && isSuperAdmin(user?.email || null);
  const canViewBilling = !!subscription && !isPlatformAdmin && profile?.isActive !== false && canViewBusinessBilling(subscription, user?.uid, profile?.role);
  const cardNoticeStartDate = String(subscription?.paypalPlan1NoticeStartDate || '');
  const cardNoticeDue = subscription?.paypalPlan1Enabled === true && /^\d{4}-\d{2}-\d{2}$/.test(cardNoticeStartDate) && subscription?.paypalPlan1SubscriptionStatus !== 'ACTIVE' && !!todayInDR && cardNoticeStartDate <= todayInDR;

  useEffect(() => {
    if (cardNoticeDue) setPaymentReminderOpen(false);
  }, [cardNoticeDue]);

  useEffect(() => {
    if (!mounted || !subscription?.id || subscription?.paymentReminderEnabled !== true || cardNoticeDue || !canViewBilling) {
      setPaymentReminderOpen(false);
      return;
    }
    const frequencyMs = Math.max(1, Number(subscription.paymentReminderFrequencyMinutes || 60)) * 60_000;
    const key = `colmado-payment-reminder:${subscription.id}:${user?.uid}:${subscription.paymentReminderUpdatedAt || 'default'}`;
    const checkReminder = () => {
      const lastShown = Number(localStorage.getItem(key) || 0);
      if (!lastShown || Date.now() - lastShown >= frequencyMs) {
        setPaymentReminderOpen(true);
        localStorage.setItem(key, String(Date.now()));
      }
    };
    checkReminder();
    const timer = window.setInterval(checkReminder, Math.min(60_000, frequencyMs));
    return () => window.clearInterval(timer);
  }, [mounted, subscription?.id, subscription?.paymentReminderEnabled, subscription?.paymentReminderFrequencyMinutes, subscription?.paymentReminderUpdatedAt, cardNoticeDue, canViewBilling, user?.uid]);

  useEffect(() => {
    if (!mounted || !subscription?.id || !cardNoticeDue || !canViewBilling) {
      setCardReminderOpen(false);
      return;
    }
    const frequencyMs = Math.max(1, Number(subscription.paymentReminderFrequencyMinutes || 60)) * 60_000;
    const key = `colmado-card-reminder:${subscription.id}:${user?.uid}:${cardNoticeStartDate}`;
    const checkReminder = () => {
      const lastShown = Number(localStorage.getItem(key) || 0);
      if (!lastShown || Date.now() - lastShown >= frequencyMs) {
        setCardReminderOpen(true);
        localStorage.setItem(key, String(Date.now()));
      }
    };
    checkReminder();
    const timer = window.setInterval(checkReminder, Math.min(60_000, frequencyMs));
    return () => window.clearInterval(timer);
  }, [mounted, subscription?.id, subscription?.paymentReminderFrequencyMinutes, cardNoticeDue, cardNoticeStartDate, canViewBilling, user?.uid]);

  // REDIRECCIÓN SI ESTÁ SUSPENDIDO
  useEffect(() => {
    if (mounted && isSubscriptionBlocked(subscription) && !pathname.startsWith('/billing') && !isPlatformAdmin && !currentModuleIsFree) {
      router.replace('/billing');
    }
  }, [subscription, mounted, pathname, isPlatformAdmin, currentModuleIsFree, router]);

  const navItems = [
    { id: 'branches', icon: Store, label: "Mis Sucursales", href: "/branches", condition: profile?.role === 'Admin' && accessibleBranches.length > 1 },
    { id: 'minimarket', icon: Zap, label: "Mini Market FAST", href: "/minimarket" },
    { id: 'pos', icon: ShoppingCart, label: "Punto de Venta (POS)", href: "/pos" },
    { id: 'driver', icon: Truck, label: "Mi Ruta (Delivery)", href: "/driver" },
    { id: 'bar', icon: Beer, label: "Módulo Bar", href: "/bar", condition: colmado?.isBarEnabled },
    { id: 'orders', icon: ClipboardList, label: "Pedidos Digitales", href: "/orders" },
    { id: 'go-hub', icon: Truck, label: "Repartidores y entregas", href: "/admin/go-hub", condition: isAdmin },
    { id: 'whatsapp', icon: MessageSquare, label: "WhatsApp CRM", href: "/whatsapp" },
    { id: 'top-sellers', icon: Trophy, label: "Ranking de Ventas", href: "/top-sellers" },
    { id: 'hr', icon: Briefcase, label: "Recursos Humanos", href: "/hr" },
    { id: 'marketplace', icon: Navigation, label: "Explorar Marketplace", href: "/discover" },
    { id: 'business-market', icon: Building2, label: "Colmados en venta", href: "/business-market" },
    { id: 'inventory', icon: Package, label: "Gestión Inventario", href: "/inventory" },
    { id: 'inventory-audit', icon: ClipboardCheck, label: "Auditoría Inventario", href: "/inventory-audit" },
    { id: 'independent-audits', icon: ClipboardCheck, label: "Inventarios Independientes", href: "/independent-audits" },
    { id: 'suppliers', icon: Truck, label: "Proveedores y Pagos", href: "/suppliers" },
    { id: 'customers', icon: Users, label: "Libretas (Fiaos)", href: "/customers" },
    { id: 'expenses', icon: Receipt, label: "Gastos y Nómina", href: "/expenses" },
    { id: 'reconciliation', icon: Calculator, label: "Cuadre de Caja", href: "/reconciliation" },
    { id: 'services', icon: Smartphone, label: "Recargas/Servicios", href: "/services" },
    { id: 'reports', icon: Scale, label: "Contabilidad/Dashboard", href: "/reports" },
    { id: 'fiscal', icon: Receipt, label: "DGII y Facturación e-CF", href: "/fiscal", condition: !!colmado?.fiscalEnabled },
    { id: 'insights', icon: Sparkles, label: "AI Insights", href: "/insights" },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (isPlatformAdmin) return true;
    if (profile?.role === 'ContableIndependiente') return item.id === 'independent-audits' && profile?.allowedModules?.includes('independent-audits');
    if (profile?.role === 'Contable') return item.id === 'inventory-audit';
    if (['marketplace','business-market'].includes(item.id) && profile?.role !== 'Driver') return true;
    if (freeModules.includes(item.id) && profile?.role !== 'Driver') return item.condition !== false;
    
    // Si está suspendido, restringir navegación a solo facturación
    if (isSubscriptionBlocked(subscription) && !isPlatformAdmin) {
       return item.href === '/billing';
    }

    // Dueños y Supervisores ven todos los módulos por defecto si no están desactivados por condición
    if (profile?.role === 'Admin' || profile?.role === 'Supervisor') return item.condition !== false;
    
    if (profile?.role === 'Driver') return item.id === 'driver';
    return profile?.allowedModules?.includes(item.id) && item.condition !== false;
  });

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  if (!mounted || !user || pathname === '/select-branch') return null;

  return (
    <>
    <Dialog open={paymentReminderOpen} onOpenChange={setPaymentReminderOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-700"><BellRing className="h-5 w-5"/>Recordatorio de pago</DialogTitle>
          <DialogDescription className="pt-2 text-base text-foreground">{subscription?.paymentReminderMessage || 'Tienes un pago pendiente. Realízalo antes de la fecha límite para evitar la suspensión del sistema.'}</DialogDescription>
        </DialogHeader>
        <DialogFooter><Button variant="outline" onClick={()=>setPaymentReminderOpen(false)}>Entendido</Button><Button asChild><Link href="/billing">Ver suscripción</Link></Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={cardReminderOpen} onOpenChange={setCardReminderOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-700"><CreditCard className="h-5 w-5"/>Suscripción con tarjeta</DialogTitle>
          <DialogDescription className="pt-2 text-base text-foreground">Ya puedes suscribir tu colmado con tarjeta. Revisa tu plan y las cuotas pendientes antes de confirmar el pago.</DialogDescription>
        </DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setCardReminderOpen(false)}>Más tarde</Button><Button asChild onClick={() => setCardReminderOpen(false)}><Link href="/billing/plan1">Ver suscripción</Link></Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Sidebar collapsible="icon" className="border-r-2 shadow-2xl">
      <SidebarHeader className="shrink-0 p-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
            <Store className="h-6 w-6" />
          </div>
          {state === "expanded" && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-black text-primary truncate uppercase tracking-tighter">
                {isPlatformAdmin ? "PLATAFORMA MASTER" : (colmado?.name || "Colmadom")}
              </span>
              <Badge variant="outline" className="text-[8px] font-black w-fit h-4 px-1 border-primary/20">
                {isPlatformAdmin ? "SUPER ADMIN" : (colmado?.code || "S/C")}
              </Badge>
            </div>
          )}
        </div>
      </SidebarHeader>

      {accessibleBranches.length > 1 && state === 'expanded' && <div className="shrink-0 px-3 pb-2">
        <span className="text-xs font-bold">Sucursal activa</span>
        <Select value={profile?.colmadoId} onValueChange={switchBranch}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{accessibleBranches.map(branch => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>}

      <SidebarContent className="min-h-0 flex-1 px-1 pb-2">
        <div className="sr-only">
          <h2>Menú Principal</h2>
          <p>Navegación del sistema operativo Colmadom</p>
        </div>
        {billing.showNotice && canViewBilling && (
          <div className={cn("px-3 pb-2",state==='collapsed'&&"px-1")}>
            <Alert className={cn("border-orange-400 bg-orange-50 text-orange-950",billing.overdue&&"border-red-500 bg-red-50 text-red-950",state==='collapsed'&&"p-2")}>
              <CalendarClock className="h-4 w-4"/>
              {state==='expanded'&&<><AlertTitle className="font-black">{billing.overdue?'Pago vencido':'Aviso de pago mensual'}</AlertTitle><AlertDescription className="text-xs">Cuota pendiente: RD${billing.amountDue.toLocaleString('es-DO',{maximumFractionDigits:2})}. Fecha límite: {billing.deadlineDate}. <Link href="/billing" className="font-black underline">Pagar ahora</Link></AlertDescription></>}
            </Alert>
          </div>
        )}
        {subscription?.suspensionNoticeEnabled === true && canViewBilling && (
          <div className={cn("px-3 pb-2",state==='collapsed'&&"px-1")}>
            <Alert className={cn("border-2 border-red-600 bg-red-50 text-red-950 shadow-lg",state==='collapsed'&&"p-2")}>
              <AlertTriangle className="h-4 w-4"/>
              {state==='expanded'&&<><AlertTitle className="font-black">Aviso de suspensión</AlertTitle><AlertDescription className="text-xs font-semibold">{subscription?.suspensionNoticeMessage || 'Tu servicio presenta una situación de pago. Comunícate con administración para evitar o retirar la suspensión.'}</AlertDescription></>}
            </Alert>
          </div>
        )}
        {colmado?.systemNotice && (
          <div className={cn(
            "px-4 py-2 animate-in slide-in-from-left-4",
            state === 'collapsed' && "px-2"
          )}>
             <Alert className={cn(
               "bg-accent border-accent/20 border-l-4 border-l-white p-3 shadow-lg",
               state === 'collapsed' ? "p-1.5 flex items-center justify-center" : "p-4"
             )}>
                <BellRing className={cn("h-4 w-4 text-white", state === 'expanded' && "mb-1")} />
                {state === 'expanded' && (
                  <>
                    <AlertTitle className="text-[10px] font-black uppercase text-white tracking-widest">Aviso Importante</AlertTitle>
                    <AlertDescription className="text-[11px] font-bold mt-1 text-white leading-tight">
                       {colmado.systemNotice}
                    </AlertDescription>
                  </>
                )}
             </Alert>
          </div>
        )}

        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="px-3 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Módulos Operativos · desliza para ver más</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label} className={cn("h-9 rounded-lg transition-all", isActive ? "bg-primary text-white" : "hover:bg-primary/5")}>
                      <Link href={item.href} className="flex items-center gap-3">
                        <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "text-primary")} />
                        <span className="font-bold text-sm">{item.label}</span>
                        {freeModules.includes(item.id) && state === 'expanded' && <Badge className="ml-auto bg-emerald-600 px-1.5 text-[8px]">GRATIS</Badge>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="shrink-0 p-2 border-t-2">
        <SidebarMenu>
          {isPlatformAdmin ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/admin'} tooltip="SaaS Master" className={cn("h-11 rounded-xl", pathname === '/admin' ? "bg-accent text-white" : "hover:bg-accent/5")}>
                <Link href="/admin" className="flex items-center gap-3">
                  <ShieldAlert className="h-5 w-5" />
                  <span className="font-black text-sm uppercase">Consola SaaS Master</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            canViewBilling && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Pagos" className={cn("h-10 rounded-xl", pathname === '/billing' ? "bg-emerald-500 text-white" : "hover:bg-emerald-50 text-emerald-600")}>
                  <Link href="/billing" className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5" />
                    <span className="text-sm font-bold">Suscripción</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          )}
          
          {!['Contable','ContableIndependiente'].includes(profile?.role) && <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Ajustes">
              <Link href="/settings" className="flex items-center gap-3 h-10 rounded-xl hover:bg-muted">
                <Settings className="h-5 w-5" />
                <span className="text-sm font-bold">Ajustes</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Salir" className="flex items-center gap-3 h-10 rounded-xl hover:bg-destructive/5 text-destructive">
              <LogOut className="h-5 w-5" />
              <span className="text-sm font-bold">Salir</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
    </>
  );
}
