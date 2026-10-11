
/**
 * @fileOverview Servicio modular para la integración con Bencash Group "Deposit Channel API".
 * Maneja la generación de firmas HMAC-SHA256 y peticiones HTTP seguras.
 */

import crypto from 'crypto';

const PRIVATE_KEY = process.env.BENCASH_PRIVATE_KEY || "";
const BASE_URL = process.env.BENCASH_BASE_URL || "https://reseller.test.bencashgroup.com";

interface CashInRequest {
  requestId: string;
  toAccountNumber: string;
  amount: number;
  content: string;
}

interface CashInConfirm {
  requestId: string;
  txId: string;
  verifyCode: string;
  isConfirm: boolean;
}

/**
 * Genera la firma HMAC-SHA256 requerida por Bencash.
 */
function generateSignature(payload: string): string {
  return crypto
    .createHmac('sha256', PRIVATE_KEY)
    .update(payload)
    .digest('hex');
}

/**
 * API 1: Request Cash-In
 */
export async function requestCashIn(data: CashInRequest) {
  if (!PRIVATE_KEY) throw new Error("Bencash Private Key not configured");

  const timestamp = Date.now().toString();
  const accessKey = PRIVATE_KEY + data.requestId;

  // Formato: {accessKey=<accessKey>$requestId=<requestId>$toAccountNumber=<toAccountNumber>$amount=<amount>$content=<content>$timestamp=<timestamp>}
  const signString = `{accessKey=${accessKey}$requestId=${data.requestId}$toAccountNumber=${data.toAccountNumber}$amount=${data.amount}$content=${data.content}$timestamp=${timestamp}}`;
  const signature = generateSignature(signString);

  const response = await fetch(`${BASE_URL}/channel/requestcashin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'skml': PRIVATE_KEY,
      'signature': signature
    },
    body: JSON.stringify({
      requestId: data.requestId,
      toAccountNumber: data.toAccountNumber,
      amount: data.amount,
      content: data.content,
      timestamp: timestamp
    })
  });

  return await response.json();
}

/**
 * API 2: Confirm Cash-In
 */
export async function confirmCashIn(data: CashInConfirm) {
  if (!PRIVATE_KEY) throw new Error("Bencash Private Key not configured");

  const accessKey = PRIVATE_KEY + data.requestId;

  // Formato: {accessKey=<accessKey>$requestId=<requestId>$txId=<txld>$verifyCode=<verifyCode>$isConfirm=<isConfirm>}
  const signString = `{accessKey=${accessKey}$requestId=${data.requestId}$txId=${data.txId}$verifyCode=${data.verifyCode}$isConfirm=${data.isConfirm}}`;
  const signature = generateSignature(signString);

  const response = await fetch(`${BASE_URL}/channel/confirmcashin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'skml': PRIVATE_KEY,
      'signature': signature
    },
    body: JSON.stringify({
      requestId: data.requestId,
      txId: data.txId,
      verifyCode: data.verifyCode,
      isConfirm: data.isConfirm
    })
  });

  return await response.json();
}
