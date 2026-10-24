import { useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { sendDriverEta } from './dispatchBackend';
import { directionsUrl, eventLabels, formatEventTime } from './jobHistory';
import type { Job } from './pickupModel';

export function PickupDirections({address}: {address: string}) {
  return <Pressable accessibilityRole="link" onPress={() => Linking.openURL(directionsUrl(address, Platform.OS)).catch(() => Alert.alert('Could not open maps', 'Open your maps app and enter the pickup address.'))}>
    <Text style={s.link}>{address}</Text><Text style={s.note}>Tap for driving directions and ETA in Maps</Text>
  </Pressable>;
}
export function CustomerEta({job}: {job: Job}) {
  if (!job.etaUpdatedAtMs || !job.eta || !['accepted','en_route'].includes(job.status)) return null;
  return <View style={s.block} accessibilityLiveRegion="polite"><Text style={s.heading}>Estimated arrival: {formatEventTime(job.etaUpdatedAtMs + job.eta * 60000)}</Text><Text style={s.note}>Driver estimated {job.eta} minutes at {formatEventTime(job.etaUpdatedAtMs)}. This is the last reported estimate.</Text></View>;
}
export function DriverEta({job}: {job: Job}) {
  const [minutes,setMinutes]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const lock=useRef(false);
  const send = async () => {
    if(lock.current)return;
    if(!/^\d+$/.test(minutes.trim())) {setNotice('Enter your ETA in whole minutes.');return;}
    lock.current=true;setBusy(true);setNotice('');
    try {await sendDriverEta(job.id,Number(minutes));setNotice('ETA sent to the customer.');setMinutes('');}
    catch(e){setNotice(e instanceof Error?e.message:'Unable to send ETA.');}
    finally{lock.current=false;setBusy(false);}
  };
  return <View style={s.block}><PickupDirections address={job.pickup}/>
    {['accepted','en_route'].includes(job.status) && <>
      <Text style={s.heading}>Send arrival estimate</Text><Text style={s.note}>Check Maps, then enter how many minutes until you arrive.</Text>
      <TextInput accessibilityLabel="ETA in minutes" editable={!busy} keyboardType="number-pad" value={minutes} onChangeText={setMinutes} placeholder="Minutes" style={s.input}/>
      <Pressable accessibilityRole="button" disabled={busy} onPress={send} style={[s.button,busy&&{opacity:.5}]}><Text style={s.buttonText}>{busy?'Sending…':'Send ETA to customer'}</Text></Pressable>
      {!!notice&&<Text accessibilityLiveRegion="polite" style={s.note}>{notice}</Text>}
      <CustomerEta job={job}/>
    </>}
  </View>;
}
export function JobTimeline({job}: {job:Job}) {
  const events=job.history||[];
  const lines=events.map(e=>`${eventLabels[e.type]||e.type}${e.detail?` · ${e.detail}`:''}: ${formatEventTime(e.atMs)}`);
  return <View style={s.block}><Text style={s.heading}>Pickup history</Text>
    {!events.length&&<Text style={s.note}>No event times recorded for this older pickup.</Text>}
    {events.map((e,index)=><Text key={e.id} style={s.note}>{lines[index]}</Text>)}
    {!!events.length&&<Pressable accessibilityRole="button" onPress={()=>Share.share({message:`HaulConnect pickup ${job.id}\n${lines.join('\n')}`}).catch(()=>Alert.alert('Unable to share', 'Please try again.'))}><Text style={s.link}>Share pickup timeline</Text></Pressable>}
  </View>;
}
const s=StyleSheet.create({block:{gap:10,paddingVertical:10},heading:{fontSize:16,fontWeight:'700',color:'#0B3B2E'},note:{color:'#52615A',lineHeight:21},link:{color:'#116B37',fontSize:16,fontWeight:'600',paddingVertical:8},input:{padding:14,borderWidth:1,borderColor:'#CEDBD2',borderRadius:12},button:{backgroundColor:'#116B37',padding:16,borderRadius:12,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'700'}});
