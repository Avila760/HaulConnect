const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
function compile(file, imports = {}) {
  const exports = {};
  const context = { exports, require: name => imports[name], console, setTimeout, clearTimeout };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, context);
  return exports;
}
const history = compile('jobHistory.ts');
const model = compile('pickupModel.ts', {'./jobHistory':history});
const valid = {street:'123 Main St',city:'Palm Springs',state:'CA',phone:'(760) 555-1234',details:'Sofa'};
test('required structured address, state selection and reachable phone', () => {
  assert.equal(model.validatePickup(valid),null);
  for (const field of Object.keys(valid)) assert.ok(model.validatePickup({...valid,[field]:' '}),field);
  assert.ok(model.validatePickup({...valid,state:'XX'}));
  assert.ok(model.validatePickup({...valid,phone:'123'}));
  assert.equal(model.validatePickup({...valid,phone:'+1 760 555 1234'}),null);
  assert.equal(model.US_STATES.length,51);
});
test('legacy requests still display and accepted does not imply already on the way',()=>{
  const job=model.readJob('legacy',{pickup:'Old address',status:'available'});
  assert.equal(job.pickup,'Old address');assert.equal(model.isAwaitingDispatch(job.status),true);
  assert.equal(model.nextDeliveryStatus('assigned'),null);
  assert.equal(model.nextDeliveryStatus('accepted'),'en_route');
  assert.equal(model.nextDeliveryStatus('completed'),null);
  assert.equal(model.canRespondToAssignment({status:'assigned',driverId:'d1'},'d2'),false);
});
function backend() {
  const records=new Map([
    ['users/admin',{role:'admin'}],['users/customer',{role:'customer'}],
    ['users/d1',{role:'driver',name:'Driver One'}],['users/d2',{role:'driver',name:'Driver Two'}],
    ['jobs/j1',{customerId:'customer',status:'requested',pickup:'123 Main',customerPhone:'7605551234'}],
  ]);
  const auth={currentUser:{uid:'admin'}};
  const streams=[];
  const sdk={
    doc:(_,col,id)=>({path:`${col}/${id}`}), collection:(_,name)=>({name}),
    where:(field,op,value)=>({field,op,value}),query:(source,filter)=>({source,filter}),
    onSnapshot:(q,receive,error)=>{const stream={q,receive,error,closed:false};streams.push(stream);return ()=>{stream.closed=true;};},
    serverTimestamp:()=> 'timestamp',
    runTransaction:async (_,fn)=>fn({
      get:async ref=>({exists:()=>records.has(ref.path),data:()=>records.get(ref.path),ref}),
      update:(ref,patch)=>records.set(ref.path,{...records.get(ref.path),...patch}),
    }),
  };
  const api=compile('dispatchBackend.ts',{'firebase/firestore':sdk,'./firebaseBackend':{auth,firestore:{}},'./pickupModel':model,'./jobHistory':history});
  return {api,auth,records,streams};
}
test('customer -> dispatch -> driver decline -> reassign -> accept -> on way -> completed',async()=>{
  const {api,auth,records}=backend();
  await api.assignDriver('j1','d1');assert.equal(records.get('jobs/j1').status,'assigned');
  auth.currentUser.uid='d2';await assert.rejects(api.respondToAssignment('j1',true),/no longer available/);
  auth.currentUser.uid='d1';await api.respondToAssignment('j1',false);
  assert.equal(records.get('jobs/j1').status,'requested');assert.equal(records.get('jobs/j1').driverId,null);
  auth.currentUser.uid='admin';await api.assignDriver('j1','d2');
  await assert.rejects(api.assignDriver('j1','d1'),/already been assigned/);
  auth.currentUser.uid='d2';await api.respondToAssignment('j1',true);
  assert.equal(records.get('jobs/j1').status,'accepted');
  await assert.rejects(api.respondToAssignment('j1',false),/no longer available/);
  for(const status of ['en_route','arrived','loading','completed']){await api.advanceAssignedJob('j1');assert.equal(records.get('jobs/j1').status,status);}
  await assert.rejects(api.advanceAssignedJob('j1'));
});
test('unauthorized assignment and progression rejected',async()=>{
  const {api,auth}=backend();auth.currentUser.uid='customer';
  await assert.rejects(api.assignDriver('j1','d1'),/Admin/);
  await assert.rejects(api.advanceAssignedJob('j1'),/driver account/);
  auth.currentUser.uid='admin';await assert.rejects(api.assignDriver('j1','customer'),/Choose a driver/);
});
test('live job queries isolate customer and driver, admin gets dispatch list; unsubscribes',()=>{
  const {api,streams}=backend();
  const stop=api.subscribeToJobs('customer','c1',()=>{},()=>{});
  api.subscribeToJobs('driver','d1',()=>{},()=>{});
  api.subscribeToJobs('admin','a1',()=>{},()=>{});
  assert.equal(streams[0].q.filter.field,'customerId');assert.equal(streams[0].q.filter.value,'c1');
  assert.equal(streams[1].q.filter.field,'driverId');assert.equal(streams[1].q.filter.value,'d1');
  assert.equal(streams[2].q.name,'jobs');stop();assert.equal(streams[0].closed,true);
});

test('history keeps every assignment and status event with server timestamps',async()=>{
  const {api,auth,records}=backend();
  await api.confirmPickup('j1');await api.confirmPickup('j1');
  await api.assignDriver('j1','d1');auth.currentUser.uid='d1';await api.respondToAssignment('j1',false);
  auth.currentUser.uid='admin';await api.assignDriver('j1','d2');auth.currentUser.uid='d2';await api.respondToAssignment('j1',true);
  await api.advanceAssignedJob('j1');await api.advanceAssignedJob('j1');
  const events=Object.values(records.get('jobs/j1').history);
  assert.deepEqual(events.map(e=>e.type),['confirmed','assigned','declined','assigned','accepted','en_route','arrived']);
  assert.ok(events.every(e=>e.at==='timestamp'));
  assert.equal(records.get('jobs/j1').arrivedAt,'timestamp');
});
test('ETA updates validate driver, status, bounds and retain revisions',async()=>{
  const {api,auth,records}=backend();await api.assignDriver('j1','d1');
  auth.currentUser.uid='d1';await assert.rejects(api.sendDriverEta('j1',10),/after accepting/);
  await api.respondToAssignment('j1',true);
  for(const invalid of [0,-1,1.5,NaN,1441])await assert.rejects(api.sendDriverEta('j1',invalid));
  auth.currentUser.uid='d2';await assert.rejects(api.sendDriverEta('j1',10),/Only the assigned/);
  auth.currentUser.uid='d1';await api.sendDriverEta('j1',20);await api.sendDriverEta('j1',15);
  assert.equal(records.get('jobs/j1').eta,15);assert.equal(records.get('jobs/j1').etaUpdatedAt,'timestamp');
  assert.equal(Object.values(records.get('jobs/j1').history).filter(e=>e.type==='eta').length,2);
  await api.advanceAssignedJob('j1');await api.advanceAssignedJob('j1');await assert.rejects(api.sendDriverEta('j1',5),/before arriving/);
});
test('directions encode address; old missing timestamps are not invented',()=>{
  const address='12 Main St #2, A & B, CA';
  assert.equal(new URL(history.directionsUrl(address,'android')).searchParams.get('destination'),address);
  assert.equal(new URL(history.directionsUrl(address,'ios')).searchParams.get('daddr'),address);
  assert.equal(history.readHistory({}).length,0);
  const old=history.readHistory({createdAt:{toMillis:()=>1000}});assert.equal(old[0].atMs,1000);
  assert.equal(history.formatEventTime(null),'Waiting for server time');
});
