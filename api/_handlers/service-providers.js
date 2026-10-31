import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/;
const TYPES = new Set(["decluttering","organising","bulk_removal"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createServiceProvidersHandler({ getDatabase = getPool } = {}) {
  return async function handler(req,res) {
    res.setHeader("Cache-Control","no-store");
    const database=getDatabase();
    const mode=typeof req.query?.mode==="string"?req.query.mode:"directory";
    const isPrivate=mode==="mine";
    if (isPrivate && !req?.auth?.user) {
      const populated=await populateAuth(req,{database,bootstrapProfile:true});
      if(!populated.ok)return res.status(populated.status).json({error:populated.error});
    }
    const auth=isPrivate||req.method==="POST"?authorize(req,["buyer","seller","business","decluttering_provider"]):null;
    if(auth&&!auth.ok)return res.status(auth.status).json({error:auth.error});
    if(auth&&!UUID.test(auth.user.id))return res.status(401).json({error:"Marketplace account is not configured"});
    if(!database)return res.status(503).json({error:"Service providers are temporarily unavailable"});
    const limited=rateLimit(req,{scope:"service-providers",limit:req.method==="POST"?5:60,windowMs:60000});
    if(!limited.ok){res.setHeader("Retry-After",String(limited.retryAfterSec));return res.status(limited.status).json({error:limited.error});}

    try {
      if(req.method==="GET"&&mode==="mine"){
        const result=await database.query(
          `SELECT provider_id,display_name,slug,provider_kind,business_name,description,
                  service_types,city,state,service_areas,years_experience,status,
                  is_accepting_requests,reviewer_note,created_at,updated_at
           FROM public.service_provider_profiles WHERE provider_id=$1::uuid`,
          [auth.user.id],
        );
        return res.status(200).json({provider:result.rows?.[0]||null});
      }
      if(req.method==="GET"&&mode==="directory"){
        const type=typeof req.query?.service_type==="string"?req.query.service_type:"";
        const state=typeof req.query?.state==="string"?req.query.state.trim().slice(0,100):"";
        const city=typeof req.query?.city==="string"?req.query.city.trim().slice(0,100):"";
        if(type&&!TYPES.has(type))return res.status(400).json({error:"Unsupported service type"});
        const result=await database.query(
          `SELECT provider_id,display_name,slug,provider_kind,business_name,description,
                  service_types,city,state,service_areas,years_experience
           FROM public.service_provider_profiles
           WHERE status='approved' AND is_accepting_requests=true
             AND ($1='' OR $1=ANY(service_types))
             AND ($2='' OR lower(state)=lower($2))
             AND ($3='' OR lower(city)=lower($3))
           ORDER BY display_name ASC LIMIT 60`,
          [type,state,city],
        );
        return res.status(200).json({items:result.rows||[]});
      }
      if(req.method!=="POST"){res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"});}
      const body=req.body&&typeof req.body==="object"?req.body:{};
      const clean=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max?v.trim():null;
      const kind=body.provider_kind==="business"?"business":"individual";
      const display=clean(body.display_name,100);
      const slug=typeof body.slug==="string"?body.slug.trim().toLowerCase():"";
      const business=kind==="business"?clean(body.business_name,160):null;
      const description=clean(body.description,2000);
      const city=clean(body.city,100),state=clean(body.state,100);
      const phone=body.contact_phone==null||body.contact_phone===""?null:clean(body.contact_phone,40);
      const email=body.contact_email==null||body.contact_email===""?null:clean(body.contact_email,254);
      const services=body.service_types;
      const areas=body.service_areas==null?[]:body.service_areas;
      const years=body.years_experience==null||body.years_experience===""?null:Number(body.years_experience);
      if(!display||!SLUG.test(slug)||(kind==="business"&&!business)||(kind==="individual"&&body.business_name)||
        !description||description.length<30||!city||!state||!Array.isArray(services)||services.length<1||services.length>3||
        new Set(services).size!==services.length||services.some(v=>!TYPES.has(v))||
        !Array.isArray(areas)||areas.length>30||areas.some(v=>typeof v!=="string"||!v.trim()||v.trim().length>100)||
        (years!==null&&(!Number.isInteger(years)||years<0||years>60))||
        (body.contact_phone&& !phone)||(body.contact_email&&(!email||!EMAIL.test(email)))){
        return res.status(400).json({error:"Complete the provider name, profile URL, service types, description and service location. Check optional contact and experience details."});
      }
      const result=await database.query(
        `INSERT INTO public.service_provider_profiles
           (provider_id,display_name,slug,provider_kind,business_name,description,service_types,
            city,state,service_areas,years_experience,contact_phone,contact_email,status,
            is_accepting_requests,reviewer_id,reviewer_note,reviewed_at,updated_at)
         SELECT p.id,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10::text[],$11,$12,$13,
                'pending',false,NULL,NULL,NULL,now()
         FROM public.profiles p
         WHERE p.id=$1::uuid AND p.is_suspended=false
           AND p.account_type IN ('individual','reseller','business','bulk_distributor','decluttering_provider')`,
        [auth.user.id,display,slug,kind,business,description,services,city,state,areas.map(v=>v.trim()),years,phone,email],
      );
      if(!result.rows?.length)return res.status(409).json({error:"Provider profile could not be created for this account"});
      return res.status(201).json({provider:result.rows[0],message:"Provider application submitted. Your profile will appear publicly after review."});
    } catch(error) {
      if(error?.code==="23505")return res.status(409).json({error:"That provider URL is already in use. Choose another."});
      return res.status(500).json({error:"Could not process provider profile"});
    }
  };
}
export default createServiceProvidersHandler();
