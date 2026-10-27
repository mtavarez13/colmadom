'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, query, where } from 'firebase/firestore';
import { CalendarClock, MessageCircle, Pill, Search } from 'lucide-react';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { santoDomingoDate, type PharmacyFollowUpItem } from '@/lib/pharmacy-follow-up';

type FollowUpRow = PharmacyFollowUpItem & {
  transactionId: string;
  saleDate: string;
  customerId: string;
  customerName: string;
  phone: string;
  consent: boolean;
  daysLeft: number;
};

export default function PharmacyPage() {
  const db = useFirestore();
  const { user } = useUser();
  const [today, setToday] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const refresh = () => setToday(santoDomingoDate(new Date()));
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const profileRef = useMemoFirebase(() => user?.uid ? doc(db, 'userProfiles', user.uid) : null, [db, user?.uid]);
  const { data: profile, isLoading: profileLoading } = useDoc(profileRef);
  const storeRef = useMemoFirebase(() => profile?.colmadoId ? doc(db, 'colmados', profile.colmadoId) : null, [db, profile?.colmadoId]);
  const { data: store } = useDoc(storeRef);
  const allowed = profile?.role === 'Admin' && store?.pharmacyEnabled === true;
  const transactionsRef = useMemoFirebase(() => allowed && profile?.colmadoId ? query(collection(db, 'colmados', profile.colmadoId, 'transactions'), where('hasPharmacyFollowUp', '==', true)) : null, [db, allowed, profile?.colmadoId]);
  const { data: transactions, isLoading } = useCollection(transactionsRef);
  const customersRef = useMemoFirebase(() => allowed && profile?.colmadoId ? collection(db, 'colmados', profile.colmadoId, 'customers') : null, [db, allowed, profile?.colmadoId]);
  const { data: customers } = useCollection(customersRef);

  const rows = useMemo(() => {
    if (!today) return [];
    const latest = new Map<string, FollowUpRow>();
    const customerById = new Map((customers || []).map(customer => [customer.id, customer]));
    for (const sale of transactions || []) {
      if (sale.isAnnulled || !sale.customerId || Number(sale.fiadoAmount || 0) > 0 || !Array.isArray(sale.pharmacyFollowUps)) continue;
      const customer = customerById.get(sale.customerId);
      const customerName = customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : sale.customerName || 'Cliente';
      const phone = customer?.phoneNumber || sale.customerPhone || '';
      for (const item of sale.pharmacyFollowUps as PharmacyFollowUpItem[]) {
        if (!item.productId || !/^\d{4}-\d{2}-\d{2}$/.test(item.estimatedEndDate || '')) continue;
        const key = `${sale.customerId}:${item.productId}`;
        const existing = latest.get(key);
        if (existing && existing.saleDate >= String(sale.createdAt || '')) continue;
        const daysLeft = Math.round((Date.parse(`${item.estimatedEndDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
        latest.set(key, {
          ...item, transactionId: sale.id, saleDate: String(sale.createdAt || ''),
          customerId: sale.customerId, customerName, phone,
          consent: sale.pharmacyFollowUpConsent === true, daysLeft,
        });
      }
    }
    return [...latest.values()].sort((a, b) => a.estimatedEndDate.localeCompare(b.estimatedEndDate));
  }, [transactions, customers, today]);
  const visible = rows.filter(row => `${row.customerName} ${row.productName} ${row.phone}`.toLowerCase().includes(search.toLowerCase()));
  const soon = rows.filter(row => row.daysLeft <= 7).length;

  return <div className="min-h-screen bg-slate-50 p-4 md:p-8">
    <header className="mb-7 flex items-center gap-3"><SidebarTrigger /><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white"><Pill className="h-6 w-6" /></div><div><h1 className="text-2xl font-black">Seguimiento de farmacia</h1><p className="text-sm text-muted-foreground">Ventas de contado a clientes registrados · sucursal actual</p></div></header>
    {!user || profileLoading ? <p>Cargando…</p> : !allowed ? <Card><CardContent className="p-6">Este módulo requiere que admin SaaS active farmacia para este negocio y que ingreses como dueño.</CardContent></Card> : <>
      <div className="mb-5 grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Seguimientos vigentes</p><p className="text-3xl font-black">{rows.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Agotados o próximos 7 días</p><p className="text-3xl font-black text-orange-600">{soon}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Sucursal</p><p className="text-lg font-bold">{store?.name || '—'}</p></CardContent></Card></div>
      <div className="relative mb-5"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar seguimiento" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar cliente, artículo o teléfono" /></div>
      {isLoading ? <p>Cargando ventas…</p> : !visible.length ? <Card><CardContent className="p-8 text-center text-muted-foreground">Aún no hay ventas con seguimiento para esta búsqueda.</CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(row => {
        const normalizedPhone = row.phone.replace(/\D/g, '');
        const message = encodeURIComponent(`Hola ${row.customerName.split(' ')[0]}, te saludamos de ${store?.name || 'la tienda'}. Si necesitas reponer algún producto, estamos a tu disposición.`);
        return <Card key={`${row.customerId}:${row.productId}`} className={row.daysLeft <= 7 ? 'border-orange-300' : ''}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="text-lg">{row.customerName}</CardTitle><Badge variant={row.daysLeft <= 7 ? 'destructive' : 'secondary'}>{row.daysLeft < 0 ? 'Fecha estimada pasada' : row.daysLeft === 0 ? 'Reposición hoy' : `${row.daysLeft} días`}</Badge></div><p className="text-sm text-muted-foreground">{row.phone || 'Sin teléfono'}</p></CardHeader><CardContent className="space-y-3 text-sm"><div><p className="font-bold">{row.productName}</p><p>{row.unitsSupplied} unidades · {row.unitsPerDose} por toma · {row.dosesPerDay} tomas al día</p>{row.instructions && <p className="mt-1 text-muted-foreground">{row.instructions}</p>}</div><p className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" /> Reposición estimada: {row.estimatedEndDate}</p><p className="text-xs text-muted-foreground">Venta: {row.saleDate.slice(0, 10)} · Factura: {row.transactionId}</p>{row.consent && normalizedPhone ? <a className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 font-bold text-white" href={`https://wa.me/${normalizedPhone}?text=${message}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> Ofrecer reposición</a> : <p className="rounded-lg bg-amber-50 p-2 text-xs">Sin autorización de contacto o sin teléfono. No se enviará mensaje.</p>}</CardContent></Card>;
      })}</div>}
      <p className="mt-6 text-xs text-muted-foreground">La fecha supone consumo diario según la pauta registrada. Confirma la necesidad del cliente antes de ofrecer una reposición; no modifiques indicaciones clínicas desde este módulo.</p>
    </>}
  </div>;
}
