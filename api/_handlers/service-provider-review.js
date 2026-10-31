import { getPool } from "../_lib/db.js";
import { authorizeStaff } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createServiceProviderReviewHandler({getDatabase=getPool}={}) {
  return async function handler(req,res) {
    res.setHeader("Cache-Control","no-store");
    const database=getDatabase();
    if(!req?.auth?.user) {
      const populated=await populateAuth(req,{database,bootstrapProfile:false});
      if(!populated.ok)return res.status(populated.status).json({error:populated.error});
    }
    const auth=authorizeStaff(req);
    if(!auth.ok)return res.status(auth.status).json({error:auth.error});
    if(!UUID.test(auth.user.id))return res.status(401).json({error:"Marketplace account is not configured"});
    if(!database)return res.status(503).json({error:"Provider review is temporarily unavailable"});
    const limited=rateLimit(req,{scope:"service-provider-review",limit:30,windowMs:60000});
    if(!limited.ok){res.setHeader("Retry-After",String(limited.retryAfterSec));return res.status(limited.status).json({error:limited.error});}
    try {
      if(req.method==="GET") {
        const result=await database.query(
          `SELECT provider_id,display_name,slug,provider_kind,business_name,description,
                  service_types,city,state,service_areas,years_experience,status,
                  is_accepting_requests,created_at,updated_at
           FROM public.service_provider_profiles
           WHERE status IN ('pending','rejected')
           ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at ASC
           LIMIT 100`,
        );
        return res.status(200).json({items:result.rows||[]});
      }
      if(req.method!=="POST"){res.setHeader("Allow","GET, POST");return res.status(405).json({error:"Method not allowed"});}
      if(auth.user.role!=="admin")return res.status(403).json({error:"Only administrators can approve provider profiles"});
      const body=req.body&&typeof req.body==="object"?req.body:{};
      const providerId=typeof body.provider_id==="string"?body.provider_id:"";
      const decision=body.decision;
      const note=typeof body.note==="string"?body.note.trim().slice(0,1000):"";
      if(!UUID.test(providerId)||!["approve","reject"].includes(decision))return res.status(400).json({error:"Choose a valid provider and approval decision"});
      const result=await database.query(
        `UPDATE public.service_provider_profiles
         SET status=$2,is_accepting_requests=($2='approved'),reviewer_id=$3::uuid,
             reviewer_note=$4,reviewed_at=now(),updated_at=now()
         WHERE provider_id=$1::uuid AND status IN ('pending','rejected')
         RETURNING provider_id,display_name,status,reviewer_note,reviewed_at`,
        [providerId,decision==="approve"?"approved":"rejected",auth.user.id,note||null],
      );
      if(!result.rows?.length)return res.status(404).json({error:"Provider application not found or no longer reviewable"});
      return res.status(200).json({provider:result.rows[0],message:decision==="approve"?"Provider approved and added to the public directory.":"Provider application rejected."});
    } catch {
      return res.status(500).json({error:"Could not process provider review"});
    }
  };
}
export default createServiceProviderReviewHandler();
