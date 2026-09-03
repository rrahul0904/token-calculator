export interface PulseAtlasPageEvent { path:string; }
const endpoint=process.env.NEXT_PUBLIC_PULSEATLAS_ENDPOINT;
const writeKey=process.env.NEXT_PUBLIC_PULSEATLAS_WRITE_KEY;
const enabled=Boolean(endpoint&&writeKey);
function browserId(storage:Storage,key:string,prefix:string){let value=storage.getItem(key);if(!value){value=`${prefix}_${crypto.randomUUID()}`;storage.setItem(key,value)}return value}
export function buildPageEvent(path:string){return{id:`evt_${crypto.randomUUID()}`,schemaVersion:1,organizationId:"portfolio_primary",projectId:"proj_token_intelligence",projectSlug:"token-intelligence",environment:(process.env.NEXT_PUBLIC_PULSEATLAS_ENVIRONMENT??"production"),eventName:"page_view",eventCategory:"page",occurredAt:new Date().toISOString(),anonymousId:browserId(localStorage,"ti_pa_aid","anon"),sessionId:browserId(sessionStorage,"ti_pa_sid","session"),properties:{path:path.split("?")[0].split("#")[0]}}}
export async function trackPulseAtlasPage(path:string){if(!enabled||!endpoint||!writeKey)return false;try{await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-pulseatlas-write-key":writeKey},body:JSON.stringify(buildPageEvent(path)),keepalive:true});return true}catch{return false}}
