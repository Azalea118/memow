import {dataSource} from '../../state/data-source.js';
const validLocation=(lat,lon)=>Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180;
export async function readTrackingDevices(signal){
 const raw=await dataSource.request({service:'tracking',path:'/devices',query:{include_offline:true},signal});
 if(!raw||!Array.isArray(raw.devices)||!Number.isSafeInteger(raw.count)||raw.count!==raw.devices.length)throw Error('The tracking service returned an invalid device list.');
 const ids=new Set();
 for(const d of raw.devices){
  if(typeof d.device_id!=='string'||!d.device_id.trim()||ids.has(d.device_id)||d.tracker!=null&&typeof d.tracker!=='string'||!['online','disconnected'].includes(d.status)||!validLocation(d.lat,d.lon)||!Number.isSafeInteger(d.last_seen_seconds_ago)||d.last_seen_seconds_ago<0||d.accuracy_m!=null&&(!Number.isFinite(d.accuracy_m)||d.accuracy_m<0))throw Error('The tracking service returned invalid device details.');
  ids.add(d.device_id);
 }
 return raw.devices;
}
function devicePath(kind,id){if(typeof id!=='string'||!id.trim()||['.','..'].includes(id)||id.length>200)throw Error('Enter a valid device ID.');return '/'+kind+'/'+encodeURIComponent(id);}
export async function readTrackingLocation(id,signal){
 const raw=await dataSource.request({service:'tracking',path:devicePath('live',id),signal});
 if(!raw||!['online','disconnected','not_connected'].includes(raw.status)||raw.status!=='not_connected'&&!validLocation(raw.lat,raw.lon))throw Error('The tracking service returned an invalid location.');
 return raw;
}
export async function readTrackingRoute(id,signal){
 const raw=await dataSource.request({service:'tracking',path:devicePath('route',id),signal});
 if(!raw||!Array.isArray(raw.segments)||raw.segments.some(segment=>!Array.isArray(segment)||segment.some(p=>!Array.isArray(p)||p.length!==2||!validLocation(p[0],p[1]))))throw Error('The tracking service returned an invalid route.');
 // Defense in depth: use timestamp/accuracy metadata when the new backend provides it.
 const distance=(a,b)=>{const r=Math.PI/180,h=Math.sin((b[0]-a[0])*r/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin((b[1]-a[1])*r/2)**2;return 12742000*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));};
 const result=[];
 if(Array.isArray(raw.point_segments)){
  for(const segment of raw.point_segments){
   if(!Array.isArray(segment))throw Error('Invalid route quality data.');
   let points=[],last=null;
   for(const p of segment){
    if(!p||!validLocation(p.lat,p.lon)||!Number.isFinite(p.ts)||p.acc!=null&&(!Number.isFinite(p.acc)||p.acc<0||p.acc>25))continue;
    const coord=[p.lat,p.lon];
    if(last){const dt=p.ts-last.ts,d=distance([last.lat,last.lon],coord);if(dt<=0||dt<=60&&d>45*dt+125)continue;if(dt>60||d>1000){if(points.length)result.push(points);points=[];}}
    points.push(coord);last=p;
   }
   if(points.length)result.push(points);
  }
 }else{
  // Legacy API has no timestamps: break long connectors rather than invent a route.
  for(const segment of raw.segments){let points=[];for(const coord of segment){if(points.length&&distance(points[points.length-1],coord)>1000){result.push(points);points=[];}points.push(coord);}if(points.length)result.push(points);}
 }
 return result;
}
