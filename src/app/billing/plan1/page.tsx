"use client";
import { useCallback,useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { ArrowLeft,CheckCircle2,Loader2,ShieldCheck } from 'lucide-react';
import { useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card,CardContent,CardDescription,CardHeader,CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

declare global { interface Window { paypal?:any } }
const PAYPAL_PLAN1_ID='P-3TB64314LH169562MNLKXWQA';
const PAYPAL_CLIENT_ID=process.env.NEXT_PUBLIC_PAYPAL_PLAN1_CLIENT_ID||'ARiv7dd8Y_HVrVOSsUhvzEmV17-1ohnrsS74_TbVQJhaHK-UKZRAmwJTHh0Mjts7d0tqXmej7uVLOgRL';

export default function PayPalPlan1Page(){
 const {user}=useUser(),{toast}=useToast(),[data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[approved,setApproved]=useState(false),[sdkReady,setSdkReady]=useState(false),[busy,setBusy]=useState(false);
 const buttonRef=useRef<HTMLDivElement>(null),rendered=useRef(false);
 const load=useCallback(async()=>{if(!user)return;setLoading(true);try{const response=await fetch('/api/billing/config',{headers:{Authorization:`Bearer ${await user.getIdToken()}`}}),result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo cargar la suscripción.');setData(result)}catch(error){toast({variant:'destructive',title:'No se pudo abrir Plan 1',description:error instanceof Error?error.message:''})}finally{setLoading(false)}},[user,toast]);
 useEffect(()=>{void load()},[load]);
 const renderButton=useCallback(()=>{
  const currentStatus=String(data?.plan1?.subscriptionStatus||'').toUpperCase(),subscriptionPending=Boolean(data?.plan1?.subscriptionId)&&['APPROVAL_PENDING','APPROVED'].includes(currentStatus);
  if(!sdkReady||rendered.current||!window.paypal||!buttonRef.current||!user||!data?.plan1?.visible||currentStatus==='ACTIVE'||subscriptionPending)return;
  rendered.current=true;
  window.paypal.Buttons({style:{shape:'rect',color:'gold',layout:'vertical',label:'subscribe'},
   createSubscription:(_paypalData:any,actions:any)=>actions.subscription.create({plan_id:PAYPAL_PLAN1_ID,custom_id:`COLMADO:${data.store.id}:${user.uid}`}),
   onApprove:async(paypalData:any)=>{setBusy(true);try{const response=await fetch('/api/billing/paypal/subscribe',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({subscriptionId:paypalData.subscriptionID})}),result=await response.json();if(!response.ok)throw new Error(result.error||'PayPal no confirmó la suscripción.');setApproved(true);toast({title:'Solicitud de suscripción recibida',description:result.status==='ACTIVE'?'La suscripción mensual está activa.':'PayPal está confirmando la activación. Te avisaremos cuando quede activa.'});await load()}catch(error){toast({variant:'destructive',title:'No se pudo confirmar la suscripción',description:error instanceof Error?error.message:''})}finally{setBusy(false)}},
   onCancel:()=>toast({title:'Suscripción cancelada',description:'No se realizó ningún cambio en tu cuenta.'}),
   onError:(error:any)=>toast({variant:'destructive',title:'PayPal',description:error?.message||'No se pudo completar la suscripción.'})
  }).render(buttonRef.current).catch((error:any)=>toast({variant:'destructive',title:'PayPal no está disponible',description:error?.message||'Intenta nuevamente.'}));
 },[sdkReady,user,data,toast,load]);
 useEffect(()=>{renderButton()},[renderButton]);
 if(loading)return <div className="min-h-[60svh] grid place-items-center"><Loader2 className="animate-spin"/></div>;
 if(!data?.plan1?.visible)return <main className="mx-auto max-w-3xl p-4 md:p-8"><Card><CardHeader><CardTitle>Plan 1 todavía no está disponible</CardTitle><CardDescription>La administración aún no ha habilitado la suscripción para este comercio o el aviso tiene una fecha futura.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href="/billing"><ArrowLeft className="mr-2 h-4 w-4"/>Volver a pagos</Link></Button></CardContent></Card></main>;
 const status=String(data.plan1.subscriptionStatus||'').toUpperCase(),active=status==='ACTIVE',pendingSubscription=Boolean(data.plan1.subscriptionId)&&['APPROVAL_PENDING','APPROVED'].includes(status);
 return <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
  <Button asChild variant="ghost" className="-ml-3"><Link href="/billing"><ArrowLeft className="mr-2 h-4 w-4"/>Volver a pagos</Link></Button>
  <Card className="overflow-hidden border-blue-200"><div className="h-2 bg-gradient-to-r from-blue-700 via-blue-500 to-orange-400"/><CardHeader><div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-800"><ShieldCheck/></div><CardTitle className="text-2xl">Suscripción mensual PayPal · Plan 1</CardTitle><CardDescription>Autoriza el cobro recurrente mensual para mantener activa tu suscripción de Colmadom Cloud.</CardDescription></CardHeader><CardContent className="space-y-5">
   {active||approved?<div className="flex gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="shrink-0"/><div><b>Suscripción {active?'activa':'en confirmación'}</b><p className="text-sm">Estado: {data.plan1.subscriptionStatus||'Pendiente de confirmación'}.</p></div></div>:pendingSubscription?<div className="rounded-xl bg-amber-50 p-4 text-amber-950"><b>Tu autorización está pendiente</b><p className="text-sm">Estado PayPal: {data.plan1.subscriptionStatus||'en confirmación'}. No vuelvas a iniciar otra suscripción; vuelve a consultar más tarde.</p><Button variant="outline" className="mt-3" onClick={()=>{rendered.current=false;void load()}}>Actualizar estado</Button></div>:<>
    <div className="rounded-xl bg-slate-50 p-4 text-sm"><p><b>Plan asignado:</b> Plan 1 mensual de PayPal</p><p><b>Comercio:</b> {data.store?.name||data.store?.businessName||'Tu colmado'}</p><p><b>Meses pendientes:</b> {Number(data.plan1.pendingMonths||0)} · se pagan aparte en la pantalla de pagos.</p></div>
    <div ref={buttonRef} className={busy?'pointer-events-none opacity-60':''}/>
    {!sdkReady&&<p className="text-center text-sm text-muted-foreground">Conectando con PayPal…</p>}
    {busy&&<p className="flex items-center justify-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Verificando la autorización con PayPal</p>}
   </>}
   {Number(data.plan1.pendingMonths||0)>0&&<div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950"><b>Meses atrasados: {data.plan1.pendingMonths}</b><p>La suscripción mensual no liquida períodos anteriores. Para pagar el balance pendiente, usa el flujo de pago por meses.</p><Button asChild variant="outline" className="mt-3 border-orange-300 bg-white"><Link href="/billing">Pagar balance pendiente</Link></Button></div>}
   <p className="text-xs text-muted-foreground">La conexión usa el plan de PayPal configurado por Colmadom. La autorización se valida en el servidor; el estado de los cobros se actualiza mediante notificaciones firmadas de PayPal.</p>
  </CardContent></Card>
  <Script src={`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&vault=true&intent=subscription&components=buttons`} onLoad={()=>setSdkReady(true)} onError={()=>toast({variant:'destructive',title:'PayPal no cargó',description:'Revisa la conexión a internet e inténtalo de nuevo.'})}/>
 </main>
}
