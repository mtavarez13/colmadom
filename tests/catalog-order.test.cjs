const assert=require('node:assert/strict');
const test=require('node:test');
const ts=require('typescript');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
function load(file){const name=path.resolve(file);const m=new Module(name,module);m.filename=name;m.paths=module.paths;m._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,name);return m.exports;}
const {catalogOrderSchema,deliveryCost}=load('src/lib/catalog-order-validation.ts');
const order={colmadoId:'branch_A',requestId:'67ecbe7e-92b6-4eb8-a8d1-33368da52ab2',customerName:'Cliente',customerAddress:'Calle',customerPhone:'',customerLatitude:null,customerLongitude:null,expectedTotal:100,items:[{productId:'product_with_underscores',quantity:1}]};
test('valid order keeps full product identifier',()=>assert.equal(catalogOrderSchema.parse(order).items[0].productId,'product_with_underscores'));
test('reject tenant path traversal',()=>assert.equal(catalogOrderSchema.safeParse({...order,colmadoId:'a/products/b'}).success,false));
test('reject negative/nonfinite/empty quantities',()=>{for(const quantity of [-1,0,NaN,Infinity])assert.equal(catalogOrderSchema.safeParse({...order,items:[{productId:'p',quantity}]}).success,false);});
test('reject client-injected price/source',()=>assert.equal(catalogOrderSchema.safeParse({...order,source:'manual',totalAmount:1}).success,false));
test('reject incomplete coordinates',()=>assert.equal(catalogOrderSchema.safeParse({...order,customerLatitude:19}).success,false));
test('preserve zero fee without coordinates and minimum with coordinates',()=>{assert.equal(deliveryCost({minDeliveryFee:50},null,null),0);assert.equal(deliveryCost({latitude:19,longitude:-70,minDeliveryFee:50,deliveryFeePerKm:10},19,-70),50);});
test('bound item count',()=>assert.equal(catalogOrderSchema.safeParse({...order,items:Array.from({length:81},()=>order.items[0])}).success,false));
