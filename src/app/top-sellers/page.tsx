"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Trophy, 
  AlertTriangle, 
  Package, 
  TrendingUp, 
  Loader2, 
  Search, 
  Filter,
  Medal,
  Zap,
  Printer,
  ShoppingCart,
  ChevronDown,
  Eye,
  ArrowRight,
  Barcode,
  Tag,
  DollarSign,
  Info,
  ShoppingCartIcon,
  ShoppingBag
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where } from "firebase/firestore";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import { cn } from "@/lib/utils";

export const dynamic = 'force-dynamic';

type FilterType = 'all' | 'critical' | 'top';

export default function TopSellersPage() {
  const { user } = useUser();
  const db = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    setStartDate(lastWeek.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
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
  const { data: products, isLoading: isProductsLoading } = useCollection(productsQuery);

  const transactionsQuery = useMemoFirebase(() => {
    if (!profile?.colmadoId) return null;
    return query(
      collection(db, "colmados", profile.colmadoId, "transactions"),
      where("createdAt", ">=", startDate + "T00:00:00Z"),
      where("createdAt", "<=", endDate + "T23:59:59Z")
    );
  }, [db, profile?.colmadoId, startDate, endDate]);
  const { data: transactions, isLoading: isTxLoading } = useCollection(transactionsQuery);

  const ranking = useMemo(() => {
    if (!transactions || !products) return [];

    const salesMap: Record<string, { qty: number, revenue: number }> = {};

    transactions.forEach(tx => {
      if (tx.isAnnulled) return;
      tx.items?.forEach((item: any) => {
        const id = item.productId || item.id;
        if (!id) return;
        if (!salesMap[id]) salesMap[id] = { qty: 0, revenue: 0 };
        salesMap[id].qty += (Number(item.quantity) || 0);
        salesMap[id].revenue += (Number(item.lineTotal) || 0);
      });
    });

    return products.map(p => {
      const saleData = salesMap[p.id] || { qty: 0, revenue: 0 };
      const currentStock = Number(p.quantityInStock) || 0;
      const minLevel = Number(p.minStockLevel) || 5;
      const isCritical = !p.isCombo && !p.isExtra && currentStock <= minLevel;
      const stockUsage = !p.isCombo && !p.isExtra ? Math.min(100, (currentStock / (minLevel * 4)) * 100) : 100;
      
      const soldQty = saleData.qty;
      const suggestedPurchase = Math.max(0, (soldQty + minLevel) - currentStock);

      return {
        ...p,
        totalSold: soldQty,
        totalRevenue: saleData.revenue,
        isCritical,
        stockUsage,
        suggestedPurchase
      };
    });
  }, [transactions, products]);

  const filteredRanking = useMemo(() => {
    return ranking.filter(p => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        p.name?.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term) ||
        p.barcode?.includes(searchTerm) ||
        p.barcode2?.includes(searchTerm) ||
        p.barcode3?.includes(searchTerm);
      
      if (!matchesSearch) return false;

      if (filterType === 'critical') return p.isCritical;
      if (filterType === 'top') return p.totalSold > 0;
      
      return true;
    }).sort((a, b) => {
      if (a.isCritical && !b.isCritical) return -1;
      if (!a.isCritical && b.isCritical) return 1;
      return b.totalSold - a.totalSold;
    });
  }, [ranking, searchTerm, filterType]);

  const criticalCount = useMemo(() => ranking.filter(p => p.isCritical).length, [ranking]);

  const handlePrintPurchaseList = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 print:p-0">
      <style jsx global>{`
        @media print {
          @page { size: portrait; margin: 15mm; }
          body * { visibility: hidden !important; background: none !important; }
          .print-area-sellers, .print-area-sellers * { visibility: visible !important; }
          .print-area-sellers {
            display: block !important;
            position: relative !important;
            width: 100% !important;
            padding: 10mm !important;
            background: white !important;
            color: black !important;
            z-index: 9999 !important;
            overflow: visible !important;
            font-family: 'PT Sans', sans-serif !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* ÁREA DE IMPRESIÓN - LISTA DE COMPRAS ESTRATÉGICA */}
      <div className="print-area-sellers hidden">
        <div className="flex items-center justify-between mb-12 border-b-8 border-primary pb-10">
          <div className="flex items-center gap-8 text-left">
             {colmado?.logoUrl && (
               <div className="h-32 w-32 relative rounded-3xl overflow-hidden border-4 border-primary/20 shadow-xl shrink-0">
                  <Image src={colmado.logoUrl} alt="Logo" fill className="object-cover" unoptimized />
               </div>
             )}
             <div className="flex-1 min-w-0">
                <h1 className="text-5xl font-black uppercase text-primary leading-[0.9] break-words">{colmado?.name || "COLMADOM"}</h1>
                <p className="text-xl font-bold text-muted-foreground mt-3">{colmado?.address}</p>
             </div>
          </div>
          <div className="text-right shrink-0 ml-6">
             <div className="bg-primary text-white px-10 py-4 rounded-[2rem] shadow-2xl">
                <h2 className="text-2xl font-black uppercase tracking-widest leading-none">Lista de Compras</h2>
             </div>
             <p className="text-xs text-muted-foreground mt-4 uppercase font-black tracking-widest">Emisión: {mounted ? new Date().toLocaleString() : ''}</p>
          </div>
        </div>

        <table className="w-full border-collapse border-2 border-black text-[12px]">
          <thead>
            <tr className="bg-black/5">
              <th className="border border-black p-4 text-left">ARTÍCULO</th>
              <th className="border border-black p-4 text-center">VENDIDO</th>
              <th className="border border-black p-4 text-center">STOCK</th>
              <th className="border border-black p-4 text-center font-black">SUGERIDO</th>
              <th className="border border-black p-4 text-center w-32">ORDENAR</th>
            </tr>
          </thead>
          <tbody>
            {filteredRanking.map((p) => (
              <tr key={p.id}>
                <td className="border border-black p-4 font-black uppercase text-primary">
                  {p.name}
                  {p.isCritical && <span className="ml-2 text-red-600">!!!</span>}
                  <p className="text-[10px] font-normal opacity-50 lowercase">{p.category}</p>
                </td>
                <td className="border border-black p-4 text-center font-bold">{p.totalSold.toFixed(1)}</td>
                <td className="border border-black p-4 text-center font-bold">{Number(p.quantityInStock).toFixed(1)}</td>
                <td className="border border-black p-4 text-center font-black text-blue-700 bg-blue-50/30">
                  {p.suggestedPurchase.toFixed(1)}
                </td>
                <td className="border border-black p-4 bg-black/5"></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-60 grid grid-cols-2 gap-32 px-10">
          <div className="border-t-4 border-black pt-6 text-center font-black uppercase text-sm">FIRMA AUTORIZADO</div>
          <div className="border-t-4 border-black pt-6 text-center font-black uppercase text-sm">RECIBIDO PROVEEDOR</div>
        </div>
      </div>

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <div className="p-3 bg-yellow-100 rounded-2xl">
            <Trophy className="h-8 w-8 text-yellow-600" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-primary">Ranking y Compras</h1>
            <p className="text-muted-foreground mt-1 font-bold italic">Análisis de rotación y estimación de pedidos.</p>
          </div>
        </div>
        <Button 
          onClick={handlePrintPurchaseList} 
          size="lg" 
          className="bg-accent hover:bg-accent/90 font-black h-14 rounded-2xl shadow-xl gap-2 px-8 text-white"
          disabled={filteredRanking.length === 0}
        >
          <Printer className="h-5 w-5" /> 
          Generar Lista de Compras (PDF)
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 no-print">
        <Card className={cn(
          "cursor-pointer transition-all border-none shadow-lg rounded-2xl overflow-hidden bg-white",
          filterType === 'all' ? 'ring-4 ring-primary' : 'opacity-60'
        )} onClick={() => setFilterType('all')}>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase text-muted-foreground">General</p>
              <p className="text-2xl font-black text-primary">Todos</p>
            </div>
            <Package className="h-8 w-8 text-primary/20" />
          </CardContent>
        </Card>

        <Card className={cn(
          "cursor-pointer transition-all border-none shadow-lg rounded-2xl overflow-hidden bg-white",
          filterType === 'top' ? 'ring-4 ring-yellow-500' : 'opacity-60'
        )} onClick={() => setFilterType('top')}>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase text-muted-foreground">Rendimiento</p>
              <p className="text-2xl font-black text-yellow-600">Más Vendidos</p>
            </div>
            <TrendingUp className="h-8 w-8 text-yellow-500/20" />
          </CardContent>
        </Card>

        <Card className={cn(
          "cursor-pointer transition-all border-none shadow-lg rounded-2xl overflow-hidden bg-white",
          filterType === 'critical' ? 'ring-4 ring-destructive animate-pulse' : 'opacity-60'
        )} onClick={() => setFilterType('critical')}>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase text-muted-foreground">Urgente</p>
              <p className="text-2xl font-black text-destructive">Críticos ({criticalCount})</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-destructive/20" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-center no-print">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-primary/40" />
          <Input 
            placeholder="Buscar producto por nombre, categoría o código..." 
            className="pl-12 h-16 bg-white rounded-2xl font-black text-lg border-none shadow-xl focus:ring-2 ring-primary/20 transition-all" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
        </div>

        <div className="flex gap-2 items-center bg-white p-2 rounded-2xl border shadow-sm shrink-0">
          <div className="flex items-center gap-2 px-3 text-primary font-black uppercase text-[10px] tracking-widest border-r">
            <Filter className="h-4 w-4" /> Rango de Ventas:
          </div>
          <div className="flex gap-2 bg-muted/30 p-1 rounded-xl">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-sm font-bold p-2 outline-none" />
            <span className="flex items-center text-muted-foreground font-black px-1">-</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-sm font-bold p-2 outline-none" />
          </div>
        </div>
      </div>

      {isTxLoading || isProductsLoading ? (
        <div className="py-20 text-center space-y-4 no-print">
          <Loader2 className="animate-spin h-12 w-12 mx-auto text-primary opacity-20" />
          <p className="font-black text-primary animate-pulse uppercase text-xs tracking-widest">Analizando historial de ventas...</p>
        </div>
      ) : filteredRanking.length === 0 ? (
        <Card className="border-dashed border-4 py-24 text-center bg-white/50 rounded-[2.5rem] no-print">
           <CardContent className="space-y-4">
              <Zap className="h-16 w-16 mx-auto text-muted-foreground opacity-10" />
              <p className="text-muted-foreground font-black text-xl italic">No hay productos que coincidan con el filtro.</p>
           </CardContent>
        </Card>
      ) : (
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white no-print">
          <CardHeader className="bg-muted/10 border-b p-8">
            <CardTitle className="text-xl font-black text-primary flex items-center gap-2 uppercase tracking-tight">
              {filterType === 'critical' ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <TrendingUp className="h-5 w-5 text-primary" />}
              Análisis de Abastecimiento Estratégico
            </CardTitle>
            <CardDescription className="font-bold">
              Mostrando cantidad vendida y estimación de compra para el periodo seleccionado.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-black uppercase text-[10px] pl-8">Artículo</TableHead>
                    <TableHead className="text-center font-black uppercase text-[10px]">Vendido (Periodo)</TableHead>
                    <TableHead className="text-center font-black uppercase text-[10px]">Stock Disponible</TableHead>
                    <TableHead className="text-center font-black uppercase text-[10px] bg-blue-50/50">Sugerido Compra</TableHead>
                    <TableHead className="text-right font-black uppercase text-[10px] pr-8">Gestión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRanking.map((p) => (
                    <TableRow key={p.id} className={cn(
                      "hover:bg-muted/20 transition-colors",
                      p.isCritical ? 'bg-destructive/5' : ''
                    )}>
                      <TableCell className="pl-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted/20 relative overflow-hidden shrink-0 border shadow-sm">
                            {p.imageUrl ? <Image src={p.imageUrl} alt="" fill className="object-cover" /> : <Package className="h-4 w-4 m-auto opacity-20" />}
                          </div>
                          <div>
                            <p className="font-black text-sm uppercase leading-tight">{p.name}</p>
                            <Badge variant="outline" className="text-[8px] font-bold uppercase opacity-50 border-none px-0">{p.category}</Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center">
                           <span className="font-black text-lg text-primary">{p.totalSold.toFixed(1)}</span>
                           <span className="text-[8px] font-black text-muted-foreground uppercase">{p.unitType}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                         <div className="flex flex-col items-center">
                            <span className={cn(
                              "text-lg font-black",
                              p.isCritical ? 'text-destructive' : 'text-primary'
                            )}>
                              {Number(p.quantityInStock).toFixed(1)}
                            </span>
                            <Badge variant="outline" className="text-[7px] font-black h-3 px-1 border-primary/20">Mín: {p.minStockLevel || 5}</Badge>
                         </div>
                      </TableCell>
                      <TableCell className="text-center bg-blue-50/30">
                        <div className="flex flex-col items-center">
                           <span className={cn(
                             "text-2xl font-black",
                             p.suggestedPurchase > 0 ? "text-blue-700" : "text-muted-foreground opacity-20"
                           )}>
                             {p.suggestedPurchase.toFixed(1)}
                           </span>
                           {p.suggestedPurchase > 0 && <span className="text-[7px] font-black text-blue-600 uppercase">A Pedir</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                         <Button 
                           variant="outline" 
                           size="sm" 
                           className="font-black text-[10px] uppercase rounded-xl h-9 gap-2 border-primary/20 text-primary hover:bg-primary hover:text-white transition-all"
                           onClick={() => setSelectedProduct(p)}
                         >
                           <Eye className="h-3.5 w-3.5" /> Detalles
                         </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/10 p-6 flex justify-between items-center border-t">
             <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Fórmula: (Vendido + Mínimo) - Stock Actual</p>
             <Badge className="bg-primary text-white text-[8px] font-black uppercase border-none px-3 h-6 rounded-full">Análisis v4.2 Activo</Badge>
          </CardFooter>
        </Card>
      )}

      {/* DIALOG DE DETALLES DEL ARTICULO */}
      <Dialog open={!!selectedProduct} onOpenChange={(o) => !o && setSelectedProduct(null)}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="bg-primary text-white p-8 shrink-0">
             <div className="flex items-center gap-4">
                <div className="h-16 w-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center shadow-inner relative overflow-hidden">
                   {selectedProduct?.imageUrl ? <Image src={selectedProduct.imageUrl} alt="" fill className="object-cover" /> : <Package className="h-8 w-8 text-white" />}
                </div>
                <div>
                   <DialogTitle className="text-2xl font-black uppercase tracking-tight">{selectedProduct?.name}</DialogTitle>
                   <p className="text-white/70 font-bold uppercase text-[10px] tracking-widest">{selectedProduct?.category}</p>
                </div>
             </div>
          </DialogHeader>
          
          <div className="p-8 space-y-6">
             <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted/30 rounded-2xl border">
                   <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Precio Venta</p>
                   <p className="text-xl font-black text-primary">RD${selectedProduct?.salePrice?.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-2xl border">
                   <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Precio Costo</p>
                   <p className="text-xl font-black">RD${selectedProduct?.basePrice?.toLocaleString()}</p>
                </div>
             </div>

             <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                   <Barcode className="h-4 w-4" /> Identificación y Códigos
                </h4>
                <div className="space-y-2 bg-muted/20 p-4 rounded-2xl border-2 border-dashed">
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-muted-foreground">Barras Principal:</span>
                      <span className="font-mono font-black">{selectedProduct?.barcode || '---'}</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-muted-foreground">Barras Secundario:</span>
                      <span className="font-mono font-black">{selectedProduct?.barcode2 || '---'}</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-muted-foreground">Código Balanza:</span>
                      <span className="font-mono font-black">{selectedProduct?.codigoBalanza || '---'}</span>
                   </div>
                </div>
             </div>

             <div className="p-5 bg-blue-50 rounded-[1.5rem] border-2 border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                      <ShoppingBag className="h-5 w-5" />
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase text-blue-600">Rendimiento en Periodo</p>
                      <p className="text-sm font-bold text-blue-800">Ganancia: RD${(selectedProduct?.totalRevenue - (selectedProduct?.totalSold * selectedProduct?.basePrice)).toLocaleString()}</p>
                   </div>
                </div>
                <Badge className="bg-blue-600 text-white border-none text-[8px] font-black uppercase">Rentable</Badge>
             </div>
          </div>

          <DialogFooter className="p-6 bg-muted/10 border-t">
             <Button className="w-full h-14 font-black rounded-xl" onClick={() => setSelectedProduct(null)}>Cerrar Detalles</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
