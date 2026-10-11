
"use client";

import { useState, useEffect } from "react";
import { 
  MessageSquare, 
  Users, 
  Send, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Sparkles,
  Loader2,
  Bot,
  Eraser,
  CheckCheck
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, orderBy } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateFiadoReminders } from "@/ai/flows/ai-generated-fiado-reminders";

const QUICK_TEMPLATES = [
  { id: 1, icon: Clock, title: "Cobro", text: "Hola {nombre}, te recordamos tu balance pendiente de RD${monto} en el colmado. ¡Esperamos verte pronto!" },
  { id: 2, icon: CheckCircle2, title: "Pedido", text: "¡Buenas noticias {nombre}! Tu pedido ya está listo. ¿Lo pasas a buscar o te lo enviamos?" },
  { id: 3, icon: Sparkles, title: "Oferta", text: "¡Hola! Tenemos especiales hoy en bebidas y picaderas. ¡Pasa por aquí!" }
];

export default function WhatsAppHubPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [messageBody, setMessageBody] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSavingAutoReply, setIsSavingAutoReply] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [posNotificationsEnabled,setPosNotificationsEnabled]=useState(false);
  const [voiceRepliesEnabled,setVoiceRepliesEnabled]=useState(false);
  const [voiceName,setVoiceName]=useState('Aoede');
  const [registrationPin, setRegistrationPin] = useState("");
  const [metaForm,setMetaForm]=useState({appId:'',appSecret:'',configId:'',verifyToken:'',graphVersion:'v23.0',publicAppUrl:'https://colmadom.hispaniolapay.com'});
  const [savingMeta,setSavingMeta]=useState(false);
  const [cloudForm,setCloudForm]=useState({wabaId:'',phoneNumberId:'',accessToken:'',appSecret:'',webhookVerifyToken:''});
  const [showCloudForm,setShowCloudForm]=useState(false);
  const [campaignAudience,setCampaignAudience]=useState('all');
  const [campaignMessage,setCampaignMessage]=useState('Hola {nombre}, tenemos ofertas especiales para ti en nuestro colmado.');
  const [sendingCampaign,setSendingCampaign]=useState(false);
  const [inboxContacts,setInboxContacts]=useState<any[]>([]);
  const [inboxMessages,setInboxMessages]=useState<any[]>([]);
  const [inboxStatus,setInboxStatus]=useState<any[]>([]);
  const [inboxError,setInboxError]=useState('');

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);

  const { data: profile } = useDoc(profileRef);
  const isPlatformAdmin=['admin@colmadom.com','martin.tavarez.gomez@gmail.com','tavarezgomezmartin@gmail.com'].includes(String(user?.email||'').toLowerCase());

  const refreshConnection = async () => {
    if (!user || profile?.role !== 'Admin') return;
    try {
      const response = await fetch('/api/whatsapp/connection', { headers: { Authorization: 'Bearer ' + await user.getIdToken() } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar la conexión.');
      setConnectionInfo(data);
      setAutoReplyEnabled(data.connection?.autoReplyEnabled === true);
      setWelcomeMessage(data.connection?.welcomeMessage || '¡Hola! Gracias por escribirnos. ¿En qué podemos ayudarte?');
      setPosNotificationsEnabled(data.connection?.posNotificationsEnabled === true);
      setVoiceRepliesEnabled(data.connection?.voiceRepliesEnabled === true);
      setVoiceName(data.connection?.voiceName || 'Aoede');
      if(data.canConfigurePlatform){const configResponse=await fetch('/api/admin/meta-config',{headers:{Authorization:'Bearer '+await user.getIdToken()}}),config=await configResponse.json();if(configResponse.ok)setMetaForm(current=>({...current,appId:config.appId||'',configId:config.configId||'',graphVersion:config.graphVersion||'v23.0',publicAppUrl:config.publicAppUrl||'https://colmadom.hispaniolapay.com'}));}
    } catch (error) { toast({ variant: 'destructive', title: 'Error de WhatsApp', description: error instanceof Error ? error.message : '' }); }
  };

  const sendCampaign=async()=>{if(!user||!campaignMessage.trim())return;setSendingCampaign(true);try{const response=await fetch('/api/whatsapp/campaign',{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json'},body:JSON.stringify({audience:campaignAudience,message:campaignMessage})}),data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo enviar la campaña.');toast({title:'Campaña procesada',description:`Enviados: ${data.sentCount} · Fallidos: ${data.failedCount}`});}catch(error){toast({variant:'destructive',title:'No se pudo enviar la campaña',description:error instanceof Error?error.message:''})}finally{setSendingCampaign(false)}};

  useEffect(() => { if (user && profile?.role === 'Admin') void refreshConnection(); }, [user?.uid, profile?.role, profile?.colmadoId]);

  const refreshInbox=async()=>{if(!user||(!profile?.colmadoId&&!isPlatformAdmin))return;try{const response=await fetch('/api/whatsapp/inbox',{headers:{Authorization:'Bearer '+await user.getIdToken()}}),result=await response.json();if(response.ok){setInboxContacts(result.contacts||[]);setInboxStatus(result.connections||[]);setInboxError('');}else setInboxError(result.error||'No se pudo leer la bandeja.');}catch(error){setInboxError(error instanceof Error?error.message:'No se pudo leer la bandeja.')}};
  useEffect(()=>{if(user&&(profile?.colmadoId||isPlatformAdmin)){void refreshInbox();const timer=setInterval(()=>void refreshInbox(),6000);return()=>clearInterval(timer)}},[user?.uid,profile?.colmadoId,isPlatformAdmin]);
  useEffect(()=>{if(!user||!selectedCustomer?._inbox)return;let active=true;const load=async()=>{try{const headers={Authorization:'Bearer '+await user.getIdToken()},base='/api/whatsapp/inbox?phone='+encodeURIComponent(selectedCustomer.phoneNumber)+'&connectionId='+encodeURIComponent(selectedCustomer.connectionId||'');let cursor='',all:any[]=[];for(let page=0;page<40;page++){const response=await fetch(base+(cursor?'&cursor='+encodeURIComponent(cursor):''),{headers}),result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo cargar el historial.');all=all.concat(result.messages||[]);if(!result.hasMore||!result.nextCursor)break;cursor=result.nextCursor;}if(active){setInboxMessages(all);setInboxError('')}}catch(error){if(active)setInboxError(error instanceof Error?error.message:'No se pudo cargar el historial.')}};void load();const timer=setInterval(()=>void load(),4000);return()=>{active=false;clearInterval(timer)}},[user?.uid,selectedCustomer?.phoneNumber,selectedCustomer?.connectionId,selectedCustomer?._inbox]);

  const connectMeta = async () => {
    if (!user || !connectionInfo?.configured || !connectionInfo?.appId || !connectionInfo?.configId) return;
    setIsConnecting(true);
    let listener: ((event: MessageEvent) => void) | undefined;
    try {
      if (!(window as any).FB) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://connect.facebook.net/es_LA/sdk.js'; script.async = true;
          script.onload = () => resolve(); script.onerror = () => reject(new Error('No se pudo cargar Meta.'));
          document.head.appendChild(script);
        });
      }
      const FB = (window as any).FB;
      FB.init({ appId: connectionInfo.appId, autoLogAppEvents: true, xfbml: false, version: connectionInfo.graphVersion });
      let session: any = null;
      listener = event => {
        if (!/^https:\/\/([a-z0-9-]+\.)*facebook\.com$/i.test(event.origin)) return;
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data?.type === 'WA_EMBEDDED_SIGNUP' && String(data.event || '').startsWith('FINISH')) session = data.data;
        } catch { /* Otros mensajes del SDK */ }
      };
      window.addEventListener('message', listener);
      const code = await new Promise<string>((resolve, reject) => {
        FB.login((response: any) => response?.authResponse?.code ? resolve(response.authResponse.code) : reject(new Error('La conexión se canceló en Meta.')),
          { config_id: connectionInfo.configId, response_type: 'code', override_default_response_type: true,
            extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' } });
      });
      for (let attempt = 0; !session?.waba_id && attempt < 40; attempt++)
        await new Promise(resolve => setTimeout(resolve, 250));
      if (!session?.waba_id) throw new Error('Meta no confirmó la cuenta de WhatsApp. Repite la conexión.');
      const response = await fetch('/api/whatsapp/connection', { method: 'POST', headers: {
        Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/json'
      }, body: JSON.stringify({ action: 'connect', code, wabaId: session.waba_id, phoneNumberId: session.phone_number_id || '' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo conectar el número.');
      toast({ title: 'Número vinculado con Meta', description: 'Completa el registro con tu PIN de 6 dígitos.' });
      await refreshConnection();
    } catch (error) { toast({ variant: 'destructive', title: 'Conexión incompleta', description: error instanceof Error ? error.message : '' }); }
    finally { if (listener) window.removeEventListener('message', listener); setIsConnecting(false); }
  };
  const saveMetaConfig=async()=>{if(!user)return;setSavingMeta(true);try{const response=await fetch('/api/admin/meta-config',{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json'},body:JSON.stringify(metaForm)}),data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo guardar.');setMetaForm(current=>({...current,appSecret:'',verifyToken:''}));toast({title:'Configuración de Meta guardada',description:'Ya puedes verificar el webhook y conectar números.'});await refreshConnection();}catch(error){toast({variant:'destructive',title:'No se pudo guardar Meta',description:error instanceof Error?error.message:''});}finally{setSavingMeta(false);}};
  const connectCloudApi=async()=>{if(!user)return;setIsConnecting(true);try{const response=await fetch('/api/whatsapp/connection',{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json'},body:JSON.stringify({action:'manualConnect',...cloudForm})}),data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo conectar WhatsApp Cloud API.');setCloudForm({wabaId:'',phoneNumberId:'',accessToken:'',appSecret:'',webhookVerifyToken:''});setShowCloudForm(false);toast({title:'WhatsApp Cloud API conectado',description:data.displayPhone||data.verifiedName});await refreshConnection();}catch(error){toast({variant:'destructive',title:'Conexión rechazada por Meta',description:error instanceof Error?error.message:''});}finally{setIsConnecting(false);}};

  const saveAutoReply = async () => {
    if (!user) return;
    setIsSavingAutoReply(true);
    try {
      const response = await fetch('/api/whatsapp/connection', { method: 'POST', headers: {
        Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/json'
      }, body: JSON.stringify({ action: 'settings', autoReplyEnabled, welcomeMessage, posNotificationsEnabled,voiceRepliesEnabled,voiceName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar.');
      toast({ title: 'Respuesta automática guardada' });
      await refreshConnection();
    } catch (error) { toast({ variant: 'destructive', title: 'No se pudo guardar', description: error instanceof Error ? error.message : '' }); }
    finally { setIsSavingAutoReply(false); }
  };

  const registerNumber = async () => {
    if (!user || !/^\d{6}$/.test(registrationPin)) return;
    setIsConnecting(true);
    try {
      const response = await fetch('/api/whatsapp/connection', { method: 'POST', headers: {
        Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/json'
      }, body: JSON.stringify({ action: 'register', pin: registrationPin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Meta no pudo registrar el número.');
      setRegistrationPin('');
      toast({ title: 'Número listo para enviar y recibir mensajes' });
      await refreshConnection();
    } catch (error) { toast({ variant: 'destructive', title: 'Registro pendiente', description: error instanceof Error ? error.message : '' }); }
    finally { setIsConnecting(false); }
  };

  const colmadoRef = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);

  const { data: colmado } = useDoc(colmadoRef);

  const customersQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "customers");
  }, [db, profile?.colmadoId]);

  const { data: customers } = useCollection(customersQuery);

  const registeredCustomers=customers||[];
  const customerByPhone=new Map(registeredCustomers.map(customer=>[String(customer.phoneNumber||'').replace(/\D/g,''),customer]));
  const inboxPhones=new Set(inboxContacts.map(contact=>String(contact.phoneNumber||'').replace(/\D/g,'')));
  const inboxChats=inboxContacts.map(contact=>{const registered:any=customerByPhone.get(String(contact.phoneNumber||'').replace(/\D/g,''));return{...registered,...contact,id:'inbox_'+contact.connectionId+'_'+contact.id,firstName:registered?.firstName||contact.displayName||'WhatsApp',lastName:registered?.lastName||'',currentDebt:Number(registered?.currentDebt||0),_inbox:true}});
  const customersWithoutChat=registeredCustomers.filter(customer=>!inboxPhones.has(String(customer.phoneNumber||'').replace(/\D/g,'')));
  const filteredCustomers=[...inboxChats,...customersWithoutChat].filter(c=>`${c.firstName||''} ${c.lastName||''} ${c.phoneNumber||''}`.toLowerCase().includes(searchTerm.toLowerCase())).sort((a,b)=>String(b.lastMessageAt||'').localeCompare(String(a.lastMessageAt||''))||Number(b.currentDebt||0)-Number(a.currentDebt||0));

  const messagesQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId || !selectedCustomer?.id || selectedCustomer?._inbox) return null;
    return query(
      collection(db, "colmados", profile.colmadoId, "customers", selectedCustomer.id, "messages"),
      orderBy("createdAt", "asc")
    );
  }, [db, profile?.colmadoId, selectedCustomer?.id]);

  const { data: customerChatHistory } = useCollection(messagesQuery);
  const chatHistory=selectedCustomer?._inbox?inboxMessages:customerChatHistory;

  const handleSelectTemplate = (templateText: string) => {
    if (!selectedCustomer) return;
    const processed = templateText
      .replace("{nombre}", selectedCustomer.firstName)
      .replace("{monto}", (selectedCustomer.currentDebt || 0).toLocaleString());
    setMessageBody(processed);
  };

  const handleAiGenerate = async () => {
    if (!selectedCustomer || !colmado) return;
    setIsGeneratingAi(true);
    try {
      const result = await generateFiadoReminders({
        customerName: selectedCustomer.firstName,
        overdueAmount: selectedCustomer.currentDebt || 0,
        overdueDays: 7,
        colmadoName: colmado.name
      });
      setMessageBody(result.smsTemplate);
    } catch (error) {
      toast({ variant: "destructive", title: "Error IA", description: "No se pudo generar el mensaje." });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSendDirect = async () => {
    if (!selectedCustomer?.id || !messageBody.trim() || !user) {
      toast({ variant: 'destructive', title: 'Selecciona un cliente y escribe un mensaje.' });
      return;
    }
    setIsProcessing(true);
    try {
      const response = await fetch(selectedCustomer._inbox?'/api/whatsapp/inbox':'/api/whatsapp/send', { method: 'POST', headers: {
        Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/json'
      }, body: JSON.stringify(selectedCustomer._inbox?{phone:selectedCustomer.phoneNumber,displayName:selectedCustomer.firstName,connectionId:selectedCustomer.connectionId,body:messageBody.trim()}:{customerId:selectedCustomer.id,body:messageBody.trim()}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Meta rechazó el mensaje.');
      toast({ title: 'Mensaje enviado a Meta', description: 'La entrega al cliente depende de WhatsApp.' });
      setMessageBody('');
      if(selectedCustomer._inbox){setTimeout(()=>setSelectedCustomer((current:any)=>current?{...current}:current),300);void refreshInbox();}
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo enviar', description: error instanceof Error ? error.message : '' });
    } finally { setIsProcessing(false); }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-3 md:p-8 max-w-[1500px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="h-12 w-12 bg-[#25D366]/10 rounded-2xl flex items-center justify-center">
            <MessageSquare className="h-7 w-7 text-[#25D366]" />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight text-primary">WhatsApp Hub CRM</h1>
            <p className="text-sm text-muted-foreground font-bold">Comunicación directa integrada en tu panel.</p>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-muted-foreground">Conversaciones</p><p className="text-3xl font-black text-emerald-700">{inboxContacts.length}</p></div><div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-muted-foreground">Último mensaje recibido</p><p className="mt-1 text-sm font-black text-blue-800">{inboxStatus[0]?.lastInboundAt?new Date(inboxStatus[0].lastInboundAt).toLocaleString():'Pendiente'}</p></div><div className="rounded-2xl border border-purple-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-muted-foreground">Bot de pedidos</p><p className="mt-1 text-sm font-black text-purple-800">{inboxStatus.some(item=>item.orderBotEnabled)?'Activo y leyendo inventario':'Desactivado por SaaS'}</p></div></div>
      {inboxError&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">Bandeja sin conexión: {inboxError}</div>}
      {inboxStatus.some(item=>item.lastWebhookError)&&<div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><b>Último error del webhook:</b> {inboxStatus.find(item=>item.lastWebhookError)?.lastWebhookError}</div>}
      {inboxStatus.some(item=>(item.webhookEvents||[]).some((event:any)=>event.status==='Failed'||event.status==='Rejected'))&&<Card className="border-amber-200"><CardHeader><CardTitle className="text-base">Eventos recientes del webhook</CardTitle></CardHeader><CardContent className="space-y-2">{inboxStatus.flatMap((connection:any)=>(connection.webhookEvents||[]).filter((event:any)=>event.status==='Failed'||event.status==='Rejected').map((event:any)=><div key={connection.connectionId+event.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs"><b>{event.eventType}</b> · {event.status}<p className="mt-1">{event.error||'Revisa identificadores del canal y autorización del webhook.'}</p></div>)).slice(0,8)}</CardContent></Card>}
      {inboxStatus.some(item=>item.lastVoiceError)&&<div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm font-bold text-purple-900">La voz usó respaldo de texto: {inboxStatus.find(item=>item.lastVoiceError)?.lastVoiceError}</div>}
      {inboxStatus.some(item=>item.lastBotError)&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">El bot reportó: {inboxStatus.find(item=>item.lastBotError)?.lastBotError}</div>}

      {profile?.role === 'Admin' && <Card className="border-emerald-200 bg-emerald-50/40">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><MessageSquare className="h-5 w-5 text-emerald-600" /> WhatsApp oficial de esta sucursal</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {connectionInfo?.connection ? <div className="rounded-xl border border-emerald-300 bg-white p-4"><p className="font-black text-emerald-800">{connectionInfo.connection.status === 'Connected' ? 'Canal activo' : connectionInfo.connection.status}</p><p className="text-sm">{connectionInfo.connection.displayPhone || 'Número verificado'} {connectionInfo.connection.verifiedName ? '· ' + connectionInfo.connection.verifiedName : ''}</p></div> : <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-black text-amber-900">Canal pendiente de asignación</p><p className="text-sm text-amber-800">El administrador SaaS debe colocar y validar las credenciales de WhatsApp Cloud para este colmado.</p></div>}
          <p className="text-xs text-muted-foreground">Por seguridad, WABA ID, Phone Number ID, token permanente, App Secret y token del webhook solamente se administran desde el panel SaaS.</p>{connectionInfo?.connection&&!connectionInfo?.voiceProviderConfigured&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900">Para enviar notas de voz, agrega GEMINI_API_KEY en las variables de entorno de Hostinger y vuelve a desplegar. Mientras tanto el bot responderá por texto.</div>}
          {connectionInfo?.connection && <div className="border-t pt-4 space-y-3"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={autoReplyEnabled} onChange={event => setAutoReplyEnabled(event.target.checked)} /> Responder automáticamente al primer mensaje del cliente</label><p className="text-xs text-muted-foreground">Se envía como máximo una vez por contacto cada 24 horas.</p><Textarea value={welcomeMessage} onChange={event => setWelcomeMessage(event.target.value)} maxLength={1000} placeholder="Escribe la bienvenida del colmado"/><label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-white p-3 text-sm font-bold"><input className="mt-1" type="checkbox" checked={posNotificationsEnabled} onChange={event=>setPosNotificationsEnabled(event.target.checked)}/><span>Mostrar mensajes entrantes en POS y Minimarket<span className="block text-xs font-normal text-muted-foreground">Los cajeros recibirán un aviso emergente mientras operan esos módulos.</span></span></label><div className="grid gap-3 rounded-xl border border-purple-200 bg-purple-50/60 p-3 md:grid-cols-2"><label className="flex items-start gap-3 text-sm font-bold"><input className="mt-1" type="checkbox" checked={voiceRepliesEnabled} onChange={event=>setVoiceRepliesEnabled(event.target.checked)}/><span>Responder pedidos con nota de voz femenina<span className="block text-xs font-normal text-muted-foreground">Si el audio falla, el bot responde por texto automáticamente.</span></span></label><div><p className="mb-1 text-xs font-bold">Estilo de voz</p><Select value={voiceName} onValueChange={setVoiceName}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Aoede">Femenina amable</SelectItem><SelectItem value="Leda">Femenina juvenil</SelectItem><SelectItem value="Achernar">Femenina suave</SelectItem><SelectItem value="Vindemiatrix">Femenina delicada</SelectItem><SelectItem value="Sulafat">Femenina cálida</SelectItem></SelectContent></Select></div></div><Button variant="outline" onClick={saveAutoReply} disabled={isSavingAutoReply}>{isSavingAutoReply?<Loader2 className="h-4 w-4 animate-spin"/>:'Guardar automatizaciones y avisos'}</Button></div>}
        </CardContent>
      </Card>}

      {profile?.role==='Admin'&&<Card className="border-purple-200"><CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-purple-600"/>Ofertas y mensajes masivos</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Envía por la API oficial a clientes registrados. Puedes usar <b>{'{nombre}'}</b> y <b>{'{deuda}'}</b> dentro del mensaje.</p><Select value={campaignAudience} onValueChange={setCampaignAudience}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos los clientes registrados con teléfono</SelectItem><SelectItem value="debtors">Clientes fiados con deuda pendiente</SelectItem><SelectItem value="frequent">Clientes frecuentes: 3 compras o más en 90 días</SelectItem></SelectContent></Select><Textarea value={campaignMessage} onChange={e=>setCampaignMessage(e.target.value)} maxLength={1000} className="min-h-28"/><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setCampaignMessage('Hola {nombre}, te recordamos que tienes una deuda pendiente de RD${deuda}. Gracias por preferirnos.')}>Recordatorio de fiao</Button><Button variant="outline" onClick={()=>setCampaignMessage('Hola {nombre}, por ser cliente frecuente tenemos ofertas especiales para ti. ¡Visítanos hoy!')}>Oferta cliente frecuente</Button><Button className="bg-purple-700" onClick={sendCampaign} disabled={sendingCampaign||!connectionInfo?.connection||!campaignMessage.trim()}>{sendingCampaign?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Send className="mr-2 h-4 w-4"/>}Enviar campaña</Button></div><p className="text-xs text-muted-foreground">Meta puede exigir una plantilla aprobada para iniciar conversaciones fuera de la ventana de atención de 24 horas. Los resultados y errores quedan registrados por campaña.</p></CardContent></Card>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Contact List */}
        <Card className="lg:col-span-4 shadow-xl border border-emerald-100 overflow-hidden min-h-[620px] lg:h-[700px] flex flex-col">
          <CardHeader className="bg-muted/10 border-b p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar cliente..." 
                className="pl-9 bg-white h-11 rounded-xl" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="divide-y">
                {filteredCustomers.length === 0 ? (
                  <p className="p-10 text-center text-xs text-muted-foreground italic font-bold">No se encontraron clientes.</p>
                ) : filteredCustomers.map((customer) => (
                  <div 
                    key={customer.id} 
                    className={`p-4 flex items-center gap-4 cursor-pointer transition-all ${selectedCustomer?.id === customer.id ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-muted/30'}`}
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center font-black text-white shadow-md ${customer.currentDebt > 0 ? 'bg-destructive' : 'bg-emerald-500'}`}>
                      {customer.firstName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm truncate">{customer.firstName} {customer.lastName}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{customer.phoneNumber}</p>
                    </div>
                    {customer.currentDebt > 0 && (
                      <Badge className="bg-destructive/10 text-destructive border-none text-[9px] font-black">
                        RD${customer.currentDebt.toLocaleString()}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Composer & Chat History */}
        <div className="lg:col-span-8 space-y-8">
          <Card className="shadow-2xl border border-emerald-100 overflow-visible lg:overflow-hidden min-h-[700px] lg:h-[700px] flex flex-col">
            {!selectedCustomer ? (
              <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-4">
                <div className="h-20 w-20 bg-muted/30 rounded-full flex items-center justify-center opacity-20">
                  <MessageSquare className="h-10 w-10" />
                </div>
                <p className="font-black text-muted-foreground italic max-w-xs">Selecciona un cliente de la lista para gestionar sus mensajes y cobros.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 min-h-[700px] lg:h-full">
                {/* Left: Composer */}
                <div className="p-6 border-r flex min-h-[700px] flex-col gap-6 bg-white">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-primary uppercase text-xs tracking-widest">Nuevo Mensaje</h3>
                    <Button variant="ghost" size="sm" onClick={() => setMessageBody("")} title="Limpiar"><Eraser className="h-4 w-4" /></Button>
                  </div>

                  <div className="space-y-4 flex-1">
                    <div className="p-4 bg-muted/20 rounded-2xl border border-dashed flex items-center gap-3">
                      <Bot className="h-6 w-6 text-accent" />
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-accent uppercase">Asistente IA</p>
                        <p className="text-[10px] font-bold text-muted-foreground">Genera recordatorios de cobro.</p>
                      </div>
                      <Button size="sm" className="bg-accent h-8 text-[10px] font-black" onClick={handleAiGenerate} disabled={isGeneratingAi}>
                        {isGeneratingAi ? <Loader2 className="animate-spin h-3 w-3" /> : "GENERAR"}
                      </Button>
                    </div>

                    <Textarea 
                      placeholder="Escribe tu mensaje aquí..." 
                      className="min-h-[200px] rounded-2xl text-sm font-bold shadow-inner"
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">Meta permite mensajes de texto libre durante la conversación activa. Para iniciar una conversación fuera de esa ventana se necesita una plantilla aprobada.</p>

                    <div className="grid grid-cols-3 gap-2">
                      {QUICK_TEMPLATES.map((tpl) => (
                        <Button 
                          key={tpl.id} 
                          variant="outline" 
                          className="h-auto py-2 text-[9px] font-black rounded-xl hover:bg-primary/5 hover:text-primary transition-all"
                          onClick={() => handleSelectTemplate(tpl.text)}
                        >
                          {tpl.title}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="sticky bottom-2 z-20 mt-auto rounded-2xl bg-white pt-3 shadow-[0_-10px_20px_rgba(255,255,255,0.95)]">
                    <Button 
                      className="w-full h-16 bg-[#25D366] hover:bg-[#128C7E] font-black text-xl rounded-2xl shadow-xl gap-3 active:scale-95 transition-all"
                      disabled={!messageBody || isProcessing}
                      onClick={handleSendDirect}
                    >
                      {isProcessing ? <Loader2 className="animate-spin h-6 w-6" /> : <Send className="h-6 w-6" />}
                      Despachar Mensaje
                    </Button>
                  </div>
                </div>

                {/* Right: Real Chat Preview */}
                <div className="bg-muted/10 flex flex-col h-full border-l">
                  <div className="h-16 bg-[#075E54] p-4 flex items-center gap-3 shadow-md">
                    <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-black shadow-inner">
                      {selectedCustomer.firstName[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-black text-sm leading-none">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest">Historial de WhatsApp</p>
                      </div>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-4 bg-[#E5DDD5] relative">
                    <div className="absolute inset-0 opacity-10 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat" />
                    <div className="space-y-3 relative z-10">
                      {chatHistory && chatHistory.length === 0 ? (
                        <div className="py-20 text-center">
                          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest bg-white/50 inline-block px-4 py-1 rounded-full">Sin mensajes previos</p>
                        </div>
                      ) : chatHistory?.map((msg: any) => (
                        <div key={msg.id} className={`flex ${msg.direction === 'Inbound' ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[85%] p-3 rounded-xl shadow-sm relative group ${msg.status === 'Failed' ? 'bg-red-50 border border-red-100' : msg.direction === 'Inbound' ? 'bg-white rounded-tl-none' : 'bg-[#DCF8C6] rounded-tr-none'}`}>
                            <p className="text-[11px] leading-snug whitespace-pre-wrap font-medium">{msg.body}</p>
                            <div className="flex justify-end items-center gap-1 mt-1">
                              <span className="text-[8px] text-zinc-500 font-bold">
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {msg.direction === 'Inbound' ? null : msg.status === 'Delivered' ? (
                                <CheckCheck className="h-3 w-3 text-[#34B7F1]" />
                              ) : msg.status === 'Failed' ? (
                                <AlertCircle className="h-3 w-3 text-destructive" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3 text-zinc-400" />
                              )}
                            </div>
                            {msg.status === 'Failed' && (
                              <p className="text-[8px] text-destructive font-black mt-1 uppercase">Error: {msg.error || "Fallo API"}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  <div className="h-16 bg-[#F0F0F0] p-3 flex items-center gap-2">
                    <div className="flex-1 h-10 bg-white rounded-full border shadow-inner px-4 flex items-center">
                      <span className="text-[10px] text-muted-foreground font-bold">Responde desde el panel del cliente.</span>
                    </div>
                    <div className="h-10 w-10 bg-[#075E54] rounded-full flex items-center justify-center text-white shadow-lg opacity-50 cursor-not-allowed">
                      <Send className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
