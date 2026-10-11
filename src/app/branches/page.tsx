"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDocs, query, where, updateDoc } from "firebase/firestore";
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Store } from "lucide-react";

type BranchResult = { id: string; name: string; sales: number; salesCount: number; costs: number; expenses: number; staff: number; error?: string };
const money = (value: number) => `RD$${value.toLocaleString("es-DO", { maximumFractionDigits: 2 })}`;

export default function BranchesPage() {
  const { user } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const profileRef = useMemoFirebase(() => user?.uid ? doc(db, "userProfiles", user.uid) : null, [db, user?.uid]);
  const { data: profile, isLoading: profileLoading } = useDoc(profileRef);
  const storesRef = useMemoFirebase(() => profile?.role === "Admin" ? collection(db, "colmados") : null, [db, profile?.role]);
  const { data: stores } = useCollection(storesRef);
  const branchIds = useMemo(() => Array.from(new Set([profile?.colmadoId, ...(profile?.allowedColmadoIds || [])].filter(Boolean))) as string[], [profile?.colmadoId, profile?.allowedColmadoIds]);
  const branches = useMemo(() => (stores || []).filter(store => branchIds.includes(store.id)), [stores, branchIds]);
  const [results, setResults] = useState<BranchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!stores || profile?.role !== "Admin" || !branches.length) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(branches.map(async branch => {
      try {
        const [salesSnap, entriesSnap, staffSnap] = await Promise.all([
          getDocs(collection(db, "colmados", branch.id, "transactions")),
          getDocs(collection(db, "colmados", branch.id, "bookkeepingEntries")),
          getDocs(query(collection(db, "userProfiles"), where("colmadoId", "==", branch.id)))
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const sales = salesSnap.docs.filter(item => {
          const tx = item.data();
          return tx.transactionType === "Sale" && !tx.isAnnulled && String(tx.createdAt || "").startsWith(today);
        });
        const expenses = entriesSnap.docs.filter(item => {
          const entry = item.data();
          return String(entry.entryDate || entry.createdAt || "").startsWith(today) &&
            (String(entry.entryType || "").includes("Expense") || entry.isPayroll);
        });
        return {
          id: branch.id, name: branch.name || branch.code || branch.id,
          sales: sales.reduce((sum, item) => sum + (Number(item.data().totalAmount) || 0), 0),
          salesCount: sales.length,
          costs: sales.reduce((sum, item) => {
            const tx = item.data();
            return sum + (Number(tx.totalCost) || (Array.isArray(tx.items) ? tx.items.reduce((itemSum: number, product: any) => itemSum + (Number(product.costPrice) || 0) * (Number(product.quantity) || 0), 0) : 0));
          }, 0),
          expenses: expenses.reduce((sum, item) => sum + Math.abs(Number(item.data().amount) || 0), 0),
          staff: staffSnap.docs.filter(item => item.data().colmadoId === branch.id && item.data().isActive !== false).length
        };
      } catch {
        return { id: branch.id, name: branch.name || branch.id, sales: 0, salesCount: 0, costs: 0, expenses: 0, staff: 0, error: "No se pudieron leer los datos. Revisa las reglas de Firestore." };
      }
    })).then(items => { if (!cancelled) { setResults(items); setLoading(false); } });
    return () => { cancelled = true; };
  }, [db, stores, branches, profile?.role, refreshKey]);

  const [openingBranch, setOpeningBranch] = useState<string | null>(null);
  const openBranch = useCallback(async (id: string, destination: string) => {
    if (!user || !branchIds.includes(id)) return;
    setOpeningBranch(id);
    try {
      await updateDoc(doc(db, "userProfiles", user.uid), { colmadoId: id, updatedAt: new Date().toISOString() });
      router.push(destination);
      router.refresh();
    } finally { setOpeningBranch(null); }
  }, [db, user, branchIds, router]);

  if (profileLoading) return <div className="p-10"><Loader2 className="animate-spin" /></div>;
  if (profile?.role !== "Admin") return <div className="p-10">Esta vista es para dueños.</div>;

  const totalSales = results.reduce((sum, row) => sum + row.sales, 0);
  const totalExpenses = results.reduce((sum, row) => sum + row.expenses, 0);
  const totalCosts = results.reduce((sum, row) => sum + row.costs, 0);
  return <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
    <div className="flex flex-wrap justify-between gap-4 items-center"><div><h1 className="text-3xl font-black">Mis sucursales</h1><p className="text-muted-foreground">Elige un módulo dentro de cada local. El menú lateral mostrará después todos los módulos de esa sucursal.</p></div><Button variant="outline" onClick={() => setRefreshKey(value => value + 1)} disabled={loading}><RefreshCw className="w-4 h-4 mr-2" />Actualizar</Button></div>
    <div className="grid sm:grid-cols-3 gap-4"><Card><CardHeader><CardTitle>Ventas de hoy</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(totalSales)}</CardContent></Card><Card><CardHeader><CardTitle>Gastos de hoy</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(totalExpenses)}</CardContent></Card><Card><CardHeader><CardTitle>Resultado estimado</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(totalSales - totalCosts - totalExpenses)}</CardContent></Card></div>
    {loading && <p className="flex gap-2 items-center"><Loader2 className="animate-spin w-4 h-4" />Cargando resultados…</p>}
    {branches.length === 0 && <p>No hay sucursales vinculadas a tu cuenta. Solicita al administrador de la plataforma que las habilite.</p>}
    <div className="grid md:grid-cols-2 gap-4">{results.map(row => <Card key={row.id}><CardHeader><CardTitle className="flex items-center gap-2"><Store className="w-5 h-5" />{row.name}</CardTitle></CardHeader><CardContent className="space-y-3">{row.error ? <p className="text-destructive">{row.error}</p> : <><p>Ventas de hoy: <strong>{money(row.sales)}</strong> ({row.salesCount} ventas)</p><p>Gastos de hoy: <strong>{money(row.expenses)}</strong></p><p>Resultado estimado: <strong>{money(row.sales - row.costs - row.expenses)}</strong></p><p>Usuarios activos: <strong>{row.staff}</strong></p></>}<div className="flex flex-wrap gap-2">{[
      ['Contabilidad', '/reports'], ['Cierre de caja', '/reconciliation'], ['Inventario', '/inventory'],
      ['Auditoría', '/inventory-audit'], ['Pedidos', '/orders'], ['Gastos', '/expenses'],
      ['Usuarios', '/settings'], ['Todos los módulos', '/minimarket']
    ].map(([label, destination]) => <Button key={destination} variant={destination === '/reports' ? 'default' : 'outline'} size="sm" disabled={openingBranch === row.id} onClick={() => openBranch(row.id, destination)}>{label}</Button>)}</div></CardContent></Card>)}</div>
  </div>;
}
