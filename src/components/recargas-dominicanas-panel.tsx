'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, RotateCcw, Send, Smartphone, Wifi } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Mode = 'topup' | 'dataPlan' | 'pin' | 'invoice' | 'serviceTopup';
const MODE_LABEL: Record<Mode, string> = { topup: 'Recarga móvil', dataPlan: 'Paqueticos', pin: 'PIN', invoice: 'Facturas', serviceTopup: 'TV / Internet / energía' };
const money = (value: unknown) => `RD$${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const digits = (value: string) => value.replace(/\D/g, '');

export function RecargasDominicanasPanel() {
  const { user } = useUser();
  const { toast } = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [business, setBusiness] = useState<any>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [commissions, setCommissions] = useState<Record<string, number>>({});
  const [transactions, setTransactions] = useState<any[]>([]);
  const [mode, setMode] = useState<Mode>('topup');
  const [productId, setProductId] = useState('');
  const [phone, setPhone] = useState('');
  const [number, setNumber] = useState('');
  const [nic, setNic] = useState('');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [plans, setPlans] = useState<any[]>([]);
  const [planId, setPlanId] = useState('');
  const [invoice, setInvoice] = useState<any>(null);
  const [holder, setHolder] = useState<any>(null);
  const [pinResult, setPinResult] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const visibleProducts = useMemo(() => products.filter(product => {
    const type = String(product.type || '').toLowerCase();
    const category = String(product.category || '').toLowerCase();
    if (mode === 'topup') return type === 'recarga' || category === 'mobile-topup';
    if (mode === 'dataPlan') return type === 'paquetico' || category === 'data-plan';
    if (mode === 'pin') return type === 'pin' || category === 'pin';
    if (mode === 'invoice') return type === 'factura' || category === 'invoice';
    return category === 'energy-topup' || category === 'other';
  }), [products, mode]);

  const refresh = async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const headers = { Authorization: `Bearer ${await user.getIdToken()}` };
      const [productResponse, businessResponse, transactionsResponse] = await Promise.all([
        fetch('/api/services/recargas?action=products', { headers }),
        fetch('/api/services/recargas?action=business', { headers }),
        fetch('/api/services/recargas?action=transactions&page=1&size=10', { headers }),
      ]);
      const [productData, businessData, transactionData] = await Promise.all([productResponse.json(), businessResponse.json(), transactionsResponse.json()]);
      if (!productResponse.ok) throw new Error(productData.error || 'No se pudieron cargar los productos.');
      if (!businessResponse.ok) throw new Error(businessData.error || 'No se pudo consultar la cuenta del proveedor.');
      setProducts((productData.products || []).filter((product: any) => product.enabled !== false));
      setBusiness(businessData.business || null);
      setWalletBalance(Number(productData.walletBalance ?? businessData.walletBalance ?? 0));
      setCommissions(productData.commissions || {});
      setTransactions(transactionData.transactions?.data || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo conectar con Recargas Dominicanas.');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (user) void refresh(); }, [user?.uid]);
  useEffect(() => {
    if (!visibleProducts.some(product => String(product.id) === productId)) setProductId(visibleProducts[0] ? String(visibleProducts[0].id) : '');
    setPlans([]); setPlanId(''); setInvoice(null); setHolder(null); setPinResult('');
  }, [mode, visibleProducts]);

  const getHeaders = async () => ({ Authorization: `Bearer ${await user!.getIdToken()}`, 'Content-Type': 'application/json' });
  const lookup = async (action: 'data-plans' | 'invoice' | 'topup-holder') => {
    if (!user || !productId) return;
    setBusy(action);
    try {
      const query = new URLSearchParams({ action, productId });
      if (action === 'data-plans') query.set('phone', digits(phone));
      if (action === 'topup-holder') query.set('phone', digits(number));
      if (action === 'invoice') query.set('nic', nic.trim());
      const response = await fetch(`/api/services/recargas?${query}`, { headers: await getHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar el proveedor.');
      if (action === 'data-plans') { setPlans(result.plans || []); setPlanId(result.plans?.[0]?.id ? String(result.plans[0].id) : ''); }
      if (action === 'invoice') { setInvoice(result.invoice); setAmount(String(result.invoice?.amount || '')); }
      if (action === 'topup-holder') setHolder(result.holder);
      if (action === 'data-plans') toast({ title: 'Paqueticos disponibles', description: `${result.plans?.length || 0} opciones encontradas.` });
    } catch (cause) {
      toast({ variant: 'destructive', title: 'Consulta no completada', description: cause instanceof Error ? cause.message : '' });
    } finally { setBusy(''); }
  };

  const process = async () => {
    if (!user || !productId) return;
    setBusy('send');
    try {
      const payload: Record<string, unknown> = { action: mode, productId: Number(productId) };
      if (mode === 'topup') Object.assign(payload, { phone: digits(phone), amount: Number(amount) });
      if (mode === 'dataPlan') {
        const selected = plans.find(plan => String(plan.id) === planId);
        Object.assign(payload, { phone: digits(phone), planId, amount: Number(selected?.price || 0) });
      }
      if (mode === 'pin') Object.assign(payload, { price: Number(price) });
      if (mode === 'invoice') Object.assign(payload, { nic: nic.trim(), amount: Number(amount || invoice?.amount) });
      if (mode === 'serviceTopup') Object.assign(payload, { number: digits(number), amount: Number(amount) });
      const response = await fetch('/api/services/recargas', { method: 'POST', headers: await getHeaders(), body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'El proveedor rechazó la operación.');
      const providerTransaction = result.transaction || {};
      const pin = String(providerTransaction.pin || providerTransaction.data?.pin || '');
      setPinResult(mode === 'pin' ? pin : '');
      toast({ title: `${MODE_LABEL[mode]} procesado`, description: `${providerTransaction.product?.name || MODE_LABEL[mode]} · descontado ${money(result.chargedAmount || 0)} del saldo prepago.` });
      setPhone(''); setNumber(''); setAmount(''); setPrice(''); setNic(''); setInvoice(null); setHolder(null); setPlans([]); setPlanId('');
      await refresh();
    } catch (cause) {
      toast({ variant: 'destructive', title: 'No se pudo completar la operación', description: cause instanceof Error ? cause.message : '' });
    } finally { setBusy(''); }
  };

  const selectedProduct = visibleProducts.find(product => String(product.id) === productId);
  const selectedPlan = plans.find(plan => String(plan.id) === planId);
  const serviceAmount = mode === 'pin' ? Number(price) : mode === 'dataPlan' ? Number(selectedPlan?.price || 0) : Number(amount || invoice?.amount || 0);
  const fee = Number(commissions[mode] || 0);
  const totalCharge = Math.round((serviceAmount + fee) * 100) / 100;
  const validPhone = digits(phone).length >= 10;
  const validNumber = digits(number).length >= 5;
  const canProcess = Boolean(productId) && !busy && (
    (mode === 'topup' && validPhone && Number(amount) > 0) ||
    (mode === 'dataPlan' && validPhone && planId && Number(selectedPlan?.price) > 0) ||
    (mode === 'pin' && Number(price) > 0) ||
    (mode === 'invoice' && Boolean(invoice) && Number(amount || invoice?.amount) > 0) ||
    (mode === 'serviceTopup' && validNumber && Number(amount) > 0)
  );

  return <Card className="mb-8 overflow-hidden border-2 border-orange-200 shadow-xl">
    <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50">
      <CardTitle className="flex items-center gap-2 text-orange-900"><Smartphone className="h-5 w-5"/>Recargas Dominicanas</CardTitle>
      <CardDescription>Operaciones con la cuenta central de Recargas Dominicanas. Cada colmado utiliza su propio saldo prepago y comisión configurada por Admin.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5 p-5">
      {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Conectando con Recargas Dominicanas…</div>
      : error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4"/><AlertTitle>Canal no disponible</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      : <>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Saldo prepago del colmado</p><p className="mt-1 text-2xl font-black text-primary">{money(walletBalance)}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Cuenta de servicio</p><p className="mt-1 font-black">{business?.name || 'Recargas Dominicanas'}</p><p className="text-xs text-muted-foreground">Cuenta central administrada por SaaS</p></div>
        </div>
        <Tabs value={mode} onValueChange={value => setMode(value as Mode)}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
            {(Object.keys(MODE_LABEL) as Mode[]).map(key => <TabsTrigger key={key} value={key} className="text-xs">{MODE_LABEL[key]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="grid gap-4 md:grid-cols-2 md:items-end">
          <div className="space-y-2"><Label>{mode === 'invoice' ? 'Empresa de servicio' : mode === 'pin' ? 'PIN disponible' : 'Compañía / producto'}</Label><Select value={productId} onValueChange={setProductId}><SelectTrigger><SelectValue placeholder="Selecciona producto"/></SelectTrigger><SelectContent>{visibleProducts.map(product => <SelectItem key={product.id} value={String(product.id)}>{product.name}</SelectItem>)}</SelectContent></Select>{!visibleProducts.length && <p className="text-xs text-muted-foreground">No hay productos activos para {MODE_LABEL[mode].toLowerCase()}.</p>}</div>
          {mode === 'topup' && <><div className="space-y-2"><Label>Teléfono</Label><Input inputMode="tel" placeholder="809-000-0000" value={phone} onChange={event => setPhone(event.target.value)}/></div><div className="space-y-2"><Label>Monto (RD$)</Label><Input type="number" min={selectedProduct?.min || 1} max={selectedProduct?.max || 100000} placeholder="100" value={amount} onChange={event => setAmount(event.target.value)}/></div></>}
          {mode === 'dataPlan' && <><div className="space-y-2"><Label>Teléfono</Label><Input inputMode="tel" placeholder="809-000-0000" value={phone} onChange={event => setPhone(event.target.value)}/></div><Button variant="outline" disabled={!productId||!validPhone||!!busy} onClick={() => void lookup('data-plans')}>{busy==='data-plans'?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Wifi className="mr-2 h-4 w-4"/>}Consultar paqueticos</Button>{plans.length>0&&<div className="space-y-2"><Label>Plan de datos</Label><Select value={planId} onValueChange={setPlanId}><SelectTrigger><SelectValue placeholder="Selecciona plan"/></SelectTrigger><SelectContent>{plans.map(plan=><SelectItem key={plan.id} value={String(plan.id)}>{plan.name} · {money(plan.price)}</SelectItem>)}</SelectContent></Select></div>}</>}
          {mode === 'pin' && <div className="space-y-2"><Label>Precio del PIN (RD$)</Label><Input type="number" min={selectedProduct?.min||1} max={selectedProduct?.max||100000} value={price} onChange={event=>setPrice(event.target.value)} placeholder="Precio publicado"/></div>}
          {mode === 'invoice' && <><div className="space-y-2"><Label>NIC / contrato</Label><Input value={nic} onChange={event=>setNic(event.target.value)} placeholder="Número de contrato"/></div><Button variant="outline" disabled={!productId||!nic.trim()||!!busy} onClick={()=>void lookup('invoice')}>{busy==='invoice'?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<RotateCcw className="mr-2 h-4 w-4"/>}Consultar factura</Button>{invoice&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm"><p className="font-black">{invoice.name||'Factura pendiente'}</p><p>NIC: {invoice.nic||nic} · Monto: {money(invoice.amount)}</p></div>}</>}
          {mode === 'serviceTopup' && <><div className="space-y-2"><Label>Número de servicio</Label><Input inputMode="numeric" value={number} onChange={event=>setNumber(event.target.value)} placeholder="Número de contrato / línea"/></div><Button variant="outline" disabled={!productId||!validNumber||!!busy} onClick={()=>void lookup('topup-holder')}>{busy==='topup-holder'?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<RotateCcw className="mr-2 h-4 w-4"/>}Consultar titular</Button>{holder&&<div className="rounded-xl border bg-muted/30 p-3 text-sm"><p className="font-black">{holder.fullname||'Titular consultado'}</p><p>{holder.number||number}</p></div>}<div className="space-y-2"><Label>Monto (RD$)</Label><Input type="number" min={selectedProduct?.min||1} max={selectedProduct?.max||100000} value={amount} onChange={event=>setAmount(event.target.value)} placeholder="Monto a recargar"/></div></>}
        </div>
        {mode === 'invoice' && invoice && <div className="space-y-2"><Label>Monto a pagar (RD$)</Label><Input type="number" min="0.01" max={invoice.amount} value={amount||invoice.amount} onChange={event=>setAmount(event.target.value)}/></div>}
        {serviceAmount > 0 && <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm"><div className="flex justify-between"><span>Valor del servicio</span><strong>{money(serviceAmount)}</strong></div><div className="mt-1 flex justify-between"><span>Comisión</span><strong>{money(fee)}</strong></div><div className="mt-2 flex justify-between border-t border-orange-200 pt-2 text-base"><span className="font-black">Total a descontar</span><strong className="font-black">{money(totalCharge)}</strong></div></div>}
        <div className="flex flex-wrap gap-3"><Button onClick={() => void process()} disabled={!canProcess} className="bg-orange-600 hover:bg-orange-700"><Send className="mr-2 h-4 w-4"/>{busy==='send'?'Procesando…':`Procesar ${MODE_LABEL[mode].toLowerCase()}`}</Button><Button variant="outline" onClick={() => void refresh()} disabled={!!busy}><RotateCcw className="mr-2 h-4 w-4"/>Actualizar cuenta</Button></div>
        {pinResult && <Alert className="border-emerald-300 bg-emerald-50"><AlertTitle>PIN generado</AlertTitle><AlertDescription className="font-mono text-lg font-black select-all">{pinResult}</AlertDescription></Alert>}
        {transactions.length>0&&<div className="space-y-2"><p className="font-black text-sm">Últimas operaciones de este colmado</p><div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/40 text-left"><tr><th className="p-3">Fecha</th><th className="p-3">Producto</th><th className="p-3">Teléfono / NIC</th><th className="p-3 text-right">Total descontado</th><th className="p-3">Estado</th></tr></thead><tbody>{transactions.map((item:any)=><tr className="border-t" key={item.id}><td className="p-3">{item.createdAt?new Date(item.createdAt).toLocaleString('es-DO'):''}</td><td className="p-3">{item.productName||item.description||'Servicio'}</td><td className="p-3">{item.customerPhone||'—'}</td><td className="p-3 text-right">{money(item.totalAmount)}</td><td className="p-3">{item.status==='COMPLETED'?'Procesada':item.status}</td></tr>)}</tbody></table></div></div>}
      </>}
    </CardContent>
  </Card>;
}
