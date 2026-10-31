import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const DAYS = new Set([0,1,2,3,4,5,6]);
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ZONE = /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)*$/;

export function createProviderAvailabilityHandler({getDatabase=getPool}={}) {
 return async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  const database=getDatabase();
  if(!req?.auth?.user){const p=await populateAuth(req,{database,bootstrapProfile:true});if(!p.ok)return res.status(p.status).json({error:p.error});}
  const auth=authorize(req,["decluttering_provider"]);
  if(!auth.ok)return res.status(auth.status).json({error:auth.error});
  if(!database)return res.status(503).json({error:"Provider availability is unavailable"});
  const limited=rateLimit(req,{scope:"provider-availability",limit:req.method==="PUT"?5:30,windowMs:60000});
  if(!limited.ok){res.setHeader("Retry-After",String(limited.retryAfterSec));return res.status(limited.status).json({error:limited.error});}
  try {
   const profile=await database.query("SELECT provider_id,status FROM public.service_provider_profiles WHERE provider_id=$1::uuid",[auth.user.id]);
   if(!profile.rows?.length||profile.rows[0].status!=="approved")return res.status(403).json({error:"Only approved service providers can manage availability"});
   if(req.method==="GET"){
    const r=await database.query("SELECT id,weekday,starts_at::text,ends_at::text,timezone,is_active FROM public.service_provider_availability WHERE provider_id=$1::uuid ORDER BY weekday,starts_at",[auth.user.id]);
    return res.status(200).json({availability:r.rows||[]});
   }
   if(req.method==="PUT"){
    const body=req.body&&typeof req.body==="object"?req.body:{};
    const slots=body.availability;
    const timezone=typeof body.timezone==="string"?body.timezone:"Africa/Lagos";
    if(!Array.isArray(slots)||slots.length>28||!ZONE.test(timezone))return res.status(400).json({error:"Provide a valid weekly schedule and timezone"});
    const zoneResult=await database.query("SELECT name FROM pg_timezone_names WHERE name=$1",[timezone]);\n    if(!zoneResult.rows?.length)return res.status(400).json({error:"Choose a recognised timezone"});\n    const seen=new Set();
    for(const slot of slots){
     if(!slot||!DAYS.has(Number(slot.weekday))||typeof slot.starts_at!=="string"||!TIME.test(slot.starts_at)||typeof slot.ends_at!=="string"||!TIME.test(slot.ends_at)||slot.ends_at<=slot.starts_at)return res.status(400).json({error:"Each availability slot needs a valid weekday, start and end time"});
     const key=[slot.weekday,slot.starts_at,slot.ends_at].join("|");if(seen.has(key))return res.status(400).json({error:"Duplicate availability slot"});seen.add(key);
    }
    // Single statement replacement: the old schedule is retained if validation or insertion fails.
    const r=await database.query(
     `WITH removed AS (DELETE FROM public.service_provider_availability WHERE provider_id=$1::uuid),
      inserted AS (
       INSERT INTO public.service_provider_availability(provider_id,weekday,starts_at,ends_at,timezone)
       SELECT $1::uuid,x.weekday,x.starts_at::time,x.ends_at::time,$3
       FROM jsonb_to_recordset($2::jsonb) AS x(weekday smallint,starts_at text,ends_at text)
       RETURNING id,weekday,starts_at::text,ends_at::text,timezone,is_active
      ) SELECT * FROM inserted ORDER BY weekday,starts_at`,
     [auth.user.id,JSON.stringify(slots),timezone]);
    return res.status(200).json({availability:r.rows||[],message:"Weekly availability saved."});
   }
   res.setHeader("Allow","GET, PUT");return res.status(405).json({error:"Method not allowed"});
  }catch{return res.status(500).json({error:"Could not update provider availability"});}
 };
}
export default createProviderAvailabilityHandler();
