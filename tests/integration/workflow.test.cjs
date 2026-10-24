const {test, before, after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const sdk=require(require.resolve('firebase/firestore',{paths:[require.resolve('@firebase/rules-unit-testing')]}));
let env;
function compile(file,imports={}){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>imports[n]);return exports;}
const history=compile('jobHistory.ts');
const model=compile('pickupModel.ts',{'./jobHistory':history});
function api(uid){return compile('dispatchBackend.ts',{'firebase/firestore':sdk,'./firebaseBackend':{auth:{currentUser:{uid}},firestore:env.authenticatedContext(uid).firestore()},'./pickupModel':model,'./jobHistory':history});}
// Load the exact production helper without initializing its production Firebase app.
function bookingApi(uid) {
 const source=ts.createSourceFile('firebaseBackend.ts',fs.readFileSync('firebaseBackend.ts','utf8'),ts.ScriptTarget.Latest,true);
 let initializer;
 for(const statement of source.statements) if(ts.isVariableStatement(statement)) for(const declaration of statement.declarationList.declarations) if(declaration.name.getText(source)==='bookFirebasePickup') initializer=declaration.initializer.getText(source);
 assert.ok(initializer);
 const code=ts.transpileModule('const book = '+initializer+';',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const bindings={...sdk,auth:{currentUser:{uid}},firestore:env.authenticatedContext(uid).firestore(),validatePickup:model.validatePickup,appendEvent:history.appendEvent,withTimeout:promise=>promise,uploadJobPhoto:()=>{throw new Error('Photo storage is outside this Firestore test');}};
 return new Function(...Object.keys(bindings),code+'return book;')(...Object.values(bindings));
}

before(async()=>{env=await initializeTestEnvironment({projectId:'demo-haulconnect',firestore:{host:'127.0.0.1',port:8085,rules:fs.readFileSync('firestore.rules','utf8')}});await env.withSecurityRulesDisabled(async c=>{for(const [uid,role] of [['admin','admin'],['customer','customer'],['other','customer'],['d1','driver'],['d2','driver']])await sdk.setDoc(sdk.doc(c.firestore(),'users',uid),{role,name:uid});});});
after(async()=>{if(env)await env.cleanup();});
test('real Firestore: booking, scoped reads, decline, reassign, ETA, completion and authorization',async()=>{
 const customer=env.authenticatedContext('customer').firestore();
 const ref=sdk.doc(customer,'jobs','workflow');
 const request={id:'workflow',customer:'Synthetic customer',street:'123 Main St',city:'Palm Springs',state:'CA',phone:'7605551234',details:'Test sofa',paymentMethod:'card',photos:{}};
 await bookingApi('customer')(request);
 await bookingApi('customer')(request); // Retrying must reuse this booking.

 await assertFails(sdk.getDoc(sdk.doc(env.authenticatedContext('other').firestore(),'jobs','workflow')));
 await assertFails(sdk.updateDoc(sdk.doc(customer,'users','customer'),{role:'admin'}));
 await assertFails(sdk.updateDoc(ref,{status:'completed'}));
 assert.equal((await sdk.getDocs(sdk.query(sdk.collection(customer,'jobs'),sdk.where('customerId','==','customer')))).size,1);
 const admin=api('admin');await admin.confirmPickup('workflow');await admin.assignDriver('workflow','d1');
 await assert.rejects(api('d2').respondToAssignment('workflow',true));
 await api('d1').respondToAssignment('workflow',false);
 await admin.assignDriver('workflow','d2');await api('d2').respondToAssignment('workflow',true);
 await api('d2').sendDriverEta('workflow',20);await api('d2').sendDriverEta('workflow',15);
 for(const status of ['en_route','arrived','loading','completed']){await api('d2').advanceAssignedJob('workflow');assert.equal((await sdk.getDoc(ref)).data().status,status);}
 await assert.rejects(api('d2').advanceAssignedJob('workflow'));
 const job=(await sdk.getDoc(ref)).data();
 assert.equal(job.paymentStatus,'unpaid');assert.equal(job.eta,15);
 await bookingApi('customer')(request);assert.equal((await sdk.getDoc(ref)).data().status,'completed');
 const events=Object.values(job.history);assert.equal(events.length,12);assert.ok(events.every(e=>typeof e.at.toMillis()==='number'));
 assert.ok(job.completedAt.toMillis()>=job.createdAt.toMillis());
});
test('driver directory includes signed-out accounts and vehicle edits persist',async()=>{
 const admin=env.authenticatedContext('admin').firestore();
 const drivers=await sdk.getDocs(sdk.query(sdk.collection(admin,'users'),sdk.where('role','==','driver')));
 assert.deepEqual(drivers.docs.map(d=>d.id).sort(),['d1','d2']);
 const driver=env.authenticatedContext('d1').firestore();
 const ref=sdk.doc(driver,'users','d1');
 await sdk.updateDoc(ref,{driverProfile:{vehicleMake:'Test make',vehicleModel:'Test model'},updatedAt:sdk.serverTimestamp()});
 assert.equal((await sdk.getDoc(sdk.doc(admin,'users','d1'))).data().driverProfile.vehicleModel,'Test model');
 await assertFails(sdk.updateDoc(ref,{role:'admin'}));
});
test('simultaneous dispatch cannot assign one booking to two drivers',async()=>{
 await env.withSecurityRulesDisabled(c=>sdk.setDoc(sdk.doc(c.firestore(),'jobs','race'),{customerId:'customer',status:'requested',driverId:null,driverName:null}));
 const results=await Promise.allSettled([api('admin').assignDriver('race','d1'),api('admin').assignDriver('race','d2')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const job=(await sdk.getDoc(sdk.doc(env.authenticatedContext('admin').firestore(),'jobs','race'))).data();
 assert.equal(job.status,'assigned');assert.equal(Object.values(job.history).filter(e=>e.type==='assigned').length,1);
});
