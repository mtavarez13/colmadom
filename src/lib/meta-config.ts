import { adminDb } from '@/lib/firebase-admin';

export const PLATFORM_ADMIN_EMAILS = new Set(['admin@colmadom.com','martin.tavarez.gomez@gmail.com','tavarezgomezmartin@gmail.com']);

export async function getMetaConfig() {
  const saved=(await adminDb.doc('platformConfig/whatsappMeta').get()).data()||{};
  const graphVersion=String(saved.graphVersion||process.env.META_GRAPH_VERSION||'v23.0').replace(/[^v0-9.]/g,'')||'v23.0';
  return {
    appId:String(saved.appId||process.env.META_APP_ID||''),
    appSecret:String(saved.appSecret||process.env.META_APP_SECRET||''),
    configId:String(saved.configId||process.env.META_EMBEDDED_SIGNUP_CONFIG_ID||''),
    verifyToken:String(saved.verifyToken||process.env.META_WEBHOOK_VERIFY_TOKEN||''),
    graphVersion,
    publicAppUrl:String(saved.publicAppUrl||process.env.NEXT_PUBLIC_APP_URL||'').replace(/\/$/,''),
  };
}

export const metaGraphBase=(version:string)=>`https://graph.facebook.com/${version}`;
