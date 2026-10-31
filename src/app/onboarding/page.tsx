
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where, getDocs, limit, writeBatch } from "firebase/firestore";
import { setDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Store, ArrowRight, Loader2, ShoppingCart, UserCheck, ShieldAlert, Zap, RotateCcw, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const slugify = (text: string) => 
  text.toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export default function OnboardingPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [province, setProvince] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerCedula, setOwnerCedula] = useState("");
  const [businessType, setBusinessType] = useState<"Standard" | "Consignacion">("Standard");
  const [fiscalEnabled, setFiscalEnabled] = useState(false);
  const [rnc, setRnc] = useState("");
  const [legalName, setLegalName] = useState("");
  const [ownerMarketingConsent, setOwnerMarketingConsent] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [hasCheckedInvitations, setHasCheckedInvitations] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isSuperAdmin = (emailAddr: string | null) => 
    emailAddr === "admin@colmadom.com" || 
    emailAddr === "martin.tavarez.gomez@gmail.com" ||
    emailAddr === "tavarezgomezmartin@gmail.com";

  const profileRefOrNull = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);

  const { data: profile, isLoading: isProfileLoading } = useDoc(profileRefOrNull);
  const isSyncing = isUserLoading || (!!user && isProfileLoading);

  useEffect(() => {
    if (isSyncing || !mounted || isLinking) return;
    
    if (!user) {
      router.replace("/login");
      return;
    }

    if (isSuperAdmin(user.email)) {
      router.replace("/admin");
      return;
    }

    // Si ya tiene colmado, redirigir
    if (profile?.colmadoId) {
      if (profile.role === 'Driver') router.replace("/driver");
      else router.replace("/minimarket");
      return;
    }

    // Precargar datos si el perfil ya existe (registro por teléfono)
    if (profile && !ownerFullName) {
      setOwnerFullName(profile.firstName || "");
      setOwnerPhone(profile.phoneNumber || "");
    }

    // Solo buscar invitaciones si tiene email (Google/Email auth)
    if (user.email && !hasCheckedInvitations) {
      const checkInvitations = async () => {
        setIsLinking(true);
        const emailLower = user.email!.toLowerCase();
        
        try {
          const q = query(collection(db, "userProfiles"), where("email", "==", emailLower), limit(1));
          const snap = await getDocs(q);
          
          if (!snap.empty) {
            const invitedProfile = snap.docs[0].data();
            if (invitedProfile.id !== user.uid) {
               const finalProfile: typeof invitedProfile & { role?: string } = {
                 ...invitedProfile,
                 id: user.uid,
                 updatedAt: new Date().toISOString(),
                 isActive: true
               };
               setDocumentNonBlocking(doc(db, "userProfiles", user.uid), finalProfile, { merge: true });
               toast({ title: "Perfil Vinculado" });
               
               setTimeout(() => { 
                 if (finalProfile.role === 'Driver') router.replace("/driver");
                 else router.replace("/minimarket");
               }, 800);
            }
          }
        } catch (error) {
          console.error("Error linking invitation:", error);
        } finally {
          setIsLinking(false);
          setHasCheckedInvitations(true);
        }
      };
      checkInvitations();
    }
  }, [user, isSyncing, profile, db, router, toast, mounted, isLinking, hasCheckedInvitations, ownerFullName]);

  const handleCreateColmado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
        body: JSON.stringify({ name, address, businessPhone, ownerPhone, province, municipality, ownerFullName, ownerCedula, businessType, fiscalEnabled, rnc, legalName, ownerMarketingConsent })
      });
      const result = await response.json();
      if (!response.ok && response.status < 500) throw new Error(result.error || 'No se pudo crear el negocio.');
      if (!response.ok) {
        const colmadoRef = doc(collection(db, 'colmados')), now = new Date(), trialEnd = new Date(now.getTime() + 20 * 86400000);
        const batch = writeBatch(db);
        batch.set(colmadoRef, { id: colmadoRef.id, code: 'CLM-' + Math.floor(1000 + Math.random() * 9000), ownerId: user.uid, name,
          slug: slugify(name) + '-' + colmadoRef.id.slice(-4), address, phoneNumber: businessPhone.replace(/\D/g,''), businessPhone: businessPhone.replace(/\D/g,''), ownerPhone: ownerPhone.replace(/\D/g,''), province, municipality, ownerMarketingConsent,
          ownerEmail: user.email?.toLowerCase() || '', ownerFullName, ownerCedula, businessType, rootColmadoId: colmadoRef.id,
          branchLimit: 1, additionalBranchFee: 0, printerPaperWidth: '80mm', monthlyFee: 1500, subscriptionStatus: 'Trial',
          subscriptionStatusCode: 'PRUEBA', planId: 'standard', trialDays: 20, trialStartDate: now.toISOString(),
          fiscalEnabled, fiscalMode: fiscalEnabled ? 'traditional' : 'disabled', rnc: fiscalEnabled ? rnc.replace(/\D/g,'') : '',
          legalName: fiscalEnabled ? (legalName.trim() || name) : '', defaultEcfType: '32', electronicIssuerAuthorized: false,
          trialEndDate: trialEnd.toISOString(), trialEndAtMillis: trialEnd.getTime(), createdAt: now.toISOString(), updatedAt: now.toISOString() });
        batch.set(doc(db,'userProfiles',user.uid), { colmadoId: colmadoRef.id, rootColmadoId: colmadoRef.id, role: 'Admin', roleCode: 'OWNER',
          subscriptionStatus: 'PRUEBA', phoneNumber: ownerPhone.replace(/\D/g,''), province, municipality, businessName: name,
          trialStartDate: now.toISOString(), trialEndDate: trialEnd.toISOString(), allowedModules: ['pos','minimarket','inventory','customers','reports','expenses','insights','reconciliation','orders','whatsapp','top-sellers'], updatedAt: now.toISOString() }, { merge: true });
        await batch.commit();
        result.trialDays = 20;
      }
      toast({ title: "¡Negocio Creado!", description: "Tu prueba de " + (result.trialDays || 20) + " días está activa." });
      setTimeout(() => router.replace("/minimarket"), 800);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al crear negocio", description: error?.message });
      setLoading(false);
    }
  };

  if (isSyncing || isLinking) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6 bg-muted/30">
        <Loader2 className="h-16 w-16 animate-spin text-primary opacity-20" />
        <p className="font-black text-2xl text-primary tracking-tight">Configurando tu panel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 py-20">
      <Card className="max-w-2xl w-full shadow-2xl border-2 border-primary/10 rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="text-center space-y-2 pb-8 pt-12 bg-primary/5">
          <Badge className="w-fit mx-auto bg-accent text-white border-none font-black uppercase text-[10px] tracking-widest px-4 py-1">ACTIVA TUS 20 DÍAS GRATIS</Badge>
          <CardTitle className="text-3xl md:text-4xl font-black text-primary tracking-tight">Expediente del Negocio</CardTitle>
          <CardDescription className="text-md font-bold text-muted-foreground">Completa los datos de tu colmado para iniciar la prueba de 20 días.</CardDescription>
        </CardHeader>
        <CardContent className="p-8 md:p-12">
          <form onSubmit={handleCreateColmado} className="space-y-8">
            <div className="grid md:grid-cols-2 gap-6">
               <div className="space-y-2">
                 <Label className="font-black text-[10px] uppercase tracking-widest text-primary ml-1">Nombre Comercial</Label>
                 <Input className="h-14 text-lg font-black rounded-2xl border-2 focus:border-primary" placeholder="Ej: Colmado La Esperanza" value={name} onChange={(e) => setName(e.target.value)} required />
               </div>
               <div className="space-y-2">
                 <Label className="font-black text-[10px] uppercase tracking-widest text-primary ml-1">Teléfono del negocio</Label>
                 <Input className="h-14 font-black rounded-2xl border-2" inputMode="tel" placeholder="809-XXX-XXXX" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} required />
               </div>
            </div>

            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase tracking-widest text-primary ml-1">Dirección Exacta</Label>
              <Input className="h-14 font-bold rounded-2xl border-2" placeholder="Ciudad, Sector, Calle, Referencia..." value={address} onChange={(e) => setAddress(e.target.value)} required />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2"><Label className="font-black text-[10px] uppercase tracking-widest text-primary ml-1">Provincia</Label>
                <Input className="h-14 font-bold rounded-2xl border-2" value={province} onChange={e=>setProvince(e.target.value)} placeholder="Ej: Monte Cristi" required /></div>
              <div className="space-y-2"><Label className="font-black text-[10px] uppercase tracking-widest text-primary ml-1">Municipio</Label>
                <Input className="h-14 font-bold rounded-2xl border-2" value={municipality} onChange={e=>setMunicipality(e.target.value)} placeholder="Ej: Las Matas de Santa Cruz" required /></div>
            </div>

            <Separator className="opacity-10" />

            <label className="flex items-start gap-3 rounded-2xl border p-4 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={ownerMarketingConsent} onChange={event => setOwnerMarketingConsent(event.target.checked)} />
              <span><strong>Recibir consejos y recomendaciones de Colmadom</strong><small className="block text-muted-foreground">Opcional. Puedes cambiar esta preferencia desde Ajustes en cualquier momento.</small></span>
            </label>

            <div className="rounded-3xl border-2 border-primary/10 bg-primary/5 p-6 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={fiscalEnabled} onChange={(e) => setFiscalEnabled(e.target.checked)} />
                <span><strong className="block text-primary">Activar configuración fiscal dominicana</strong><small className="text-muted-foreground">Opcional. Habilita NCF, ITBIS, formularios DGII y preparación de facturación electrónica.</small></span>
              </label>
              {fiscalEnabled && <div className="grid md:grid-cols-2 gap-4">
                <Input className="h-12 rounded-xl" placeholder="RNC o cédula fiscal" value={rnc} onChange={(e) => setRnc(e.target.value)} required />
                <Input className="h-12 rounded-xl" placeholder="Razón social registrada" value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
              </div>}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
               <div className="space-y-2">
                 <Label className="font-black text-[10px] uppercase tracking-widest text-muted-foreground ml-1">Nombre del Propietario</Label>
                 <Input className="h-14 font-bold rounded-2xl border-2" placeholder="Nombre completo" value={ownerFullName} onChange={(e) => setOwnerFullName(e.target.value)} required />
               </div>
               <div className="space-y-2">
                 <Label className="font-black text-[10px] uppercase tracking-widest text-muted-foreground ml-1">WhatsApp del dueño</Label>
                 <Input className="h-14 font-black rounded-2xl border-2" inputMode="tel" placeholder="809-XXX-XXXX" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} required />
                 <p className="text-[10px] text-muted-foreground">Recibirá la bienvenida e instrucciones al completar el registro.</p>
               </div>
               <div className="space-y-2">
                 <Label className="font-black text-[10px] uppercase tracking-widest text-muted-foreground ml-1">Cédula del Dueño</Label>
                 <Input className="h-14 font-black rounded-2xl border-2 font-mono" placeholder="000-0000000-0" value={ownerCedula} onChange={(e) => setOwnerCedula(e.target.value)} required />
               </div>
            </div>

            <div className="space-y-4">
              <Label className="font-black text-[10px] uppercase tracking-widest text-primary ml-1">Modalidad de Operación</Label>
              <div className="grid grid-cols-2 gap-4">
                 <div 
                   className={cn(
                     "p-6 rounded-[2rem] border-4 cursor-pointer transition-all flex flex-col items-center text-center gap-3",
                     businessType === 'Standard' ? "border-primary bg-primary/5 shadow-inner" : "border-transparent bg-muted/30 opacity-60 grayscale"
                   )}
                   onClick={() => setBusinessType('Standard')}
                 >
                    <Store className="h-8 w-8 text-primary" />
                    <p className="font-black text-xs uppercase">Negocio Estándar</p>
                    <p className="text-[9px] font-bold leading-tight">Venta tradicional con stock permanente.</p>
                 </div>
                 <div 
                   className={cn(
                     "p-6 rounded-[2rem] border-4 cursor-pointer transition-all flex flex-col items-center text-center gap-3",
                     businessType === 'Consignacion' ? "border-accent bg-accent/5 shadow-inner" : "border-transparent bg-muted/30 opacity-60 grayscale"
                   )}
                   onClick={() => setBusinessType('Consignacion')}
                 >
                    <RotateCcw className="h-8 w-8 text-accent" />
                    <p className="font-black text-xs uppercase">Consignación</p>
                    <p className="text-[9px] font-bold leading-tight">Devolución masiva y stock reseteable.</p>
                 </div>
              </div>
            </div>

            <div className="pt-4">
               <Button type="submit" className="w-full h-20 text-2xl font-black gap-3 rounded-[2rem] shadow-2xl shadow-primary/30 active:scale-95 transition-all bg-primary" disabled={loading}>
                 {loading ? <Loader2 className="animate-spin h-8 w-8" /> : <ShieldCheck className="h-8 w-8" />}
                 Activar Mi Prueba Gratis
               </Button>
               <p className="text-center text-[10px] font-bold text-muted-foreground mt-6 uppercase tracking-widest">Al continuar, aceptas los términos de servicio de Colmadom Cloud &copy; 2026</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
