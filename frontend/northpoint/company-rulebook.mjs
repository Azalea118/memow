import {createHash} from 'node:crypto';

const categoryNames={I:'Breach of General Security',II:'Negligence',III:'Dishonesty',IV:'Vandalism',V:'Insubordination',VI:'Discourtesy and/or Misbehavior',VII:'Sabotage',VIII:'Additional Offences'};
const plain=text=>text.replace(/\*\*/g,'').trim();
function penalties(text){
 const rows=[...text.matchAll(/^\|\s*(\d+)(?:st|nd|rd|th)\s+Offen[cs]e\s*\|\s*(.*?)\s*\|\s*$/gim)].map(match=>({offense_number:Number(match[1]),description:plain(match[2])}));
 if(!rows.length){const single=text.match(/^\*\*Penalty:\*\*\s*(.+)$/im);if(single)rows.push({offense_number:1,description:plain(single[1])});}
 if(!rows.length||new Set(rows.map(p=>p.offense_number)).size!==rows.length)throw Error('Missing or ambiguous penalty schedule.');
 return rows;
}
export function companyRulebook(markdown){
 const categories=[];let current;
 for(const block of markdown.split(/^## /m).slice(1)){
  const heading=block.slice(0,block.indexOf('\n')).trim(),match=heading.match(/^([IVX]+)\.\s+(.+)$/);
  if(!match||!categoryNames[match[1]])throw Error('Unrecognized category: '+heading);
  current={reference:match[1],name:categoryNames[match[1]],violations:[]};categories.push(current);
  for(const section of block.split(/^### /m).slice(1)){
   const end=section.indexOf('\n'),heading=section.slice(0,end).trim(),match=heading.match(/^([A-Z])\.\s+(.+)$/);
   if(!match)throw Error('Unrecognized company rule: '+heading);
   const reference=current.reference+'.'+match[1],wording=match[2],body=section.slice(end).trim().replace(/\n---\s*$/,'');
   // The current API has one schedule per subsection. Keep the two loss bands separate.
   if(reference==='VIII.F'){
    const branches=body.split(/(?=^\*\*If the amount of loss)/m).filter(text=>/^\*\*If the amount of loss/m.test(text));
    if(branches.length!==2)throw Error('Expected both loss-amount schedules in VIII.F.');
    for(const [index,branch] of branches.entries()){
     const condition=plain(branch.split('\n')[0]).replace(/:$/,'');
     const name='Causing loss of time and money through negligence in official duties — '+(index===0?'loss more than ₱30,000 but less than ₱100,000.':'loss of ₱100,000 or more.');
     current.violations.push({reference:reference+(index===0?'.under100000':'.atleast100000'),name,description:`Source: COMPANY_RULES.md · ${reference} · ${condition}\n${wording}\n\n${condition}`,penalties:penalties(branch)});
    }
   }else{
    // II.D is 302 characters. Remove the possessive ending to fit 300;
    // keep the verbatim original wording and all notes in the backend description.
    const name=wording.length>300?wording.replace('Company’s Rules','Company Rules'):wording;
    const notes=body.split(/\r?\n/).filter(line=>!/^\|\s*(?:Offen[cs]e|\d+(?:st|nd|rd|th)\s+Offen[cs]e)\s*\|/i.test(line)&&!/^\|[-|\s]+\|$/.test(line)&&!/^-{3,}\s*$/.test(line)).join('\n').replace(/\n{3,}/g,'\n\n').trim();
    current.violations.push({reference,name,description:`Source: COMPANY_RULES.md · ${reference}\n${wording}`+(notes?'\n\n'+plain(notes):''),penalties:penalties(body)});
   }
  }
 }
 const counts={categories:categories.length,sections:categories.reduce((n,c)=>n+new Set(c.violations.map(v=>v.reference.split('.').slice(0,2).join('.'))).size,0),violations:categories.reduce((n,c)=>n+c.violations.length,0),penalties:categories.reduce((n,c)=>n+c.violations.reduce((total,v)=>total+v.penalties.length,0),0)};
 if(counts.categories!==8||counts.sections!==77||counts.violations!==78)throw Error('Company rulebook structure changed. Review the source before importing.');
 for(const category of categories)for(const rule of category.violations){if(!rule.name||rule.name.length>300||!rule.penalties.length||rule.penalties.some(p=>!p.description))throw Error('Invalid rule '+rule.reference);}
 return {source:'COMPANY_RULES.md',source_sha256:createHash('sha256').update(markdown).digest('hex'),counts,categories};
}
