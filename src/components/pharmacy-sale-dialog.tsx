'use client';

import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { estimatedRefillDate, type PharmacySaleSelection } from '@/lib/pharmacy-follow-up';

type Customer = { id: string; firstName?: string; lastName?: string; phoneNumber?: string };
type CartItem = { id: string; productId?: string; name: string; quantity: number };

export function PharmacySaleDialog({ open, onOpenChange, colmadoId, customers, cart, value, onChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colmadoId: string;
  customers: Customer[];
  cart: CartItem[];
  value: PharmacySaleSelection;
  onChange: (value: PharmacySaleSelection) => void;
}) {
  const db = useFirestore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const filtered = customers.filter(customer => `${customer.firstName || ''} ${customer.lastName || ''} ${customer.phoneNumber || ''}`.toLowerCase().includes(search.toLowerCase())).slice(0, 20);

  const createCustomer = async () => {
    const name = newName.trim().replace(/\s+/g, ' ');
    const phone = newPhone.replace(/\D/g, '');
    if (!name || phone.length < 10 || phone.length > 15 || !colmadoId) {
      toast({ variant: 'destructive', title: 'Indica el nombre y un teléfono válido.' });
      return;
    }
    const existing = customers.find(customer => (customer.phoneNumber || '').replace(/\D/g, '') === phone);
    if (existing) {
      onChange({ ...value, customerId: existing.id, customerName: `${existing.firstName || ''} ${existing.lastName || ''}`.trim(), customerPhone: phone, doses: value.customerId === existing.id ? value.doses : {}, followUpConsent: value.customerId === existing.id && value.followUpConsent });
      toast({ title: 'Cliente existente seleccionado' });
      return;
    }
    setSaving(true);
    try {
      const id = `cust_${crypto.randomUUID()}`;
      const [firstName, ...rest] = name.split(' ');
      const now = new Date().toISOString();
      await setDoc(doc(db, 'colmados', colmadoId, 'customers', id), {
        id, colmadoId, firstName, lastName: rest.join(' '), phoneNumber: phone,
        address: '', creditLimit: 0, currentDebt: 0, customerType: 'Contado',
        createdAt: now, updatedAt: now,
      });
      onChange({ ...value, customerId: id, customerName: name, customerPhone: phone, doses: {}, followUpConsent: false });
      setNewName(''); setNewPhone('');
      toast({ title: 'Cliente de contado registrado' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo registrar el cliente', description: error instanceof Error ? error.message : 'Intenta nuevamente.' });
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Venta a cliente registrado · Farmacia</DialogTitle>
        <DialogDescription>Vincula la venta de contado y registra únicamente la pauta indicada en la etiqueta o por el profesional de salud. La fecha de reposición es aproximada.</DialogDescription>
      </DialogHeader>
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="pharmacy-customer-search">Cliente</Label>
          <Input id="pharmacy-customer-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre o teléfono" />
          <div className="max-h-36 overflow-auto rounded-lg border">
            {filtered.map(customer => <button key={customer.id} type="button" onClick={() => onChange({ ...value, customerId: customer.id, customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(), customerPhone: customer.phoneNumber || '', doses: value.customerId === customer.id ? value.doses : {}, followUpConsent: value.customerId === customer.id && value.followUpConsent })} className={`block w-full border-b px-3 py-2 text-left text-sm last:border-0 ${value.customerId === customer.id ? 'bg-blue-50 font-bold text-blue-900' : 'hover:bg-muted'}`}>
              {customer.firstName} {customer.lastName} · {customer.phoneNumber || 'Sin teléfono'}
            </button>)}
            {!filtered.length && <p className="p-3 text-sm text-muted-foreground">No se encontró el cliente.</p>}
          </div>
          {value.customerId && <p className="text-sm font-semibold text-blue-800">Seleccionado: {value.customerName} <button type="button" className="ml-2 underline" onClick={() => onChange({ ...value, customerId: '', customerName: '', customerPhone: '', doses: {}, followUpConsent: false })}>Quitar</button></p>}
        </div>
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="mb-3 text-sm font-bold">Registrar cliente de contado</p>
          <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Nombre del nuevo cliente" value={newName} onChange={event => setNewName(event.target.value)} placeholder="Nombre y apellido" /><Input aria-label="Teléfono del nuevo cliente" inputMode="tel" value={newPhone} onChange={event => setNewPhone(event.target.value)} placeholder="Teléfono" /></div>
          <Button type="button" variant="outline" className="mt-2" disabled={saving || !newName.trim() || !newPhone.trim()} onClick={createCustomer}>{saving ? 'Guardando…' : 'Guardar y seleccionar'}</Button>
        </div>
        {value.customerId && <>
          <div className="space-y-3">
            <p className="font-bold">Artículos con seguimiento de reposición</p>
            {cart.map(item => {
              const productId = item.productId || item.id;
              const draft = value.doses[productId] || { enabled: false, unitsSupplied: '', unitsPerDose: '', dosesPerDay: '', instructions: '' };
              const change = (patch: Partial<typeof draft>) => onChange({ ...value, doses: { ...value.doses, [productId]: { ...draft, ...patch } } });
              let estimate = '';
              if (draft.enabled && draft.unitsSupplied && draft.unitsPerDose && draft.dosesPerDay) {
                try { const result = estimatedRefillDate(new Date(), Number(draft.unitsSupplied), Number(draft.unitsPerDose), Number(draft.dosesPerDay)); estimate = `Reposición estimada: ${result.date} (${result.days} días)`; } catch { /* La validación se muestra al cobrar. */ }
              }
              return <div key={item.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3"><span className="font-semibold">{item.name} · {item.quantity} en carrito</span><Switch aria-label={`Seguir ${item.name}`} checked={draft.enabled} onCheckedChange={enabled => change({ enabled })} /></div>
                {draft.enabled && <div className="mt-3 space-y-3"><div className="grid gap-2 sm:grid-cols-3"><div><Label>Cápsulas/unidades entregadas</Label><Input type="number" min="1" step="any" value={draft.unitsSupplied} onChange={event => change({ unitsSupplied: event.target.value })} /></div><div><Label>Unidades por toma</Label><Input type="number" min="0.01" step="any" value={draft.unitsPerDose} onChange={event => change({ unitsPerDose: event.target.value })} /></div><div><Label>Tomas por día</Label><Input type="number" min="0.01" step="any" value={draft.dosesPerDay} onChange={event => change({ dosesPerDay: event.target.value })} /></div></div><div><Label>Indicaciones registradas</Label><Input maxLength={500} value={draft.instructions} onChange={event => change({ instructions: event.target.value })} placeholder="Ej.: según etiqueta o indicación recibida" /></div>{estimate && <p className="text-sm font-semibold text-blue-800">{estimate}</p>}</div>}
              </div>;
            })}
          </div>
          <label className="flex items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm"><input type="checkbox" checked={value.followUpConsent} onChange={event => onChange({ ...value, followUpConsent: event.target.checked })} /> El cliente autoriza que le contactemos para ofrecer reposición.</label>
          <p className="text-xs text-muted-foreground">El sistema no prescribe ni modifica dosis. La estimación supone uso diario según la pauta ingresada; el consumo real puede variar.</p>
        </>}
      </div>
      <DialogFooter><Button type="button" onClick={() => onOpenChange(false)}>Listo para cobrar</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
