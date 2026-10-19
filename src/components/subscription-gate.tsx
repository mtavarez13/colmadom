'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { doc } from 'firebase/firestore';
import { AlertTriangle, CreditCard, Loader2 } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { canViewBusinessBilling } from '@/lib/billing-audience';
import { Button } from '@/components/ui/button';

/** Keep operational pages unmounted while the SaaS suspension is fixed. */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const profileRef = useMemoFirebase(() => user?.uid ? doc(db, 'userProfiles', user.uid) : null, [db, user?.uid]);
  const { data: profile, isLoading: profileLoading } = useDoc(profileRef);
  const storeRef = useMemoFirebase(() => profile?.colmadoId ? doc(db, 'colmados', profile.colmadoId) : null, [db, profile?.colmadoId]);
  const { data: store, isLoading: storeLoading } = useDoc(storeRef);
  const rootId = store?.rootColmadoId && store.rootColmadoId !== store.id ? store.rootColmadoId : null;
  const rootRef = useMemoFirebase(() => rootId ? doc(db, 'colmados', rootId) : null, [db, rootId]);
  const { data: root, isLoading: rootLoading } = useDoc(rootRef);
  const plan = rootId ? root : store;
  const isPlatformAdmin = ['admin@colmadom.com', 'martin.tavarez.gomez@gmail.com', 'tavarezgomezmartin@gmail.com'].includes(user?.email?.toLowerCase() || '');
  const isPublic = pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/terms') || pathname.startsWith('/privacy');
  if (isPublic || pathname.startsWith('/billing') || isPlatformAdmin || !user && !isUserLoading) return <>{children}</>;
  if (isUserLoading || profileLoading || (profile?.colmadoId && (storeLoading || !store || rootId && (rootLoading || !root)))) {
    return <div className="grid min-h-svh place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (plan?.suspensionNoticeEnabled !== true) return <>{children}</>;
  const canPay = canViewBusinessBilling(plan, user?.uid, profile?.role);
  return <div className="grid min-h-svh place-items-center bg-red-50 p-5">
    <div className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center shadow-lg sm:p-10">
      <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-600" />
      <h1 className="text-2xl font-black text-red-900">Servicio suspendido por pago pendiente</h1>
      <p className="mt-3 text-slate-700">{plan.suspensionNoticeMessage || 'Regulariza el pago para continuar usando Colmadom Cloud.'}</p>
      <p className="mt-3 text-sm text-slate-500">El acceso se restablece cuando se confirma el pago o el administrador SaaS retira la suspensión.</p>
      {canPay ? <Button asChild className="mt-6 w-full"><Link href="/billing"><CreditCard className="mr-2 h-4 w-4" />Ver opciones de pago</Link></Button> : <p className="mt-6 rounded-lg bg-slate-100 p-3 text-sm">Solicita al dueño o al usuario autorizado que realice el pago.</p>}
    </div>
  </div>;
}
