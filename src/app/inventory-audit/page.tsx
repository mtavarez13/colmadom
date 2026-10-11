"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { 
  ClipboardCheck, 
  Search, 
  Barcode, 
  Camera, 
  CheckCircle2, 
  Loader2, 
  AlertTriangle, 
  Printer, 
  Trash2, 
  Save, 
  RefreshCw,
  Edit3,
  Package,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  X,
  History,
  DollarSign,
  Tag,
  Scale,
  Info,
  ShieldCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, addDoc, orderBy, limit } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { AccountantAuditWorkspace } from '@/components/accountant-audit-workspace';

interface AuditedItem {
  id: string;
  name: string;
  barcode: string;
  previousStock: number;
  newStock: number;
  difference: number;
  unitType: string;
  basePrice: number;
  salePrice: number;
}

export default function InventoryAuditPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [auditedItems, setAuditedItems] = useState<AuditedItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [masterKey, setMasterKey] = useState("");
  const [masterKeyOpen, setMasterKeyOpen] = useState(false);

  // Form states for audit
  const [editName, setEditName] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { 
    setMounted(true);
    const interval = setInterval(() => {
      if (document.activeElement?.tagName !== 'INPUT' && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const profileRef = useMemoFirebase(() => {
    if (!user?.uid) return null;
    return doc(db, "userProfiles", user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc(profileRef);

  const colmadoRef = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return doc(db, "colmados", profile.colmadoId);
  }, [db, profile?.colmadoId]);
  const { data: colmado } = useDoc(colmadoRef);

  const productsQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return collection(db, "colmados", profile.colmadoId, "products");
  }, [db, profile?.colmadoId]);
  const { data: products } = useCollection(productsQuery);
  const historyQuery = useMemoFirebase(() => profile?.colmadoId
    ? query(collection(db, 'colmados', profile.colmadoId, 'inventoryAuditReports'), orderBy('createdAt', 'desc'), limit(50))
    : null, [db, profile?.colmadoId]);
  const { data: auditHistory, isLoading: historyLoading } = useCollection(historyQuery);

  const filteredSearchResults = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return [];
    return products?.filter(p => 
      String(p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode?.includes(searchTerm) ||
      p.barcode2?.includes(searchTerm) ||
      p.barcode3?.includes(searchTerm) ||
      p.codigoBalanza?.toString() === searchTerm
    ).slice(0, 5) || [];
  }, [products, searchTerm]);

  useEffect(() => {
    if (!searchTerm || !products) return;
    const exactMatch = products.find(p => p.barcode === searchTerm || p.barcode2 === searchTerm || p.barcode3 === searchTerm || p.codigoBalanza?.toString() === searchTerm);
    if (exactMatch) {
      handleSelectProduct(exactMatch);
      setSearchTerm("");
    }
  }, [searchTerm, products]);

  const handleSelectProduct = (product: any) => {
    setSelectedProduct(product);
    setEditName(product.name || "");
    setEditBarcode(product.barcode || "");
    setEditStock(product.quantityInStock?.toString() || "0");
    setEditCost(product.basePrice?.toString() || "0");
    setEditPrice(product.salePrice?.toString() || "0");
  };

  const handleSaveAuditItem = async () => {
    if (!selectedProduct || !profile?.colmadoId || !user || !masterKey) return;
    setIsSaving(true);
    const newStockVal = Number(editStock);
    const newCostVal = Number(editCost);
    const newPriceVal = Number(editPrice);
    const diff = newStockVal - (Number(selectedProduct.quantityInStock) || 0);

    try {
      const response = await fetch('/api/inventory-audit/adjust', { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}`
      }, body: JSON.stringify({ colmadoId: profile.colmadoId, productId: selectedProduct.id, productName: editName,
        barcode: editBarcode, newStock: newStockVal, newCost: newCostVal, newPrice: newPriceVal, masterKey }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar.');

      setAuditedItems(prev => [{
        id: selectedProduct.id, 
        name: editName, 
        barcode: editBarcode,
        previousStock: Number(selectedProduct.quantityInStock) || 0,
        newStock: newStockVal, 
        difference: diff, 
        unitType: selectedProduct.unitType || 'un',
        basePrice: newCostVal,
        salePrice: newPriceVal
      }, ...prev.filter(i => i.id !== selectedProduct.id)]);

      toast({ title: "Cambios Guardados", description: `${editName} ha sido actualizado correctamente.` });
      setSelectedProduct(null); setMasterKey(''); setMasterKeyOpen(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Error al guardar", description: e instanceof Error ? e.message : '' });
    } finally { setIsSaving(false); }
  };

  const handleGenerateAuditReport = async () => {
    if (!profile?.colmadoId || !user || auditedItems.length === 0) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'colmados', profile.colmadoId, 'inventoryAuditReports'), {
        colmadoId: profile.colmadoId,
        auditorUid: user.uid,
        auditorName: profile.firstName || user.email || 'Contable',
        auditorRole: profile.role || 'Usuario',
        createdAt: now,
        itemCount: auditedItems.length,
        totalDifference: auditedItems.reduce<number>((sum, item) => sum + item.difference, 0),
        items: auditedItems,
      });
      window.print();
      toast({ title: 'Auditoría registrada', description: 'El expediente quedó guardado y está listo para descargar como PDF.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo generar el reporte', description: error instanceof Error ? error.message : '' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!mounted) return null;
  if (profile?.role === 'Contable') return <AccountantAuditWorkspace profile={profile} />;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 print:p-0">
      <style jsx global>{`
        @media print {
          @page { size: portrait; margin: 10mm; }
          body * { visibility: hidden !important; }
          .print-area-audit, .print-area-audit * { visibility: visible !important; }
          .print-area-audit {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 10mm !important;
            background: white !important;
            color: black !important;
            z-index: 9999 !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* ÁREA DE IMPRESIÓN - REPORTE DE AUDITORÍA */}
      <div className="print-area-audit hidden">
        <div className="text-center mb-8 border-b-2 border-black pb-6">
          <h1 className="text-2xl font-black uppercase text-black">{colmado?.name || "COLMADOM"}</h1>
          <p className="text-xs font-bold text-black/70">{colmado?.address}</p>
          <h2 className="text-lg font-black mt-4 underline uppercase">Reporte de Auditoría de Inventario</h2>
          <p className="text-[9px] text-black/50 mt-1">Fecha: {mounted ? new Date().toLocaleString() : ''}</p>
          <p className="text-[9px] text-black/50">Auditor: {profile?.firstName} {profile?.lastName}</p>
        </div>

        <table className="w-full border-collapse border-2 border-black text-[10px]">
          <thead>
            <tr className="bg-black/5">
              <th className="border border-black p-2 text-left">PRODUCTO</th>
              <th className="border border-black p-2 text-center">ANT.</th>
              <th className="border border-black p-2 text-center">FÍSICO</th>
              <th className="border border-black p-2 text-right">DIF.</th>
              <th className="border border-black p-2 text-right">COSTO</th>
              <th className="border border-black p-2 text-right">VENTA</th>
            </tr>
          </thead>
          <tbody>
            {auditedItems.map((item) => (
              <tr key={item.id}>
                <td className="border border-black p-2 font-bold uppercase">{item.name}</td>
                <td className="border border-black p-2 text-center">{item.previousStock}</td>
                <td className="border border-black p-2 text-center font-black">{item.newStock}</td>
                <td className={cn("border border-black p-2 text-right font-black", item.difference < 0 ? 'text-red-600' : 'text-blue-600')}>
                  {item.difference > 0 ? '+' : ''}{item.difference.toFixed(1)}
                </td>
                <td className="border border-black p-2 text-right">RD${item.basePrice.toLocaleString()}</td>
                <td className="border border-black p-2 text-right font-bold">RD${item.salePrice.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-12 grid grid-cols-2 gap-10 px-6">
          <div className="border-t border-black pt-1 text-center font-black text-[8px] uppercase">FIRMA AUDITOR</div>
          <div className="border-t border-black pt-1 text-center font-black text-[8px] uppercase">FIRMA PROPIETARIO</div>
        </div>
      </div>

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary"><ClipboardCheck className="h-7 w-7" /></div>
          <div>
            <h1 className="text-3xl font-black text-primary tracking-tight">Auditoría Física</h1>
            <p className="text-sm text-muted-foreground font-bold">Conteo de mercancía y reconciliación de precios.</p>
          </div>
        </div>
        <Button onClick={handleGenerateAuditReport} size="lg" className="bg-accent font-black h-14 rounded-2xl shadow-xl gap-2 px-8" disabled={auditedItems.length === 0 || isSaving}>{isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />} Generar Reporte (PDF)</Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 no-print">
        <div className="lg:col-span-4 space-y-6">
          <Card className="shadow-xl border-none rounded-[2rem] overflow-hidden bg-white">
            <CardHeader className="bg-muted/10 border-b"><CardTitle className="text-lg font-black uppercase tracking-widest text-primary">Buscar por Códigos / PLU</CardTitle></CardHeader>
            <CardContent className="p-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                <Input ref={searchInputRef} placeholder="Escanea cualquier código..." className="h-16 pl-12 rounded-2xl font-black text-lg border-2 border-primary/10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              {filteredSearchResults.length > 0 && (
                <div className="mt-4 border rounded-2xl overflow-hidden divide-y shadow-inner">
                  {filteredSearchResults.map((p) => (
                    <div key={p.id} className="p-4 hover:bg-primary/5 cursor-pointer flex justify-between items-center transition-colors" onClick={() => { handleSelectProduct(p); setSearchTerm(""); }}>
                      <p className="font-black text-xs uppercase text-primary">{p.name}</p>
                      <Badge variant="outline" className="text-[8px] uppercase">PLU: {p.codigoBalanza || 'S/P'}</Badge>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-6 p-4 bg-primary/5 rounded-2xl border-2 border-dashed border-primary/20 text-center">
                 <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none">Auto-Focus Activo</p>
                 <p className="text-[8px] font-bold text-muted-foreground mt-1">El sistema está listo para recibir escaneos continuos.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8 space-y-6">
          {selectedProduct ? (
            <Card className="shadow-2xl border-none rounded-[2.5rem] overflow-hidden animate-in zoom-in-95 duration-300">
              <CardHeader className="bg-primary text-white p-8">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner relative overflow-hidden">
                       {selectedProduct.imageUrl ? <Image src={selectedProduct.imageUrl} alt="" fill className="object-cover" unoptimized /> : <Package className="h-8 w-8 text-white" />}
                    </div>
                    <div>
                       <CardTitle className="text-2xl font-black uppercase tracking-tight">{selectedProduct.name}</CardTitle>
                       <p className="text-white/70 font-bold uppercase text-[10px] tracking-widest mt-1">Categoría: {selectedProduct.category}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setSelectedProduct(null)}><X className="h-6 w-6" /></Button>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                   <div className="space-y-4">
                      <Label className="font-black text-xs uppercase tracking-widest text-muted-foreground block text-center">Stock Físico (Contado)</Label>
                      <div className="relative">
                        <Input 
                          type="number" 
                          placeholder="0.00" 
                          className="h-20 text-4xl font-black text-center border-4 border-muted focus:border-primary rounded-[1.5rem] shadow-inner" 
                          value={editStock} 
                          onChange={(e) => setEditStock(e.target.value)} 
                          autoFocus 
                        />
                        <Badge className="absolute -top-2 -right-2 bg-primary text-white h-8 px-3 font-black uppercase text-[9px] border-2 border-white">{selectedProduct.unitType}</Badge>
                      </div>
                   </div>

                   <div className="space-y-4">
                      <Label className="font-black text-xs uppercase tracking-widest text-orange-600 block text-center">Precio Costo (RD$)</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-orange-600 opacity-20" />
                        <Input 
                          type="number" 
                          className="h-20 text-3xl font-black text-center border-2 border-orange-100 bg-orange-50/20 rounded-[1.5rem]" 
                          value={editCost} 
                          onChange={(e) => setEditCost(e.target.value)} 
                        />
                      </div>
                   </div>

                   <div className="space-y-4">
                      <Label className="font-black text-xs uppercase tracking-widest text-emerald-600 block text-center">Precio Venta (RD$)</Label>
                      <div className="relative">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-600 opacity-20" />
                        <Input 
                          type="number" 
                          className="h-20 text-3xl font-black text-center border-2 border-emerald-100 bg-emerald-50/20 rounded-[1.5rem]" 
                          value={editPrice} 
                          onChange={(e) => setEditPrice(e.target.value)} 
                        />
                      </div>
                   </div>
                </div>

                <Alert className="bg-primary/5 border-primary/20 rounded-2xl">
                   <Info className="h-4 w-4 text-primary" />
                   <AlertDescription className="text-[10px] font-bold text-primary/80 leading-relaxed uppercase tracking-wider">
                      Nota: Al guardar, el sistema actualizará el stock físico y los nuevos precios en todo el catálogo (POS y Marketplace).
                   </AlertDescription>
                </Alert>
              </CardContent>
              <CardFooter className="p-8 bg-muted/10 border-t flex gap-4">
                 <Button variant="outline" className="flex-1 h-16 rounded-2xl font-black text-lg border-2" onClick={() => setSelectedProduct(null)}>Cancelar</Button>
                 <Button className="flex-[2] h-16 rounded-2xl font-black text-xl shadow-xl gap-3 bg-primary text-white transition-all active:scale-95" onClick={() => setMasterKeyOpen(true)} disabled={isSaving || !editStock}>
                   {isSaving ? <Loader2 className="animate-spin h-6 w-6" /> : <Save className="h-6 w-6" />}
                   Guardar y Siguiente
                 </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card className="shadow-xl border-none rounded-[2rem] overflow-hidden bg-white">
              <CardHeader className="border-b bg-muted/5 p-6 flex flex-row items-center justify-between">
                 <CardTitle className="text-lg font-black flex items-center gap-2 uppercase tracking-tighter text-primary">
                    <History className="h-5 w-5" /> Log de Auditoría Reciente
                 </CardTitle>
                 <Badge variant="outline" className="font-black uppercase text-[8px] h-5">{auditedItems.length} ITEMS CONTEADOS</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[550px]">
                  {auditedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 opacity-10 space-y-6">
                       <Scale className="h-24 w-24" />
                       <p className="font-black text-2xl tracking-[0.3em]">ESPERANDO ESCANEO</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/30 sticky top-0 z-10">
                        <TableRow>
                           <TableHead className="font-black px-6 uppercase text-[9px]">Producto</TableHead>
                           <TableHead className="font-black text-center uppercase text-[9px]">Dif. Stock</TableHead>
                           <TableHead className="font-black text-right uppercase text-[9px]">Nuevo Costo</TableHead>
                           <TableHead className="font-black text-right px-6 uppercase text-[9px]">Nueva Venta</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditedItems.map((item) => (
                          <TableRow key={item.id} className="hover:bg-muted/10 transition-colors">
                            <TableCell className="py-4 px-6">
                               <p className="font-black text-primary text-xs uppercase">{item.name}</p>
                               <p className="text-[8px] font-mono text-muted-foreground mt-1">NUEVO STOCK: {item.newStock} {item.unitType}</p>
                            </TableCell>
                            <TableCell className="text-center">
                               <Badge className={cn(
                                 "font-black text-[9px] uppercase border-none h-6 px-3",
                                 item.difference < 0 ? 'bg-red-100 text-red-700' : 
                                 item.difference > 0 ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                               )}>
                                  {item.difference > 0 ? '+' : ''}{item.difference.toFixed(1)}
                               </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                               <p className="text-[10px] font-bold text-orange-600">RD${item.basePrice.toLocaleString()}</p>
                            </TableCell>
                            <TableCell className="text-right px-6">
                               <p className="text-sm font-black text-emerald-600">RD${item.salePrice.toLocaleString()}</p>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card className="no-print rounded-[2rem] border-none shadow-xl overflow-hidden">
        <CardHeader className="bg-primary text-white"><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Historial permanente de auditorías</CardTitle><CardDescription className="text-white/70">Últimos ajustes confirmados con clave maestra en esta sucursal.</CardDescription></CardHeader>
        <CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Artículo</TableHead><TableHead>Responsable</TableHead><TableHead className="text-center">Existencia</TableHead><TableHead className="text-right">Costo / Venta</TableHead></TableRow></TableHeader><TableBody>
          {historyLoading ? <TableRow><TableCell colSpan={5} className="py-10 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow> : (auditHistory || []).filter(item => item.kind === 'item-adjustment').length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Todavía no hay ajustes registrados.</TableCell></TableRow> : (auditHistory || []).filter(item => item.kind === 'item-adjustment').map(item => <TableRow key={item.id}><TableCell className="text-xs font-bold">{new Date(item.createdAt).toLocaleString()}</TableCell><TableCell><p className="font-black text-primary">{item.productName}</p><p className="text-xs text-muted-foreground">{item.barcode}</p></TableCell><TableCell><p className="font-bold">{item.auditorName}</p><Badge variant="outline">{item.auditorRole}</Badge></TableCell><TableCell className="text-center font-black">{item.previousStock} → {item.newStock}<p className={cn('text-xs', item.difference < 0 ? 'text-destructive' : 'text-emerald-600')}>{item.difference > 0 ? '+' : ''}{item.difference}</p></TableCell><TableCell className="text-right text-xs"><p>Costo: RD${Number(item.previousCost || 0).toLocaleString()} → RD${Number(item.newCost || 0).toLocaleString()}</p><p>Venta: RD${Number(item.previousPrice || 0).toLocaleString()} → RD${Number(item.newPrice || 0).toLocaleString()}</p></TableCell></TableRow>)}
        </TableBody></Table></CardContent>
      </Card>

      <Dialog open={masterKeyOpen} onOpenChange={(open) => { setMasterKeyOpen(open); if (!open) setMasterKey(''); }}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Confirmar actualización auditada</DialogTitle><DialogDescription>Escribe la clave maestra del colmado. El cambio y su historial se guardarán juntos.</DialogDescription></DialogHeader><div className="space-y-2 py-4"><Label htmlFor="audit-master-key">Clave maestra</Label><Input id="audit-master-key" type="password" autoComplete="off" value={masterKey} onChange={event => setMasterKey(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && masterKey) void handleSaveAuditItem(); }} autoFocus /></div><DialogFooter><Button variant="outline" onClick={() => setMasterKeyOpen(false)}>Cancelar</Button><Button onClick={handleSaveAuditItem} disabled={!masterKey || isSaving}>{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Autorizar y guardar</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
