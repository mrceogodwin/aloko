import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function createProviderAvailabilityHandler({getDatabase=getPool}={}) {
 return async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");const database=getDatabase();
  if(!req?.auth?.user){const p=await populateAuth(req,{database,bootstrapProfile:true});if(!p.ok)return res.status(p.status).json({error:p.error});}
  const auth=authorize(req,["decluttering_provider"]);if(!auth.ok)return res.status(auth.status).json({error:auth.error});
  if(!database)return res.status(503).json({error:"Provider availability is unavailable"});
  const limited=rateLimit(req,{scope:"provider-availability",limit:req.method==="PUT"?5:30,windowMs:60000});
  if(!limited.ok){res.setHeader("Retry-After",String(limited.retryAfterSec));return res.status(limited.status).json({error:limited.error});}
  try {
   const profile=await database.query("SELECT provider_id,status FROM public.service_provider_profiles WHERE provider_id=$1::uuid",[auth.user.id]);
   if(!profile.rows?.length||profile.rows[0].status!=="approved")return res.status(403).json({error:"Only approved service providers can manage availability"});
   if(req.method==="GET"){
    const [weekly,exceptions]=await Promise.all([
     database.query("SELECT id,weekday,starts_at::text,ends_at::text,timezone,is_active FROM public.service_provider_availability WHERE provider_id=$1::uuid ORDER BY weekday,starts_at",[auth.user.id]),
     database.query("SELECT id,exception_date,is_available,starts_at::text,ends_at::text,note FROM public.service_provider_availability_exceptions WHERE provider_id=$1::uuid AND exception_date>=CURRENT_DATE ORDER BY exception_date LIMIT 90",[auth.user.id])
    ]);
    return res.status(200).json({availability:weekly.rows||[],exceptions:exceptions.rows||[]});
   }
   if(req.method==="PUT"){
    const body=req.body&&typeof req.body==="object"?req.body:{},slots=body.availability,timezone=typeof body.timezone==="string"?body.timezone:"Africa/Lagos";
    if(!Array.isArray(slots)||slots.length>28)return res.status(400).json({error:"Provide up to 28 weekly availability slots"});
    const zone=await database.query("SELECT name FROM pg_timezone_names WHERE name=$1",[timezone]);
    if(!zone.rows?.length)return res.status(400).json({error:"Choose a recognised timezone"});
    const seen=new Set();
    for(const s of slots){if(!s||!Number.isInteger(Number(s.weekday))||Number(s.weekday)<0||Number(s.weekday)>6||!TIME.test(s.starts_at)||!TIME.test(s.ends_at)||s.ends_at<=s.starts_at)return res.status(400).json({error:"Each slot needs a valid weekday, start and end time"});const k=[s.weekday,s.starts_at,s.ends_at].join("|");if(seen.has(k))return res.status(400).json({error:"Duplicate weekly availability slot"});seen.add(k);}
    const saved=await database.query(
     `WITH removed AS (DELETE FROM public.service_provider_availability WHERE provider_id=$1::uuid),
      inserted AS (INSERT INTO public.service_provider_availability(provider_id,weekday,starts_at,ends_at,timezone)
       SELECT $1::uuid,x.weekday,x.starts_at::time,x.ends_at::time,$3
       FROM jsonb_to_recordset($2::jsonb) AS x(weekday smallint,starts_at text,ends_at text)
       RETURNING id,weekday,starts_at::text,ends_at::text,timezone,is_active)
      SELECT * FROM inserted ORDER BY weekday,starts_at`,
     [auth.user.id,JSON.stringify(slots),timezone]);
    return res.status(200).json({availability:saved.rows||[],message:"Weekly availability saved."});
   }
   if(req.method==="POST"){
    const body=req.body&&typeof req.body==="object"?req.body:{},date=body.exception_date;
    const available=body.is_available===true,starts=body.starts_at,ends=body.ends_at,note=typeof body.note==="string"?body.note.trim().slice(0,240):null;
    if(typeof date!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z"))||date<new Date().toISOString().slice(0,10)||
      (available&&(!TIME.test(starts)||!TIME.test(ends)||ends<=starts))||(!available&&(starts||ends)))return res.status(400).json({error:"Provide a future date off, or an exceptional working window with valid start and end times"});
    const r=await database.query(
     `INSERT INTO public.service_provider_availability_exceptions(provider_id,exception_date,is_available,starts_at,ends_at,note)
      VALUES($1::uuid,$2::date,$3,$4::time,$5::time,$6)
      ON CONFLICT(provider_id,exception_date) DO UPDATE SET is_available=EXCLUDED.is_available,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,note=EXCLUDED.note,updated_at=now()
      RETURNING id,exception_date,is_available,starts_at::text,ends_at::text,note`,
     [auth.user.id,date,available,available?starts:null,available?ends:null,note]);
    return res.status(200).json({exception:r.rows?.[0],message:"Date exception saved."});
   }
   if(req.method==="DELETE"){
    const id=typeof req.body?.id==="string"?req.body.id:"";
    if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:"Choose a valid date exception"});
    const r=await database.query("DELETE FROM public.service_provider_availability_exceptions WHERE id=$1::uuid AND provider_id=$2::uuid RETURNING id",[id,auth.user.id]);
    if(!r.rows?.length)return res.status(404).json({error:"Date exception not found"});
    return res.status(200).json({message:"Date exception removed."});
   }
   res.setHeader("Allow","GET, PUT, POST, DELETE");return res.status(405).json({error:"Method not allowed"});
  }catch{return res.status(500).json({error:"Could not update provider availability"});}
 };
}
export default createProviderAvailabilityHandler();
