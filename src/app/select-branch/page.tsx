"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, updateDoc } from "firebase/firestore";
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Store } from "lucide-react";

export default function SelectBranchPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  const profileRef = useMemoFirebase(() => user?.uid ? doc(db, 'userProfiles', user.uid) : null, [db, user?.uid]);
  const { data: profile, isLoading: profileLoading } = useDoc(profileRef);
  const storesRef = useMemoFirebase(() => ['Admin','Contable'].includes(profile?.role) ? collection(db, 'colmados') : null, [db, profile?.role]);
  const { data: stores, isLoading: storesLoading } = useCollection(storesRef);
  const allowedIds = useMemo(() => Array.from(new Set((profile?.allowedColmadoIds || []).filter(Boolean))) as string[], [profile?.allowedColmadoIds]);
  const branches = useMemo(() => (stores || []).filter(store => allowedIds.includes(store.id)), [stores, allowedIds]);

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) router.replace('/login');
    else if (!profileLoading && profile && (!['Admin','Contable'].includes(profile.role) || allowedIds.length <= 1)) router.replace(profile.role === 'Contable' ? '/reports' : '/minimarket');
  }, [isUserLoading, user, profileLoading, profile, allowedIds.length, router]);

  const selectBranch = async (id: string) => {
    if (!user || !allowedIds.includes(id) || opening) return;
    setError(''); setOpening(id);
    try {
      await updateDoc(doc(db, 'userProfiles', user.uid), { colmadoId: id, updatedAt: new Date().toISOString() });
      router.replace(profile?.role === 'Contable' ? '/reports' : '/minimarket');
      router.refresh();
    } catch {
      setError('No se pudo activar la sucursal. Revisa los permisos de Firebase.');
      setOpening(null);
    }
  };

  if (isUserLoading || profileLoading || storesLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;
  return <div className="min-h-screen bg-muted/20 p-6 grid place-items-center"><div className="w-full max-w-3xl space-y-6">
    <div className="text-center"><h1 className="text-3xl font-black">¿Qué sucursal vas a operar?</h1><p className="text-muted-foreground mt-2">Elige un local. Verás todos sus módulos y datos. Podrás cambiarlo después desde el menú.</p></div>
    {error && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-destructive">{error}</p>}
    <div className="grid sm:grid-cols-2 gap-4">{branches.map(branch => <Card key={branch.id}><CardHeader><CardTitle className="flex items-center gap-2"><Store className="w-5 h-5" />{branch.name}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{branch.address || branch.code || 'Sucursal'}</p><Button className="w-full" disabled={!!opening} onClick={() => selectBranch(branch.id)}>{opening === branch.id ? <Loader2 className="animate-spin w-4 h-4" /> : 'Operar esta sucursal'}</Button></CardContent></Card>)}</div>
    {stores && branches.length === 0 && <p className="text-center text-destructive">No hay sucursales vinculadas a esta cuenta. Contacta al administrador.</p>}
  </div></div>;
}
