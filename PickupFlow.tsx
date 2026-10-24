import { CustomerEta, JobTimeline, PickupDirections } from './JobWorkflow';
import { confirmPickup } from './dispatchBackend';
import { useRef, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { US_STATES, isAwaitingDispatch, statusLabels, validatePickup, type DriverOption, type Job, type PaymentMethod, type PickupDetails, type PickupDraft } from './pickupModel';

const labels = { card: 'Card', cash: 'Cash', check: 'Check' };
function Button({ title, onPress, disabled = false, secondary = false }: {title: string; onPress: () => void; disabled?: boolean; secondary?: boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && {opacity: .45}]}><Text style={[s.buttonText, secondary && {color:'#116B37'}]}>{title}</Text></Pressable>;
}
export function ContactPhone({phone}: {phone?: string}) {
  if (!phone) return <Text style={s.note}>Phone number missing from this older booking.</Text>;
  return <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${phone.replace(/[^+\d]/g,'')}`).catch(() => Alert.alert('Phone', phone))}><Text style={s.link}>Call customer: {phone}</Text></Pressable>;
}
export function JobPhotos({job}: {job: Job}) {
  return <View style={s.photos}>{job.customerPhotoUploads?.map(photo => <Image key={photo.url} accessibilityLabel={photo.label} source={{uri:photo.url}} style={s.photo}/>)}</View>;
}
export function CustomerPickups({jobs, onBookAnother}: {jobs: Job[]; onBookAnother: () => void}) {
  return <View style={s.stack}>
    <Text style={s.heading}>My pickups</Text>
    {jobs.length === 0 && <Text style={s.note}>Your pickup requests will appear here.</Text>}
    {jobs.map(job => <View key={job.id} style={s.card}>
      <Text accessibilityLiveRegion="polite" style={s.heading}>{statusLabels[job.status]}</Text>
      <Text style={s.note}>{job.status === 'confirmed' ? 'Dispatch confirmed your pickup and is choosing a driver.' : isAwaitingDispatch(job.status) ? 'Your request is saved. Dispatch will review it and assign a driver.' : job.status === 'assigned' ? 'Dispatch has offered your pickup to a driver. Waiting for their response.' : job.status === 'accepted' ? `${job.driverName || 'Your driver'} accepted your pickup. We will update this screen when they are on the way.` : job.status === 'en_route' ? `${job.driverName || 'Your driver'} is on the way.` : job.status === 'completed' ? 'Your pickup is complete.' : 'Your driver has updated your pickup.'}</Text>
      <Text style={s.label}>{job.pickup}</Text><Text>{job.details}</Text>
      {job.driverName && <Text style={s.note}>Driver: {job.driverName}</Text>}
      <Text style={s.note}>Phone: {job.customerPhone || 'Not provided in this older request'}</Text>
      <Text style={s.note}>Payment preference: {labels[job.paymentMethod]}</Text>
      <Text style={s.note}>Reference: {job.id}</Text>
      <CustomerEta job={job}/><JobTimeline job={job}/>
      <JobPhotos job={job}/>
    </View>)}
    <Button title="Book another pickup" secondary onPress={onBookAnother}/>
  </View>;
}
export function PickupBookingForm({bookPickup, pendingRequest, photoUris, addPhoto, deletePhoto, paymentMethod, setPaymentMethod, onBack}: {
  bookPickup: (details: PickupDetails) => Promise<string>; pendingRequest: PickupDraft | null;
  photoUris: Record<string,string>; addPhoto: (label: string) => Promise<void>; deletePhoto: (label:string) => void;
  paymentMethod: PaymentMethod; setPaymentMethod: (method:PaymentMethod) => void; onBack?: () => void;
}) {
  const [fields, setFields] = useState<PickupDetails>(pendingRequest || {street:'',city:'',state:'',phone:'',details:''});
  const [stateOpen, setStateOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [locked,setLocked] = useState(!!pendingRequest);
  const [photoBusy,setPhotoBusy] = useState(false);
  const [error,setError] = useState('');
  const lock = useRef(false);
  const photoLock = useRef(false);
  const update = (key: keyof PickupDetails, value: string) => setFields(current => ({...current,[key]:value}));
  const submit = async () => {
    if (lock.current || photoLock.current) return;
    const validation = validatePickup(fields);
    if (validation) {setError(validation);return;}
    lock.current=true;setBusy(true);setLocked(true);setError('');
    try {await bookPickup(fields);} catch(e) {setError(`${e instanceof Error ? e.message : 'Unable to book.'} Retry to confirm the same request.`);}
    finally {lock.current=false;setBusy(false);}
  };
  const capture = async () => {
    if (photoLock.current || locked) return;
    photoLock.current=true;setPhotoBusy(true);
    try {await addPhoto(`Photo ${Date.now()}`);} catch(e) {setError(e instanceof Error ? e.message : 'Unable to add photo.');}
    finally {photoLock.current=false;setPhotoBusy(false);}
  };
  return <View style={s.stack}>
    {onBack && <Button title="Back to my pickups" secondary onPress={onBack}/>}
    <View style={s.card}>
      <Text style={s.heading}>Book a pickup</Text>
      <Text style={s.label}>Street address *</Text>
      <TextInput accessibilityLabel="Street address" editable={!locked} value={fields.street} onChangeText={v=>update('street',v)} placeholder="123 Main St, unit or apartment" style={s.input}/>
      <Text style={s.label}>City *</Text>
      <TextInput accessibilityLabel="City" editable={!locked} value={fields.city} onChangeText={v=>update('city',v)} placeholder="City" style={s.input}/>
      <Text style={s.label}>State *</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose state" disabled={locked} onPress={()=>setStateOpen(true)} style={s.input}><Text>{US_STATES.find(([code])=>code===fields.state)?.[1] || 'Select state'} ▾</Text></Pressable>
      <Modal visible={stateOpen} transparent animationType="slide" onRequestClose={()=>setStateOpen(false)}>
        <View style={s.backdrop}><View style={s.stateSheet} accessibilityViewIsModal><Text style={s.heading}>Choose state</Text><ScrollView>{US_STATES.map(([code,name])=><Pressable accessibilityRole="button" key={code} style={s.stateRow} onPress={()=>{update('state',code);setStateOpen(false);}}><Text>{name} ({code}){fields.state===code?' ✓':''}</Text></Pressable>)}</ScrollView><Button title="Cancel" secondary onPress={()=>setStateOpen(false)}/></View></View>
      </Modal>
      <Text style={s.label}>Phone number *</Text>
      <TextInput accessibilityLabel="Customer phone number" editable={!locked} keyboardType="phone-pad" autoComplete="tel" value={fields.phone} onChangeText={v=>update('phone',v)} placeholder="(555) 123-4567" style={s.input}/>
      <Text style={s.note}>Dispatch and your assigned driver can use this number to reach you.</Text>
      <Text style={s.label}>Items to remove *</Text>
      <TextInput accessibilityLabel="Items to remove" editable={!locked} multiline value={fields.details} onChangeText={v=>update('details',v)} placeholder="Describe the items" style={[s.input,{minHeight:100,textAlignVertical:'top'}]}/>
    </View>
    <View style={s.card}><Text style={s.heading}>Item photos · Optional</Text>
      <View style={s.photos}>{Object.entries(photoUris).map(([label,uri],index)=><View key={label}><Image accessibilityLabel={`Item photo ${index+1}`} source={{uri}} style={s.photo}/><Pressable accessibilityRole="button" disabled={locked || photoBusy} onPress={()=>deletePhoto(label)}><Text style={s.link}>Remove photo {index+1}</Text></Pressable></View>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Add item photo" disabled={locked || photoBusy} onPress={capture} style={[s.addPhoto, Object.keys(photoUris).length===0 && {width:'100%'}]}><Text style={s.plus}>+</Text><Text>{photoBusy?'Opening camera…':Object.keys(photoUris).length?'Add more':'Tap to add a photo'}</Text></Pressable>
      </View>
    </View>
    <View style={s.card}><Text style={s.heading}>Payment</Text>{(['card','cash','check'] as PaymentMethod[]).map(method=><Pressable key={method} disabled={locked} accessibilityRole="radio" accessibilityState={{checked:paymentMethod===method}} onPress={()=>setPaymentMethod(method)} style={[s.input,paymentMethod===method && s.selected]}><Text>{labels[method]}{paymentMethod===method?' ✓':''}</Text></Pressable>)}</View>
    <Text style={s.note}>Your request will go to dispatch for confirmation. No payment is collected when booking.</Text>
    {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
    <Button title={busy?'Booking…':locked?'Retry booking':'Book pickup'} onPress={submit} disabled={busy || photoBusy}/>
  </View>;
}
export function AdminDispatch({jobs,drivers,onAssign}: {jobs:Job[];drivers:DriverOption[];onAssign:(jobId:string,driverId:string)=>Promise<void>}) {
  const awaitingAssignment = jobs.filter(job => isAwaitingDispatch(job.status));
  return <View style={s.stack}><Text style={s.heading}>Admin dispatch</Text>{!awaitingAssignment.length && <Text style={s.note}>No bookings awaiting assignment.</Text>}{awaitingAssignment.map(job=><DispatchCard key={job.id} job={job} drivers={drivers} onAssign={onAssign}/>)}</View>;
}
function DispatchCard({job,drivers,onAssign}:{job:Job;drivers:DriverOption[];onAssign:(jobId:string,driverId:string)=>Promise<void>}) {
  const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const lock=useRef(false);
  const confirm=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await confirmPickup(job.id);}catch(e){setError(e instanceof Error?e.message:'Confirmation failed.');}finally{lock.current=false;setBusy(false);}};
  const assign=async()=>{if(!selected||lock.current)return;lock.current=true;setBusy(true);setError('');try{await onAssign(job.id,selected);}catch(e){setError(e instanceof Error?e.message:'Assignment failed.');}finally{lock.current=false;setBusy(false);}};
  return <View style={s.card}><Text style={s.heading}>{job.customer}</Text><Text style={s.label}>{statusLabels[job.status]}</Text><Text>{job.pickup}</Text><Text>{job.details}</Text><ContactPhone phone={job.customerPhone}/><Text style={s.note}>Reference: {job.id}</Text><Text style={s.note}>Payment preference: {labels[job.paymentMethod]}</Text><JobPhotos job={job}/>
    {job.driverName && <Text style={s.note}>Driver: {job.driverName}</Text>}
    {isAwaitingDispatch(job.status) && <>
      {job.status !== 'confirmed' && <Button title={busy?'Updating…':'Confirm booking'} disabled={busy} onPress={confirm}/>}
      {job.lastDeclinedDriverName && <Text style={s.note}>{job.lastDeclinedDriverName} declined. Assign another driver.</Text>}
      <Text style={s.label}>Assign driver</Text>{!drivers.length && <Text style={s.note}>No driver accounts found.</Text>}
      {drivers.map(driver=><Pressable key={driver.id} disabled={busy} style={[s.input,selected===driver.id&&s.selected]} onPress={()=>setSelected(driver.id)}><Text>{driver.name}{selected===driver.id?' ✓':''}</Text></Pressable>)}
      <Button title={busy?'Assigning…':'Send to driver'} disabled={!selected||busy} onPress={assign}/>
    </>}<CustomerEta job={job}/><JobTimeline job={job}/>{!!error&&<Text style={s.error}>{error}</Text>}
  </View>;
}
export function DriverInvitations({jobs,onRespond}: {jobs:Job[];onRespond:(id:string,accept:boolean)=>Promise<void>}) {
  return <View style={s.stack}>{jobs.filter(job=>job.status==='assigned').map(job=><Invitation key={job.id} job={job} onRespond={onRespond}/>)}</View>;
}
function Invitation({job,onRespond}:{job:Job;onRespond:(id:string,accept:boolean)=>Promise<void>}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const lock=useRef(false);
  const respond=async(accept:boolean)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await onRespond(job.id,accept);}catch(e){setError(e instanceof Error?e.message:'Unable to respond.');}finally{lock.current=false;setBusy(false);}};
  return <View style={s.card}><Text style={s.heading}>New pickup assignment</Text><PickupDirections address={job.pickup}/><Text>{job.details}</Text><ContactPhone phone={job.customerPhone}/><JobPhotos job={job}/><JobTimeline job={job}/><Button title={busy?'Updating…':'Accept pickup'} disabled={busy} onPress={()=>respond(true)}/><Button title="Decline pickup" secondary disabled={busy} onPress={()=>respond(false)}/>{!!error&&<Text style={s.error}>{error}</Text>}</View>;
}
const s=StyleSheet.create({
  stack:{gap:16},card:{backgroundColor:'#fff',borderRadius:20,padding:20,gap:12},heading:{fontSize:21,fontWeight:'700',color:'#0B3B2E'},label:{fontSize:15,fontWeight:'600',color:'#182822'},note:{fontSize:14,color:'#52615A',lineHeight:21},
  input:{borderWidth:1,borderColor:'#CEDBD2',borderRadius:12,padding:14,color:'#182822',backgroundColor:'#fff'},selected:{borderColor:'#116B37',backgroundColor:'#EAF8EF'},button:{backgroundColor:'#116B37',padding:16,borderRadius:12,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'700',fontSize:16},secondary:{backgroundColor:'#EAF8EF'},photos:{flexDirection:'row',flexWrap:'wrap',gap:12},photo:{width:120,height:120,borderRadius:12},addPhoto:{minHeight:120,width:120,borderWidth:1,borderStyle:'dashed',borderColor:'#116B37',borderRadius:12,alignItems:'center',justifyContent:'center',padding:10},plus:{fontSize:30,color:'#116B37'},link:{color:'#116B37',paddingVertical:10,fontWeight:'600'},error:{color:'#A02020',lineHeight:22},backdrop:{flex:1,backgroundColor:'#0008',justifyContent:'flex-end'},stateSheet:{maxHeight:'80%',padding:24,gap:16,backgroundColor:'#fff',borderTopLeftRadius:24,borderTopRightRadius:24},stateRow:{paddingVertical:16,borderBottomWidth:1,borderBottomColor:'#E5EBE7'},
});
