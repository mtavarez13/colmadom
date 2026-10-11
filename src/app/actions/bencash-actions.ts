
'use server';

import { requestCashIn, confirmCashIn } from '@/services/bencash-service';

/**
 * Procesa una solicitud de Remesa (Envío de efectivo) a través de Bencash.
 */
export async function processBencashRequest(input: {
  to: string;
  amount: number;
  description: string;
}) {
  try {
    const requestId = `REM_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    const result = await requestCashIn({
      requestId,
      toAccountNumber: input.to,
      amount: input.amount,
      content: input.description
    });

    if (result.code === '00' || result.status === 'success') {
      return { success: true, data: result };
    }

    return { 
      success: false, 
      error: result.message || "Bencash rechazó la solicitud de remesa" 
    };
  } catch (error: any) {
    console.error("Bencash Action Error (Remittance):", error);
    return { success: false, error: error.message };
  }
}

/**
 * Confirma una remesa que requiere código de verificación (OTP).
 */
export async function processBencashConfirmation(input: {
  requestId: string;
  txId: string;
  verifyCode: string;
}) {
  try {
    const result = await confirmCashIn({
      requestId: input.requestId,
      txId: input.txId,
      verifyCode: input.verifyCode,
      isConfirm: true
    });

    if (result.code === '00' || result.status === 'success') {
      return { success: true, data: result };
    }

    return { success: false, error: result.message || "Fallo en la confirmación de la remesa" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
