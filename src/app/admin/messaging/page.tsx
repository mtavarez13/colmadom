'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BellRing, CalendarClock, CheckCircle2, Mail, MessageCircle, Plus, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Template = { id?: string; name: string; channel: 'email' | 'whatsapp'; category: 'welcome' | 'recommendation' | 'custom';
  subject: string; body: string; metaTemplateName: string; metaLanguage: string; parameters: string[];
  autoOnSignup: boolean; delayDays: number; enabled: boolean };
type Store = { id: string; name: string; ownerEmail: string; ownerPhone: string; ownerMarketingConsent: boolean };
type CenterData = { templates: Template[]; campaigns: any[]; deliveries: any[]; stores: Store[];
  channels: { id: string; displayPhone: string; verifiedName: string }[]; senderConnectionId: string;
  smtpConfigured: boolean; cronConfigured: boolean; cronLastRunAt: string };

const emptyTemplate: Template = { name: '', channel: 'email', category: 'welcome', subject: '', body: '',
  metaTemplateName: '', metaLanguage: 'es', parameters: [], autoOnSignup: false, delayDays: 0, enabled: false };
const welcomeExample: Template = { ...emptyTemplate, name: 'Bienvenida al dueño', subject: 'Bienvenido a Colmadom Cloud, {nombre}',
  body: 'Hola {nombre}:\n\nTu negocio {negocio} ya está registrado en Colmadom Cloud. Tienes {dias_prueba} días de prueba.\n\nIngresa aquí: {enlace}\n\nSi necesitas ayuda, escríbenos al {soporte}.',
  autoOnSignup: true, enabled: false };
const tipExample: Template = { ...emptyTemplate, name: 'Primer consejo de inventario', category: 'recommendation',
  subject: 'Una idea para organizar {negocio}', body: 'Hola {nombre}:\n\nUn inventario inicial te ayuda a conocer el stock real y los productos que más se venden. Puedes empezar desde el módulo de Inventario de {negocio}.\n\nEntra a {enlace}. Si necesitas orientación, contáctanos al {soporte}.',
  autoOnSignup: true, delayDays: 3, enabled: false };

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function SaasMessagingPage() {
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const [data, setData] = useState<CenterData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState<Template>(emptyTemplate);
  const [templateId, setTemplateId] = useState('');
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [allOwners, setAllOwners] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  useEffect(() => { setScheduledAt(localDateTime(new Date(Date.now() + 15 * 60000))); }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/admin/messaging', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo abrir el centro.');
      setData(result); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar.'); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);

  const act = async (payload: Record<string, unknown>, success: string) => {
    if (!user) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/messaging', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar.');
      toast({ title: success, description: result.targetCount ? `${result.targetCount} destinatarios programados.` : undefined });
      await load();
      return result;
    } catch (cause) {
      toast({ variant: 'destructive', title: 'No se completó la operación', description: cause instanceof Error ? cause.message : '' });
      return null;
    } finally { setBusy(false); }
  };

  const eligibleStores = useMemo(() => (data?.stores || []).filter(store =>
    (template.category === 'welcome' || store.ownerMarketingConsent) &&
    (template.channel === 'email' ? Boolean(store.ownerEmail) : Boolean(store.ownerPhone))), [data, template.category, template.channel]);
  const currentTemplate = data?.templates.find(item => item.id === templateId);
  const scheduleMillis = Date.parse(scheduledAt);
  const preview = (value: string) => value.replaceAll('{nombre}', 'María').replaceAll('{negocio}', 'Colmado Ejemplo')
    .replaceAll('{dias_prueba}', '20').replaceAll('{enlace}', 'https://colmadom.hispaniolapay.com/login').replaceAll('{soporte}', '809-458-3731');

  if (isUserLoading || !data && !error) return <div className="p-8">Cargando centro de mensajería…</div>;
  return <main className="mx-auto max-w-7xl space-y-7 p-4 pb-16 md:p-8">
    <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-purple-950 to-purple-700 p-6 text-white shadow-xl md:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><Badge className="mb-3 bg-orange-500">SAAS MASTER</Badge>
        <h1 className="text-3xl font-black md:text-4xl">Centro de mensajería y correo</h1>
        <p className="mt-2 max-w-2xl text-purple-100">Da la bienvenida a nuevos dueños, programa recomendaciones y revisa cada entrega desde un solo lugar.</p></div>
        <Button asChild variant="secondary"><Link href="/admin">Volver a SaaS</Link></Button></div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{error} <Button size="sm" variant="outline" onClick={() => void load()}>Reintentar</Button></div>}
    {data && <>
      <section className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="flex items-center gap-4 p-5"><Mail className="h-8 w-8 text-purple-600"/><div><b>Correo SMTP</b><p className="text-sm">{data.smtpConfigured ? 'Configurado' : 'Pendiente de configurar'}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><MessageCircle className="h-8 w-8 text-emerald-600"/><div><b>WhatsApp de SaaS</b><p className="text-sm">{data.senderConnectionId ? 'Remitente seleccionado' : 'Selecciona un canal'}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><CalendarClock className="h-8 w-8 text-orange-600"/><div><b>Programador</b><p className="text-sm">{data.cronLastRunAt ? `Última ejecución: ${new Date(data.cronLastRunAt).toLocaleString('es-DO')}` : data.cronConfigured ? 'Pendiente de primera ejecución' : 'Falta tarea programada'}</p></div></CardContent></Card>
      </section>
      {!data.smtpConfigured && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Para enviar correos configura <b>SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD y SMTP_FROM</b> en las variables de entorno de Hostinger. La contraseña nunca se muestra aquí.</div>}
      <Card><CardHeader><CardTitle>Remitente de WhatsApp</CardTitle><CardDescription>Usa una plantilla aprobada por Meta para mensajes programados a los dueños. Elige el número oficial que enviará estos avisos.</CardDescription></CardHeader><CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1"><Label htmlFor="saas-sender">Canal emisor</Label><select id="saas-sender" className="mt-2 flex h-10 w-full rounded-md border bg-background px-3" value={data.senderConnectionId} onChange={event => setData({ ...data, senderConnectionId: event.target.value })}><option value="">Sin seleccionar</option>{data.channels.map(channel => <option key={channel.id} value={channel.id}>{channel.verifiedName || channel.id} · {channel.displayPhone || channel.id}</option>)}</select></div>
        <Button disabled={busy} onClick={() => void act({ action: 'sender', senderConnectionId: data.senderConnectionId }, 'Remitente guardado')}>Guardar remitente</Button>
      </CardContent></Card>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5"/>Plantillas</CardTitle><CardDescription>Crea el texto una vez y reutilízalo en campañas o secuencias de registro.</CardDescription></CardHeader><CardContent className="space-y-3">
          <Button variant="outline" className="w-full" onClick={() => { setTemplate({ ...emptyTemplate }); setTemplateId(''); }}><Plus className="mr-2 h-4 w-4"/>Nueva plantilla</Button>
          <div className="grid gap-2"><Button variant="outline" onClick={() => { setTemplate(welcomeExample); setTemplateId(''); }}>Usar ejemplo: bienvenida por correo</Button><Button variant="outline" onClick={() => { setTemplate(tipExample); setTemplateId(''); }}>Usar ejemplo: consejo de inventario</Button></div>
          {data.templates.map(item => <button key={item.id} onClick={() => { setTemplate({ ...item, parameters: item.parameters || [] }); setTemplateId(item.id || ''); }} className={`w-full rounded-xl border p-3 text-left transition hover:border-purple-400 ${templateId === item.id ? 'border-purple-500 bg-purple-50' : ''}`}><span className="flex items-center justify-between gap-2"><b>{item.name}</b><Badge variant={item.enabled ? 'default' : 'secondary'}>{item.enabled ? 'Activa' : 'Borrador'}</Badge></span><small className="text-muted-foreground">{item.channel === 'email' ? 'Correo' : 'WhatsApp'} · {item.category} {item.autoOnSignup ? `· ${item.delayDays} día(s) tras registro` : ''}</small></button>)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{templateId ? 'Editar plantilla' : 'Nueva plantilla'}</CardTitle><CardDescription>Variables: {'{nombre}'}, {'{negocio}'}, {'{dias_prueba}'}, {'{enlace}'}, {'{soporte}'}.</CardDescription></CardHeader><CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><div><Label>Nombre interno</Label><Input value={template.name} onChange={e => setTemplate({ ...template, name: e.target.value })}/></div><div><Label>Canal</Label><select className="flex h-10 w-full rounded-md border bg-background px-3" value={template.channel} onChange={e => setTemplate({ ...template, channel: e.target.value as Template['channel'], autoOnSignup: e.target.value === 'whatsapp' && template.category === 'welcome' ? false : template.autoOnSignup })}><option value="email">Correo electrónico</option><option value="whatsapp">WhatsApp Cloud</option></select></div></div>
          <div><Label>Uso</Label><select className="flex h-10 w-full rounded-md border bg-background px-3" value={template.category} onChange={e => setTemplate({ ...template, category: e.target.value as Template['category'], autoOnSignup: e.target.value === 'welcome' && template.channel === 'whatsapp' ? false : template.autoOnSignup })}><option value="welcome">Bienvenida</option><option value="recommendation">Recomendación</option><option value="custom">Otra plantilla</option></select></div>
          {template.channel === 'email' ? <div><Label>Asunto del correo</Label><Input value={template.subject} onChange={e => setTemplate({ ...template, subject: e.target.value })}/></div> : <div className="grid gap-3 sm:grid-cols-2"><div><Label>Nombre aprobado en Meta</Label><Input placeholder="colmadom_recomendacion" value={template.metaTemplateName} onChange={e => setTemplate({ ...template, metaTemplateName: e.target.value })}/></div><div><Label>Idioma y parámetros</Label><Input value={template.metaLanguage} onChange={e => setTemplate({ ...template, metaLanguage: e.target.value })}/><Input className="mt-2" placeholder="{nombre}, {negocio}" value={template.parameters.join(', ')} onChange={e => setTemplate({ ...template, parameters: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })}/></div></div>}
          <div><Label>{template.channel === 'email' ? 'Cuerpo del correo' : 'Vista previa del texto aprobado en Meta'}</Label><Textarea className="mt-2 min-h-40" value={template.body} onChange={e => setTemplate({ ...template, body: e.target.value })}/></div>
          <div className="rounded-xl border bg-slate-50 p-4 text-sm"><b>Vista previa</b>{template.channel === 'email' && <p className="mt-2 font-semibold">{preview(template.subject)}</p>}<p className="mt-2 whitespace-pre-line text-slate-700">{preview(template.body) || 'Escribe un mensaje para ver su vista previa.'}</p></div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={template.autoOnSignup} disabled={template.channel === 'whatsapp' && template.category === 'welcome'} onChange={e => setTemplate({ ...template, autoOnSignup: e.target.checked })}/>Programar automáticamente tras registrar un negocio</label>
          {template.autoOnSignup && <div><Label>Días después del registro (0 = bienvenida inmediata)</Label><Input type="number" min="0" max="90" value={template.delayDays} onChange={e => setTemplate({ ...template, delayDays: Number(e.target.value) })}/></div>}
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={template.enabled} onChange={e => setTemplate({ ...template, enabled: e.target.checked })}/>Plantilla activa</label>
          {template.channel === 'whatsapp' && <p className="text-xs text-muted-foreground">El texto es de referencia. Meta enviará la plantilla aprobada con los parámetros indicados; no se envían mensajes libres fuera de la ventana de atención.</p>}
          <Button disabled={busy || template.name.trim().length < 2 || template.body.trim().length < 10 || template.channel === 'email' && !template.subject.trim()} onClick={async () => { const saved = await act({ action: 'save_template', ...template, id: templateId || undefined }, 'Plantilla guardada'); if (saved?.id) setTemplateId(saved.id); }}>Guardar plantilla</Button>
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5"/>Programar envío a dueños</CardTitle><CardDescription>Selecciona una plantilla activa, una fecha y los negocios. Las recomendaciones solo se envían a dueños que las aceptaron.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2"><div><Label>Plantilla</Label><select className="flex h-10 w-full rounded-md border bg-background px-3" value={templateId} onChange={e => { const item = data.templates.find(x => x.id === e.target.value); setTemplateId(e.target.value); if (item) setTemplate(item); }}><option value="">Selecciona una plantilla</option>{data.templates.filter(item => item.enabled).map(item => <option key={item.id} value={item.id}>{item.name} · {item.channel === 'email' ? 'Correo' : 'WhatsApp'}</option>)}</select></div><div><Label>Enviar desde</Label><Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}/></div></div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={allOwners} onChange={e => setAllOwners(e.target.checked)}/>Todos los dueños elegibles ({eligibleStores.length})</label>
        {!allOwners && <div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">{eligibleStores.map(store => <label key={store.id} className="flex gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={selectedStores.includes(store.id)} onChange={e => setSelectedStores(current => e.target.checked ? [...current, store.id] : current.filter(id => id !== store.id))}/><span><b>{store.name}</b><small className="block break-all text-muted-foreground">{template.channel === 'email' ? store.ownerEmail : store.ownerPhone}</small></span></label>)}{!eligibleStores.length && <p className="text-sm text-muted-foreground">No hay dueños elegibles.</p>}</div>}
        <div className="flex flex-wrap items-center gap-3"><Button disabled={busy || !data.cronConfigured || !currentTemplate?.enabled || !Number.isFinite(scheduleMillis) || !eligibleStores.length || !allOwners && !selectedStores.length || template.channel === 'email' && !data.smtpConfigured || template.channel === 'whatsapp' && !data.senderConnectionId} onClick={() => void act({ action: 'schedule', templateId, scheduledAt: new Date(scheduleMillis).toISOString(), allOwners, storeIds: selectedStores }, 'Envío programado')}><Send className="mr-2 h-4 w-4"/>Programar campaña</Button><Button variant="outline" disabled={busy} onClick={() => void act({ action: 'run_due' }, 'Cola revisada')}><RefreshCw className="mr-2 h-4 w-4"/>Procesar pendientes ahora</Button><span className="text-xs text-muted-foreground">{allOwners ? eligibleStores.length : selectedStores.length} seleccionados</span></div>
      </CardContent></Card>
      <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Campañas y secuencias</CardTitle></CardHeader><CardContent className="space-y-2">{data.campaigns.length ? data.campaigns.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"><div><b>{item.name}</b><p className="text-xs text-muted-foreground">{item.scheduledAt ? new Date(item.scheduledAt).toLocaleString('es-DO') : 'Registro automático'} · {item.status}</p><p>Enviados {item.sentCount || 0} · Fallidos {item.failedCount || 0} · Omitidos {item.skippedCount || 0} / {item.targetCount || 0}</p></div>{item.source === 'manual' && item.status !== 'completed' && item.status !== 'cancelled' && <Button variant="outline" size="sm" disabled={busy} onClick={() => void act({ action: 'cancel', campaignId: item.id }, 'Campaña cancelada')}>Cancelar</Button>}</div>) : <p className="text-sm text-muted-foreground">Aún no hay campañas.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Historial de entregas</CardTitle></CardHeader><CardContent className="max-h-96 space-y-2 overflow-y-auto">{data.deliveries.length ? data.deliveries.map(item => <div key={item.id} className="flex items-start gap-3 rounded-xl border p-3 text-sm">{item.status === 'sent' ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/> : <ShieldAlert className="h-4 w-4 text-amber-600"/>}<div><b>{item.status === 'sent' ? 'Enviado' : item.status === 'skipped' ? 'Omitido' : 'Fallido'} · {item.channel === 'email' ? 'Correo' : 'WhatsApp'}</b><p className="break-all text-muted-foreground">{item.recipient || item.colmadoId}</p>{item.error && <small>{item.error}</small>}</div></div>) : <p className="text-sm text-muted-foreground">No hay envíos procesados.</p>}</CardContent></Card></div>
    </>}
  </main>;
}
