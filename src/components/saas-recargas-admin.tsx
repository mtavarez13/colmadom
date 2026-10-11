'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, ShieldCheck, Smartphone, Wallet, Wifi } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const operations = [
  ['topup', 'Recarga móvil'], ['dataPlan', 'Paqueticos'], ['pin', 'PIN'], ['payInvoice', 'Pago de facturas'], ['serviceTopup', 'Servicios (TV, internet, energía)'],
] as const;
const money = (n: number) => `RD$${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
async function read(response: Response) { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación.'); return result; }

export function SaasRecargasAdmin({ colmadoId, colmadoName }: { colmadoId: string; colmadoName: string }) {
  const { user } = useUser(); const { toast } = useToast();
  const [data, setData] = useState<any>({ enabled: false, activeEnvironment: 'test', test: { userName: '', password: '', baseUrl: '' }, production: { userName: '', password: '', baseUrl: 'https://api.recargasdominicanas.do/api' }, commissions: Object.fromEntries(operations.map(([key]) => [key, 0])), wallet: { balance: 0, ledger: [] } });
  const [credit, setCredit] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(''); const [loading, setLoading] = useState(true);
  const token = async () => ({ Authorization: `Bearer ${await user!.getIdToken()}`, 'Content-Type': 'application/json' });

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try { const response = await fetch(`/api/admin/recargas-config?colmadoId=${encodeURIComponent(colmadoId)}`, { headers: await token() }); const result = await read(response); setData((value: any) => ({ ...value, ...result })); }
    catch (error) { toast({ variant: 'destructive', title: 'No se cargó Recargas Dominicanas', description: error instanceof Error ? error.message : '' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [user?.uid, colmadoId]);

  const save = async (test = false) => {
    if (!user) return;
    const env = data.activeEnvironment; setBusy(test ? 'test' : 'save');
    try {
      if (!test) {
        const response = await fetch('/api/admin/recargas-config', { method: 'PUT', headers: await token(), body: JSON.stringify(data) });
        const result = await read(response);
        setData((value: any) => ({ ...value, ...result, test: { ...value.test, ...result.test, password: '' }, production: { ...value.production, ...result.production, password: '' } }));
        toast({ title: 'Cuenta central guardada', description: 'Esta cuenta y las comisiones se aplican a todos los colmados.' });
      } else {
        const response = await fetch('/api/admin/recargas-config', { method: 'POST', headers: await token(), body: JSON.stringify({ environment: env, ...data[env] }) });
        const result = await read(response);
        setData((value: any) => ({ ...value, [env]: { ...value[env], password: '', configured: true, lastTestAt: result.testedAt, lastTestStatus: 'Connected' } }));
        toast({ title: 'Cuenta de Recargas verificada', description: `${result.businessName || 'Cuenta central'} · ${result.productCount} productos.` });
      }
    } catch (error) { toast({ variant: 'destructive', title: test ? 'No se pudo probar la cuenta' : 'No se pudo guardar la configuración', description: error instanceof Error ? error.message : '' }); }
    finally { setBusy(''); }
  };

  const assignCredit = async () => {
    if (!user || !Number(credit)) return;
    setBusy('credit');
    try {
      const response = await fetch('/api/admin/recargas-config', { method: 'POST', headers: await token(), body: JSON.stringify({ action: 'credit', colmadoId, amount: Number(credit), note }) });
      const result = await read(response);
      setData((value: any) => ({ ...value, wallet: { ...value.wallet, balance: result.balance, ledger: result.ledger || value.wallet.ledger } })); setCredit(''); setNote('');
      toast({ title: 'Saldo asignado', description: `${money(Number(credit))} agregados a ${colmadoName}.` });
    } catch (error) { toast({ variant: 'destructive', title: 'No se pudo asignar el saldo', description: error instanceof Error ? error.message : '' }); }
    finally { setBusy(''); }
  };

  if (loading) return <Card><CardContent className="p-8"><Loader2 className="animate-spin"/></CardContent></Card>;
  const env = data.activeEnvironment as 'test' | 'production';
  return <div className="space-y-6 overflow-y-auto p-8">
    <Card className="border-orange-200"><CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="text-orange-600"/>Cuenta única Recargas Dominicanas</CardTitle><CardDescription>Admin administra una sola cuenta de proveedor. La configuración y las comisiones aplican a todos los colmados.</CardDescription></CardHeader><CardContent className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-orange-50 p-4"><label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={data.enabled} onChange={e => setData({ ...data, enabled: e.target.checked })}/>Habilitar servicios de recargas</label><div className="min-w-52"><Label>Ambiente utilizado</Label><Select value={env} onValueChange={activeEnvironment => setData({ ...data, activeEnvironment })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="test">Pruebas</SelectItem><SelectItem value="production">Producción</SelectItem></SelectContent></Select></div></div>
      <div className="grid gap-4 lg:grid-cols-2">{(['test', 'production'] as const).map(name => <div key={name} className="space-y-3 rounded-2xl border p-4"><div className="flex justify-between"><strong>{name === 'test' ? 'Cuenta de prueba' : 'Cuenta de producción'}</strong><Badge variant={data[name]?.configured ? 'default' : 'outline'}>{data[name]?.configured ? 'CONFIGURADA' : data[name]?.passwordConfigured ? 'GUARDADA' : 'PENDIENTE'}</Badge></div><div><Label>URL API</Label><Input className="mt-1" value={data[name]?.baseUrl || ''} readOnly={name === 'production'} placeholder={name === 'production' ? 'https://api.recargasdominicanas.do/api' : 'URL sandbox HTTPS asignada por el proveedor'} onChange={e => setData({ ...data, [name]: { ...data[name], baseUrl: e.target.value } })}/>{name === 'test' && <p className="mt-1 text-xs text-muted-foreground">La documentación pública consultada solo publica producción; la URL de pruebas debe ser suministrada por el proveedor.</p>}</div><div><Label>Usuario de negocio</Label><Input className="mt-1" value={data[name]?.userName || ''} onChange={e => setData({ ...data, [name]: { ...data[name], userName: e.target.value } })}/></div><div><Label>Contraseña</Label><Input className="mt-1" type="password" autoComplete="new-password" value={data[name]?.password || ''} placeholder={data[name]?.passwordConfigured ? 'En blanco conserva la clave' : 'Contraseña'} onChange={e => setData({ ...data, [name]: { ...data[name], password: e.target.value } })}/></div><p className="text-xs text-muted-foreground">Prueba: {data[name]?.lastTestAt ? new Date(data[name].lastTestAt).toLocaleString() : data[name]?.lastTestStatus || 'Sin probar'}</p></div>)}</div>
      <div className="rounded-xl border p-4"><h3 className="mb-3 font-black">Comisión que se cobra al colmado por operación</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{operations.map(([key, label]) => <div key={key}><Label>{label} · RD$</Label><Input className="mt-1" type="number" min="0" step="0.01" value={data.commissions?.[key] ?? 0} onChange={e => setData({ ...data, commissions: { ...data.commissions, [key]: Number(e.target.value) } })}/></div>)}</div><p className="mt-2 text-xs text-muted-foreground">La comisión se suma al valor del servicio y se descuenta del saldo prepago del colmado.</p></div>
      <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => void save(false)} disabled={!!busy}><Save className="mr-2 h-4 w-4"/>Guardar cuenta y comisiones</Button><Button onClick={() => void save(true)} disabled={!!busy}><Wifi className="mr-2 h-4 w-4"/>Probar ambiente seleccionado</Button></div>
    </CardContent></Card>

    <Card className="border-blue-200"><CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="text-blue-700"/>Saldo prepago · {colmadoName}</CardTitle><CardDescription>El colmado paga o acuerda una recarga con Admin; Admin registra el pago y asigna aquí el saldo operativo.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-5 md:grid-cols-[1fr_2fr] md:items-end"><div className="rounded-xl bg-blue-50 p-5"><p className="text-xs font-bold uppercase text-muted-foreground">Disponible para operar</p><p className="mt-1 text-3xl font-black text-blue-800">{money(data.wallet?.balance || 0)}</p></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Monto recibido (RD$)</Label><Input type="number" min="0.01" step="0.01" value={credit} onChange={e => setCredit(e.target.value)} placeholder="Ej. 1000"/></div><div><Label>Nota o referencia de pago</Label><Input value={note} onChange={e => setNote(e.target.value)} placeholder="Transferencia / recibo"/></div><Button className="sm:col-span-2" onClick={() => void assignCredit()} disabled={!!busy || Number(credit) <= 0}><ShieldCheck className="mr-2 h-4 w-4"/>Registrar pago y asignar saldo</Button></div></div><div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/40 text-left"><tr><th className="p-3">Fecha</th><th className="p-3">Movimiento</th><th className="p-3">Nota / referencia</th><th className="p-3 text-right">Monto</th><th className="p-3 text-right">Saldo resultante</th></tr></thead><tbody>{(data.wallet?.ledger || []).map((item: any) => <tr className="border-t" key={item.id}><td className="p-3">{item.createdAt ? new Date(item.createdAt).toLocaleString('es-DO') : item.completedAt ? new Date(item.completedAt).toLocaleString('es-DO') : '—'}</td><td className="p-3">{item.type === 'ADMIN_CREDIT' ? 'Abono recibido' : item.type === 'SALE_COMPLETED' ? 'Servicio y comisión' : item.type === 'SALE_REFUNDED' ? 'Reintegro' : 'Operación pendiente'}</td><td className="p-3">{item.note || item.failure || item.providerReference || '—'}</td><td className="p-3 text-right">{money(item.amount || 0)}</td><td className="p-3 text-right">{money(item.balanceAfter || 0)}</td></tr>)}{!data.wallet?.ledger?.length && <tr><td className="p-4 text-center text-muted-foreground" colSpan={5}>Sin movimientos todavía.</td></tr>}</tbody></table></div></CardContent></Card>
  </div>;
}
