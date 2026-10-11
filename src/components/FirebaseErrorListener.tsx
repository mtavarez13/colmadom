
'use client';

import { useEffect, useRef } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

/**
 * Escucha errores globales de Firestore.
 * Se ha ajustado para no lanzar errores fatales durante estados de transición (login/logout).
 */
export function FirebaseErrorListener() {
  const { isUserLoading, user } = useUser();
  const { toast } = useToast();
  const lastNotification = useRef<{ path: string; at: number } | null>(null);

  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      // Ignorar errores de permiso si estamos en medio de un cambio de usuario
      // o si no hay un usuario autenticado todavía.
      if (isUserLoading || !user) {
        console.warn("Firestore Permission Denied (Transient):", error.request.path);
        return;
      }
      
      const path = error.request.path;
      const now = Date.now();
      const previous = lastNotification.current;

      // Una regla desactualizada o un módulo no autorizado no debe derribar toda la app.
      // Evitamos además repetir el mismo aviso cuando varios listeners fallan a la vez.
      console.error('Firestore Permission Denied:', path, error);
      if (!previous || previous.path !== path || now - previous.at > 8000) {
        lastNotification.current = { path, at: now };
        toast({
          variant: 'destructive',
          title: 'Acceso limitado',
          description: 'No tienes permiso para consultar estos datos. Actualiza la página o solicita acceso al dueño del negocio.',
        });
      }
    };

    errorEmitter.on('permission-error', handleError);
    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [isUserLoading, user, toast]);

  return null;
}
