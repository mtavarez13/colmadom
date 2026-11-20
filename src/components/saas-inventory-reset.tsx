'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Store = { id: string; name?: string; rootColmadoId?: string; isDeleted?: boolean };
type Preview = { name: string; productCount: number; activeJob: { id: string; processed: number } | null };

export function SaasInventoryReset({ stores }: { stores: Store[] }) {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const activeStores = useMemo(() => stores.filter(store => store.isDeleted !== true).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [stores]);
  const selectedStore = activeStores.find(store => store.id === selectedId);

  useEffect(() => {
    if (activeStores.length && !activeStores.some(store => store.id === selectedId)) setSelectedId(activeStores[0].id);
  }, [activeStores, selectedId]);

  const refresh = async () => {
    if (!user || !selectedId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/inventory-reset?colmadoId=${encodeURIComponent(selectedId)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar el inventario.');
      setPreview(data);
      setProcessed(Number(data.activeJob?.processed || 0));
    } catch (error) {
      setPreview(null);
      toast({ variant: 'destructive', title: 'No se pudo consultar el inventario', description: error instanceof Error ? error.message : '' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPreview(null); void refresh(); }, [selectedId, user?.uid]);

  const send = async (body: Record<string, unknown>) => {
    if (!user) throw new Error('Inicia sesión para continuar.');
    const response = await fetch('/api/admin/inventory-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo reiniciar el inventario.');
    return data;
  };

  const run = async (jobId?: string) => {
    if (!selectedId || !preview) return;
    setBusy(true);
    try {
      const id = jobId || (await send({ action: 'start', colmadoId: selectedId, confirmation })).jobId;
      setDialogOpen(false);
      setConfirmation('');
      let completed = false;
      while (!completed) {
        const result = await send({ action: 'continue', jobId: id });
        setProcessed(Number(result.processed || 0));
        completed = result.completed === true;
      }
      toast({ title: 'Inventario reiniciado', description: `Se conservaron ${preview.productCount} productos. Existencias y precios quedaron en cero.` });
      await refresh();
    } catch (error) {
      toast({ variant: 'destructive', title: 'El reinicio se detuvo', description: `${error instanceof Error ? error.message : 'Intenta de nuevo.'} Puedes reanudarlo desde esta sección.` });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return <Card className="rounded-[2rem] border-2 border-orange-200 shadow-xl">
    <CardHeader><CardTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5" />Reiniciar inventario</CardTitle><CardDescription>Solo administrador SaaS. Elige un colmado o sucursal: sus productos, códigos e imágenes permanecen, y la cantidad, costo y precio de venta pasan a cero.</CardDescription></CardHeader>
    <CardContent className="space-y-4"><div className="space-y-2"><Label>Colmado o sucursal</Label><Select value={selectedId} onValueChange={setSelectedId}><SelectTrigger><SelectValue placeholder="Selecciona una unidad" /></SelectTrigger><SelectContent>{activeStores.map(store => <SelectItem key={store.id} value={store.id}>{store.name || store.id}{store.rootColmadoId && store.rootColmadoId !== store.id ? ' · Sucursal' : ''}</SelectItem>)}</SelectContent></Select></div>
      {loading ? <Loader2 className="animate-spin" /> : preview && <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-orange-50 p-4"><div><p className="font-bold">{preview.name}</p><p className="text-sm text-muted-foreground">{preview.productCount} productos registrados{preview.activeJob ? ` · ${preview.activeJob.processed} procesados` : ''}</p>{busy && <p className="text-sm font-semibold text-orange-700">Procesando: {processed} productos. Mantén esta página abierta.</p>}</div>{preview.activeJob ? <Button disabled={busy} onClick={() => void run(preview.activeJob!.id)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Reanudar reinicio</Button> : <Button variant="destructive" disabled={busy || preview.productCount === 0} onClick={() => setDialogOpen(true)}>Reiniciar este inventario</Button>}</div>}
      <p className="text-xs text-muted-foreground">El reinicio afecta solo la unidad seleccionada. Se conserva un respaldo de las cantidades y precios anteriores para auditoría.</p>
      <Dialog open={dialogOpen} onOpenChange={open => !busy && setDialogOpen(open)}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Confirmar reinicio</DialogTitle><DialogDescription>Se pondrán en cero las existencias, el costo y el precio de venta de todos los productos de {selectedStore?.name}. Esta acción afectará las ventas hasta que vuelvas a cargar los precios y existencias.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="reset-confirmation">Escribe exactamente «{preview?.name}» para confirmar</Label><Input id="reset-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={busy || confirmation.trim() !== preview?.name?.trim()} onClick={() => void run()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Poner cantidad y precios en cero'}</Button></DialogFooter></DialogContent></Dialog>
    </CardContent>
  </Card>;
}
