'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, UserPlus, Users } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Store = { id: string; name?: string; rootColmadoId?: string; isDeleted?: boolean };
type Owner = { uid: string; colmadoId: string; name: string; email: string; phoneNumber: string; isActive: boolean; accountReady: boolean };

export function SaasStoreOwners({ stores }: { stores: Store[] }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');

  const rootStores = useMemo(() => stores.filter(store => store.isDeleted !== true && (!store.rootColmadoId || store.rootColmadoId === store.id)).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [stores]);
  const selectedStore = rootStores.find(store => store.id === selectedStoreId);
  const selectedOwners = owners.filter(owner => owner.colmadoId === selectedStoreId);

  const loadOwners = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch('/api/admin/store-owners', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los dueños.');
      setOwners(data.owners || []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se cargaron los dueños', description: error instanceof Error ? error.message : '' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadOwners(); }, [user?.uid]);
  useEffect(() => {
    if (rootStores.length && !rootStores.some(store => store.id === selectedStoreId)) setSelectedStoreId(rootStores[0].id);
  }, [rootStores, selectedStoreId]);

  const saveOwner = async () => {
    if (!user || !selectedStoreId) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/store-owners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ mode, colmadoId: selectedStoreId, name, email, phoneNumber, ...(mode === 'create' ? { password } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo asignar el dueño.');
      setDialogOpen(false);
      setName(''); setEmail(''); setPhoneNumber(''); setPassword('');
      await loadOwners();
      toast({ title: mode === 'create' ? 'Dueño registrado' : 'Dueño vinculado', description: `Tiene acceso a ${selectedStore?.name || 'su colmado'} y sus sucursales.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo asignar el dueño', description: error instanceof Error ? error.message : '' });
    } finally {
      setBusy(false);
    }
  };

  return <Card className="rounded-[2rem] border-2 border-blue-100 shadow-xl">
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Dueños de negocios registrados</CardTitle>
      <CardDescription>Registra un dueño con correo o vincula una cuenta existente. Tendrá acceso completo al colmado seleccionado y sus sucursales.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-2"><Label>Colmado</Label><Select value={selectedStoreId} onValueChange={setSelectedStoreId}><SelectTrigger><SelectValue placeholder="Selecciona un colmado" /></SelectTrigger><SelectContent>{rootStores.map(store => <SelectItem key={store.id} value={store.id}>{store.name || store.id}</SelectItem>)}</SelectContent></Select></div>
        <Button disabled={!selectedStoreId} onClick={() => { setMode('create'); setDialogOpen(true); }}><UserPlus className="mr-2 h-4 w-4" />Agregar dueño</Button>
      </div>
      {loading ? <Loader2 className="animate-spin" /> : selectedOwners.length ? <div className="space-y-2">{selectedOwners.map(owner => <div key={owner.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-semibold">{owner.name}</p><p className="text-sm text-muted-foreground">{owner.email}{owner.phoneNumber ? ` · ${owner.phoneNumber}` : ''}</p></div><div className="flex gap-2"><Badge variant={owner.isActive ? 'outline' : 'destructive'}>{owner.isActive ? 'Activo' : 'Desactivado'}</Badge>{!owner.accountReady && <Badge variant="secondary">Acceso pendiente</Badge>}</div></div>)}</div> : <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">Este colmado todavía no tiene un dueño con acceso registrado.</p>}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>Agregar dueño a {selectedStore?.name || 'colmado'}</DialogTitle><DialogDescription>El acceso quedará limitado a este negocio y sus sucursales. El dueño podrá operar todos los módulos disponibles para el negocio.</DialogDescription></DialogHeader>
        <div className="space-y-4"><div className="space-y-2"><Label>Tipo de acceso</Label><Select value={mode} onValueChange={value => setMode(value as 'create' | 'link')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="create">Registrar dueño nuevo</SelectItem><SelectItem value="link">Vincular usuario existente</SelectItem></SelectContent></Select></div>
          {mode === 'create' && <div className="space-y-2"><Label htmlFor="owner-name">Nombre completo</Label><Input id="owner-name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" /></div>}
          <div className="space-y-2"><Label htmlFor="owner-email">Correo electrónico</Label><Input id="owner-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></div>
          {mode === 'create' && <><div className="space-y-2"><Label htmlFor="owner-phone">Teléfono (opcional)</Label><Input id="owner-phone" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} inputMode="tel" /></div><div className="space-y-2"><Label htmlFor="owner-password">Contraseña inicial</Label><Input id="owner-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} /><p className="text-xs text-muted-foreground">Mínimo 8 caracteres. Entrégala al dueño por un canal seguro; no se guardará en el perfil.</p></div></>}
          {mode === 'link' && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Se conservará su forma actual de inicio de sesión. Solo se podrán vincular cuentas sin negocio o del mismo colmado.</p>}
        </div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button disabled={busy || !email || (mode === 'create' && (!name || password.length < 8))} onClick={saveOwner}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'create' ? 'Registrar dueño' : 'Vincular dueño'}</Button></DialogFooter>
      </DialogContent></Dialog>
    </CardContent>
  </Card>;
}
