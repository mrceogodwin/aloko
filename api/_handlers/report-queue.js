import { getPool } from "../_lib/db.js";
import { authorizeStaff } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
export function createReportQueueHandler({getDatabase=getPool}={}) {
 return async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed"});}
  if(!req?.auth?.user){const populated=await populateAuth(req,{database:getDatabase(),bootstrapProfile:false});if(!populated.ok)return res.status(populated.status).json({error:populated.error});}
  const auth=authorizeStaff(req,["moderator","admin"]);if(!auth.ok)return res.status(auth.status).json({error:auth.error});
  const database=getDatabase();if(!database)return res.status(503).json({error:"Reports queue is temporarily unavailable"});
  try {
   const result=await database.query(`SELECT r.id,r.listing_id,r.reported_user_id,r.reason,r.details,r.status,r.assigned_to,r.resolution_note,r.created_at,reporter.display_name AS reporter_display_name,l.title AS listing_title,l.status AS listing_status,target.display_name AS reported_user_display_name FROM public.listing_reports r LEFT JOIN public.profiles reporter ON reporter.id=r.reporter_id LEFT JOIN public.listings l ON l.id=r.listing_id LEFT JOIN public.profiles target ON target.id=r.reported_user_id WHERE r.status IN ('open','investigating') ORDER BY r.created_at ASC LIMIT 100`);
   return res.status(200).json({items:result.rows||[],count:result.rows?.length||0});
  } catch{return res.status(500).json({error:"Could not load reports queue"});}
 };
}
export default createReportQueueHandler();