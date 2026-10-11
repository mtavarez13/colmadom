export type MsellerEnvironment = 'TesteCF' | 'CerteCF' | 'eCF';
export type MsellerCredentials = { email?: string; password?: string; apiKey?: string; token?: string; cacheId?: string };
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
export function msellerEnvironment(value: unknown): MsellerEnvironment { return ['TesteCF','CerteCF','eCF'].includes(String(value)) ? value as MsellerEnvironment : 'TesteCF'; }
function serverApiKey(environment: MsellerEnvironment) { return process.env[`MSELLER_API_KEY_${environment.toUpperCase()}`] || process.env.MSELLER_API_KEY || ''; }
function resolvedCredentials(environment: MsellerEnvironment, credentials?: MsellerCredentials) { return { email: credentials?.email || process.env.MSELLER_EMAIL || '', password: credentials?.password || process.env.MSELLER_PASSWORD || '', apiKey: credentials?.apiKey || serverApiKey(environment), token: credentials?.token || process.env.MSELLER_TOKEN || '', cacheId: credentials?.cacheId || credentials?.email || 'server' }; }
async function authenticate(environment: MsellerEnvironment, credentials?: MsellerCredentials, force=false) {
 const config=resolvedCredentials(environment,credentials),cacheKey=`${config.cacheId}:${environment}`,cached=tokenCache.get(cacheKey);if(!force&&cached&&cached.expiresAt>Date.now()+60000)return cached.token;
 if(!config.email||!config.password){if(config.token)return config.token;throw new Error('MSELLER_CREDENTIALS_MISSING');}
 const response=await fetch(`https://ecf.api.mseller.app/${environment}/customer/authentication`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:config.email,password:config.password}),cache:'no-store'}),result=await response.json().catch(()=>({}));
 if(!response.ok||!result.idToken)throw new Error('MSELLER_AUTH_FAILED');tokenCache.set(cacheKey,{token:result.idToken,expiresAt:Date.now()+50*60000});return result.idToken as string;
}
export async function testMsellerAuthentication(environmentValue: unknown, credentials?: MsellerCredentials) {
 const environment=msellerEnvironment(environmentValue),config=resolvedCredentials(environment,credentials);
 if(!config.apiKey)throw new Error('MSELLER_API_KEY_MISSING');
 await authenticate(environment,credentials,true);
 return {environment,apiKeyConfigured:true};
}
export async function msellerRequest(environmentValue: unknown,path:string,init:RequestInit={},includeApiKey=true,credentials?:MsellerCredentials){
 const environment=msellerEnvironment(environmentValue),config=resolvedCredentials(environment,credentials);if(includeApiKey&&!config.apiKey)throw new Error('MSELLER_API_KEY_MISSING');
 const execute=async(force=false)=>fetch(`https://ecf.api.mseller.app/${environment}${path}`,{...init,cache:'no-store',headers:{Authorization:`Bearer ${await authenticate(environment,credentials,force)}`,...(includeApiKey?{'X-API-KEY':config.apiKey}:{}),...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})}});
 let response=await execute();if(response.status===401&&config.email&&config.password)response=await execute(true);return response;
}
