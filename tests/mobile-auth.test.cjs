const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
function setup(data={},uid='u',emailVerified=true) {
 const m=new Module(path.resolve('src/lib/mobile-auth.ts'),module);m.paths=module.paths;const original=m.require.bind(m);
 m.require=name=>name==='./firebase-admin'?{adminAuth:{verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token==='bad')throw Error();return{uid,email_verified:emailVerified};}},adminDb:{doc:p=>({get:async()=>({data:()=>data[p]})})}}:original(name);
 m._compile(ts.transpileModule(fs.readFileSync('src/lib/mobile-auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,m.id);return m.exports;
}
const req=(token='good')=>({headers:new Headers(token?{authorization:`Bearer ${token}`}:{})});
const store={subscriptionStatus:'Active',name:'A'};
test('reject missing and revoked auth',async()=>{const a=setup();await assert.rejects(a.authenticatedMobile(req('')),{status:401});await assert.rejects(a.authenticatedMobile(req('bad')),{status:401});});
test('unknown sign-in does not gain membership',async()=>await assert.rejects(setup().mobileIdentity(req()),{status:403}));
test('inactive staff rejected',async()=>await assert.rejects(setup({'userProfiles/u':{role:'Admin',isActive:false,colmadoId:'a'}}).mobileIdentity(req()),{status:403}));
test('cross tenant denied and own branch allowed',async()=>{const a=setup({'userProfiles/u':{role:'Supervisor',colmadoId:'a'},'colmados/a':store,'colmados/b':store});await a.requireMobileStore(req(),'a');await assert.rejects(a.requireMobileStore(req(),'b'),{status:403});});
test('admin allowed branches include only active subscriptions',async()=>{const a=setup({'userProfiles/u':{role:'Admin',colmadoId:'a',allowedColmadoIds:['b','c']},'colmados/a':store,'colmados/b':store,'colmados/c':{subscriptionStatus:'Suspended'}});assert.deepEqual((await a.mobileIdentity(req())).stores.map(s=>s.id),['a','b']);});
test('POS-only identity admitted to session but cannot read orders',async()=>{const a=setup({'userProfiles/u':{role:'Cajero',colmadoId:'a',allowedModules:['pos']},'colmados/a':store});await a.mobileIdentity(req(),'session');await assert.rejects(a.mobileIdentity(req()),{status:403});});
test('driver cannot use injected orders module',()=>assert.equal(setup().ordersRole({role:'Driver',allowedModules:['orders']}),false));
test('invalid trial expiry fails closed',async()=>{const a=setup({'colmados/a':{subscriptionStatus:'Trial',trialEndAtMillis:Infinity}});assert.equal(await a.activeStore('a'),null);});

test('unverified email is denied at server boundary',async()=>await assert.rejects(setup({},'u',false).authenticatedMobile(req()),{status:403}));
test('inactive branch and root plan are denied',async()=>{assert.equal(await setup({'colmados/a':{...store,isActive:false}}).activeStore('a'),null);assert.equal(await setup({'colmados/a':{...store,rootColmadoId:'root'},'colmados/root':{...store,isActive:false}}).activeStore('a'),null);});
