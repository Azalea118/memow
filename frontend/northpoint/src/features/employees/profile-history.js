import {apiRequest,apiId} from '../../api/api-client.js';
import {businessDate} from '../reports/yesterday.js';
export const profileHistory={status:'idle',apiId:'',items:[],error:''};
let generation=0,controller;
export async function readProfileHistory(id,options={},request=apiRequest){
 id=apiId(id);const items=[],seen=new Set();let offset=0,total=null;
 for(let page=0;page<2000;page++){
  let data;try{data=await request('/employees/'+id+'/violation-history',{...options,query:{limit:50,offset}});}catch(error){if(error.status===404)throw Error('The server has not loaded the employee history endpoint yet. Restart app1, then try again.');throw error;}
  if(!data||!Array.isArray(data.items)||!Number.isSafeInteger(data.total)||data.total<0||data.offset!==offset||data.limit!==50||total!==null&&total!==data.total)throw Error('Violation history changed or returned an incomplete page. Please try again.');
  total=data.total;
  for(const raw of data.items){
   if(!['active','removed'].includes(raw?.status)||!Number.isSafeInteger(raw.violation_record_id)||raw.violation_record_id<1||typeof raw.subsection_name!=='string'||typeof raw.violation_type_name!=='string'||!Number.isSafeInteger(raw.offense_number)||raw.offense_number<1||typeof raw.issued_at!=='string')throw Error('The API returned an invalid violation-history record.');
   const timestamp=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('The API returned an invalid history date.');return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)?value:value+'Z';};
   const issuedAt=timestamp(raw.issued_at),removed=raw.status==='removed',key=raw.status+':'+raw.violation_record_id;
   if(seen.has(key))throw Error('The API returned repeated history records. Please try again.');seen.add(key);
   items.push({id:String(raw.violation_record_id),subsectionId:raw.subsection_id==null?'':apiId(raw.subsection_id),typeName:raw.subsection_name,categoryName:raw.violation_type_name,offenseNumber:raw.offense_number,penalty:raw.penalty_description||'',issuedAt,date:businessDate(issuedAt),description:raw.notes||'',recordedBy:raw.issued_by||'',removed,removedBy:raw.removed_by||'',removedAt:removed?timestamp(raw.removed_at):'',reason:raw.removal_reason||''});
  }
  if(items.length===total)return items;
  if(!data.items.length||items.length>total)throw Error('The API returned incomplete violation history.');
  offset+=data.items.length;
 }
 throw Error('Violation history is too large to load.');
}
export function invalidateProfileHistory(){generation++;controller?.abort();controller=null;Object.assign(profileHistory,{status:'idle',apiId:'',items:[],error:''});}
export async function loadProfileHistory(id,onChange=()=>{},force=false){
 id=apiId(id);if(!force&&profileHistory.apiId===id&&['loading','ready'].includes(profileHistory.status))return;
 const ticket=++generation;controller?.abort();controller=new AbortController();
 Object.assign(profileHistory,{status:'loading',apiId:id,items:[],error:''});onChange();
 try{const items=await readProfileHistory(id,{signal:controller.signal});if(ticket===generation)Object.assign(profileHistory,{status:'ready',items});}
 catch(error){if(ticket===generation)Object.assign(profileHistory,{status:'error',items:[],error:error.message});}
 finally{if(ticket===generation){controller=null;onChange();}}
}
