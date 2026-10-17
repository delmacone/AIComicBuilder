/** Pure editorial readiness rules. No database, network, or paid AI calls. */
export type ReadinessStage={key:string;title:string;issues:string[]};
export function buildReadinessSummary(stages:ReadinessStage[]){
 const completedStages=stages.filter(stage=>stage.issues.length===0).length;
 const checklist=stages.flatMap((stage,stageIndex)=>stage.issues.map((issue,issueIndex)=>({id:stage.key+"-"+issueIndex,stage:stage.key,stageTitle:stage.title,priority:stageIndex+1,action:issue})));
 const requiredStageKeys=["screenplay","storyboard","animation","voices","soundtrack","video","alignment","runtime","reviewMaster"];
 const stageKeys=stages.map(stage=>stage.key);
 const hasCompleteStageSet=stages.length===requiredStageKeys.length&&requiredStageKeys.every(key=>stageKeys.filter(actual=>actual===key).length===1);
 const milestoneDefinitions=[
  {key:"animation",title:"Animation production",requires:["screenplay","storyboard"]},
  {key:"audio",title:"Audio mixing",requires:["screenplay","voices"]},
  {key:"assembly",title:"Final video assembly",requires:["screenplay","storyboard","animation","runtime","video"]},
  {key:"editorial",title:"Editorial review",requires:["video","soundtrack","alignment","reviewMaster"]},
 ];
 const milestones=milestoneDefinitions.map(m=>{const blockers=m.requires.flatMap(key=>stages.find(stage=>stage.key===key)?.issues??["Missing stage: "+key]);return {key:m.key,title:m.title,ready:blockers.length===0,blockers}});
 return {stages:stages.map(stage=>({...stage,ready:stage.issues.length===0})),milestones,checklist,nextAction:checklist[0]??null,completedStages,totalStages:stages.length,readyForReview:hasCompleteStageSet&&completedStages===stages.length};
}
