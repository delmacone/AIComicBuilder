import { blackfistSequences } from "@/lib/db/schema";
type Sequence=typeof blackfistSequences.$inferSelect;
export function selectActiveSequenceRevisions(rows:Sequence[]){
 const groups=new Map<string,Sequence[]>();
 for(const row of rows){const key=row.revisionOfSequenceId||row.id;groups.set(key,[...(groups.get(key)||[]),row])}
 const active:Sequence[]=[];const blocked:string[]=[];
 for(const [key,versions] of groups){const newest=[...versions].sort((a,b)=>b.revisionNumber-a.revisionNumber||b.createdAt.getTime()-a.createdAt.getTime())[0];if(newest.avStatus==="approved"&&newest.finalVideoUrl){active.push(newest)}else{blocked.push(key)}}
 return {active,blocked,groupCount:groups.size};
}
