export type RecargasEnvironment = 'test' | 'production';
export type RecargasCredentials = { userName: string; password: string; baseUrl: string };

const PRODUCTION_API = 'https://api.recargasdominicanas.do/api';

export function normalizeRecargasEnvironment(value: unknown): RecargasEnvironment {
  return value === 'production' ? 'production' : 'test';
}

export function validateRecargasBaseUrl(value: unknown, environment: RecargasEnvironment) {
  const raw = String(value || (environment === 'production' ? PRODUCTION_API : '')).trim().replace(/\/+$/, '');
  if (!raw) throw new Error('RECARGAS_TEST_URL_REQUIRED');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('RECARGAS_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('RECARGAS_URL_INVALID');
  if (environment === 'production' && raw !== PRODUCTION_API) throw new Error('RECARGAS_URL_INVALID');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) throw new Error('RECARGAS_URL_INVALID');
  return raw;
}

function readSessionCookie(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headers.getSetCookie?.() || [response.headers.get('set-cookie') || ''];
  const session = setCookies.map(value => value.match(/(?:^|,\s*)recargasdominicanas=([^;,]+)/i)?.[1]).find(Boolean);
  if (!session) throw new Error('RECARGAS_SESSION_MISSING');
  return `recargasdominicanas=${session}`;
}

export async function recargasRequest<T = any>(credentials: RecargasCredentials, path: string, options: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const baseUrl = validateRecargasBaseUrl(credentials.baseUrl, credentials.baseUrl === PRODUCTION_API ? 'production' : 'test');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 20_000);
  let cookie = '';
  try {
    const login = await fetch(`${baseUrl}/business-user/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: credentials.userName, password: credentials.password }),
      cache: 'no-store', signal: controller.signal,
    });
    if (!login.ok) {
      if (login.status === 401) throw new Error('RECARGAS_AUTH_FAILED');
      if (login.status === 429) throw new Error('RECARGAS_RATE_LIMITED');
      throw new Error('RECARGAS_LOGIN_FAILED');
    }
    cookie = readSessionCookie(login);
    const response = await fetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
      method: options.method || 'GET', headers: { Cookie: cookie, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}), cache: 'no-store', signal: controller.signal,
    });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text.slice(0, 400) }; }
    if (!response.ok) {
      const code = String(payload?.code || payload?.error || payload?.message || '').toUpperCase();
      const error = new Error('RECARGAS_REQUEST_FAILED');
      (error as Error & { status?: number; providerCode?: string }).status = response.status;
      (error as Error & { status?: number; providerCode?: string }).providerCode = code;
      throw error;
    }
    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('RECARGAS_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
    if (cookie) {
      const logoutController = new AbortController();
      const logoutTimer = setTimeout(() => logoutController.abort(), 3_000);
      await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: { Cookie: cookie }, cache: 'no-store', signal: logoutController.signal }).catch(() => undefined);
      clearTimeout(logoutTimer);
    }
  }
}

export function recargasPublicError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const providerCode = (error as Error & { providerCode?: string })?.providerCode;
  if (message === 'RECARGAS_TEST_URL_REQUIRED') return { status: 409, message: 'Falta la URL API que Recargas Dominicanas asignó al ambiente de pruebas.' };
  if (message === 'RECARGAS_URL_INVALID') return { status: 400, message: 'La URL API debe ser HTTPS y válida.' };
  if (message === 'RECARGAS_CREDENTIALS_MISSING') return { status: 409, message: 'El administrador SaaS debe configurar usuario y contraseña de Recargas Dominicanas.' };
  if (message === 'RECARGAS_AUTH_FAILED') return { status: 401, message: 'Recargas Dominicanas rechazó las credenciales del ambiente seleccionado.' };
  if (message === 'RECARGAS_RATE_LIMITED') return { status: 429, message: 'Recargas Dominicanas bloqueó temporalmente los intentos de acceso. Espera unos minutos.' };
  if (message === 'RECARGAS_SESSION_MISSING') return { status: 502, message: 'La API no devolvió la cookie de sesión documentada.' };
  if (message === 'RECARGAS_TIMEOUT') return { status: 504, message: 'La API de Recargas Dominicanas tardó demasiado en responder.' };
  if (message === 'RECARGAS_REQUEST_FAILED') return { status: 502, message: providerCode ? `Recargas Dominicanas rechazó la operación (${providerCode}).` : 'Recargas Dominicanas rechazó la operación.' };
  return { status: 502, message: 'No se pudo conectar con Recargas Dominicanas.' };
}
