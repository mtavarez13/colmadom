
"use client";

import { useState } from "react";
import { 
  Banknote, 
  Receipt, 
  CheckCircle2, 
  Wallet, 
  AlertCircle, 
  Loader2, 
  ArrowRight, 
  SmartphoneIcon, 
  UserCircle,
  ShieldCheck,
  Send,
  Phone
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, increment } from "firebase/firestore";
import { updateDocumentNonBlocking, setDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { processBencashRequest } from "@/app/actions/bencash-actions";
import { RecargasDominicanasPanel } from '@/components/recargas-dominicanas-panel';

export default function RemittancesPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [beneficiaryPhone, setBeneficiaryPhone] = useState("");

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);

  const { data: profile } = useDoc(profileRef);

  const colmadoRef = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);

  const { data: colmado, isLoading: isColmadoLoading } = useDoc(colmadoRef);

  const handleProcessRemittance = async () => {
    if (!colmado || !profile || !amount || !beneficiaryPhone) return;
    
    const remittanceAmount = Number(amount);
    
    // Check balance
    const currentBalance = colmado.serviceBalance || 0;
    if (currentBalance < remittanceAmount) {
      toast({
        variant: "destructive",
        title: "Saldo Insuficiente",
        description: `Tu colmado solo tiene RD$${currentBalance.toLocaleString()} disponible.`,
      });
      return;
    }

    setLoading(true);
    try {
      // LLAMADA REAL A BENCASH API VÍA SERVER ACTION PARA REMESA
      const result = await processBencashRequest({
        to: beneficiaryPhone,
        amount: remittanceAmount,
        description: `REMESA BENCASH PARA: ${beneficiaryPhone}`
      });

      if (result.success) {
        // 2. Deduct balance from Colmado
        updateDocumentNonBlocking(doc(db, "colmados", colmado.id), {
          serviceBalance: increment(-remittanceAmount),
          updatedAt: new Date().toISOString()
        });

        // 3. Register transaction
        const txnId = `txn_rem_${Date.now()}`;
        setDocumentNonBlocking(doc(db, "colmados", colmado.id, "transactions", txnId), {
          id: txnId,
          colmadoId: colmado.id,
          transactionType: "Remittance",
          description: `Envío Remesa Bencash - Ref: ${result.data?.txId || 'BENCASH'}`,
          totalAmount: remittanceAmount,
          paymentMethod: "Cash",
          isComplete: true,
          userId: user?.uid,
          cashRegisterSessionId: "active_session",
          createdAt: new Date().toISOString()
        }, { merge: true });

        toast({
          title: "Remesa Despachada",
          description: `Se han enviado RD$${remittanceAmount.toLocaleString()} exitosamente.`,
        });

        setAmount("");
        setBeneficiaryPhone("");
      } else {
        toast({
          variant: "destructive",
          title: "Fallo en Proveedor",
          description: result.error || "Bencash rechazó el envío de remesa.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error de Conexión",
        description: "No se pudo establecer contacto con la red de remesas.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (isColmadoLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      <RecargasDominicanasPanel />
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-primary uppercase">Remesas Bencash</h1>
          <p className="text-muted-foreground mt-1 font-bold">Envío de efectivo directo desde tu caja.</p>
        </div>
        
        <Card className="border-accent bg-accent/5 shadow-xl min-w-[280px] rounded-[2rem]">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-14 w-14 bg-white rounded-2xl flex items-center justify-center shadow-lg border border-accent/20">
              <Wallet className="h-7 w-7 text-accent" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-accent tracking-widest leading-none mb-1">Cupo para Envío</p>
              <p className="text-3xl font-black text-primary">RD${(colmado?.serviceBalance || 0).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </header>

      {(colmado?.serviceBalance || 0) < 1000 && (
        <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 rounded-2xl animate-pulse">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="font-black uppercase text-xs">Balance de Servicios Bajo</AlertTitle>
          <AlertDescription className="text-xs font-bold">
            Tu balance para remesas es menor a RD$1,000. Recarga tu cuenta SaaS para continuar operando.
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-none shadow-2xl rounded-[3rem] overflow-hidden bg-white">
        <CardHeader className="bg-primary text-white p-10 relative overflow-hidden">
          <div className="absolute right-[-20px] top-[-20px] opacity-10 rotate-12"><Send className="h-40 w-40" /></div>
          <div className="relative z-10">
             <CardTitle className="text-3xl font-black uppercase tracking-tight">Nueva Remesa</CardTitle>
             <CardDescription className="text-white/70 font-bold uppercase text-[10px] tracking-widest mt-1">Integración Oficial Bencash Group</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-10 space-y-10">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground ml-1">Teléfono Beneficiario</Label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-primary/30" />
                <Input 
                  placeholder="809-XXX-XXXX" 
                  className="text-2xl h-16 pl-14 font-black border-2 rounded-2xl focus:border-primary"
                  value={beneficiaryPhone}
                  onChange={(e) => setBeneficiaryPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground ml-1">Monto del Envío (RD$)</Label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-primary/20">RD$</span>
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  className="text-4xl h-20 pl-16 font-black border-4 border-primary/10 rounded-3xl focus:border-primary transition-all"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Alert className="bg-primary/5 border-primary/20 rounded-2xl py-6">
             <ShieldCheck className="h-5 w-5 text-primary" />
             <AlertTitle className="font-black uppercase text-xs mb-1">Seguridad de Transacción</AlertTitle>
             <AlertDescription className="text-xs font-bold text-muted-foreground leading-relaxed">
                Esta remesa será procesada instantáneamente. Se descontará del balance maestro de tu colmado y se generará un comprobante digital firmado por Bencash.
             </AlertDescription>
          </Alert>

          <Button
            className="w-full h-24 text-2xl font-black bg-primary hover:bg-primary/90 shadow-2xl gap-4 rounded-[2rem] active:scale-[0.98] transition-all"
            disabled={!amount || !beneficiaryPhone || loading}
            onClick={handleProcessRemittance}
          >
            {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Send className="h-8 w-8" />}
            {loading ? "PROCESANDO ENVÍO..." : "DESPACHAR REMESA"}
          </Button>
        </CardContent>
      </Card>
      
      <footer className="bg-muted/30 p-8 rounded-[2.5rem] border-2 border-dashed flex flex-col md:flex-row items-center justify-between gap-4">
         <div className="flex items-center gap-4">
            <div className="h-14 w-14 bg-white rounded-2xl flex items-center justify-center shadow-md">
               <SmartphoneIcon className="h-7 w-7 text-primary" />
            </div>
            <div>
               <p className="text-sm font-black text-primary uppercase">Pasarela de Remesas Activa</p>
               <p className="text-[11px] text-muted-foreground font-bold italic leading-tight">Cada operación es auditada bajo estándares de cumplimiento DGII y Bencash.</p>
            </div>
         </div>
         <Badge variant="outline" className="border-primary/20 text-primary font-black uppercase text-[10px] py-2 px-6 rounded-full bg-white shadow-sm">
            CANAL DE DEPÓSITOS v5.0
         </Badge>
      </footer>
    </div>
  );
}
