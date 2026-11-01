import { getPool } from "../_lib/db.js";
import { authorizeStaff } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED=new Set(["investigating","resolved","dismissed"]);
export function createReportDecideHandler({getDatabase=getPool}={}) {
 return async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
  if(!req?.auth?.user){const populated=await populateAuth(req,{database:getDatabase(),bootstrapProfile:false});if(!populated.ok)return res.status(populated.status).json({error:populated.error});}
  const auth=authorizeStaff(req,["moderator","admin"]);if(!auth.ok)return res.status(auth.status).json({error:auth.error});
  if(!UUID.test(auth.user.id))return res.status(401).json({error:"Authenticated account is not configured for marketplace access"});
  const body=req.body&&typeof req.body==="object"?req.body:{};
  const id=typeof body.report_id==="string"?body.report_id:"";
  const status=typeof body.status==="string"?body.status.trim().toLowerCase():"";
  const note=typeof body.resolution_note==="string"?body.resolution_note.trim().slice(0,2000):"";
  if(!UUID.test(id))return res.status(400).json({error:"A valid report_id is required"});
  if(!ALLOWED.has(status))return res.status(400).json({error:"status must be investigating, resolved or dismissed"});
  if(["resolved","dismissed"].includes(status)&&note.length<3)return res.status(400).json({error:"A resolution note of at least 3 characters is required"});
  const database=getDatabase();if(!database)return res.status(503).json({error:"Report management is temporarily unavailable"});
  try {
   const result=await database.query(`
    WITH changed AS (
     UPDATE public.listing_reports
     SET status=$2,
         assigned_to=CASE WHEN $2='investigating' THEN $3::uuid ELSE assigned_to END,
         resolution_note=CASE WHEN $2 IN ('resolved','dismissed') THEN $4 ELSE resolution_note END,
         resolved_at=CASE WHEN $2 IN ('resolved','dismissed') THEN now() ELSE NULL END
     WHERE id=$1::uuid AND status IN ('open','investigating')
     RETURNING id,listing_id,status,assigned_to,resolution_note,resolved_at
    ), logged AS (
     INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,details)
     SELECT $3::uuid,'report_'||$2,'listing_report',id,
       jsonb_build_object('status',$2,'resolution_note',$4)
     FROM changed
     RETURNING target_id
    )
    SELECT changed.* FROM changed JOIN logged ON logged.target_id=changed.id
   `,[id,status,auth.user.id,note||null]);
   if(!result.rows?.length)return res.status(404).json({error:"Report not found or audit could not be recorded"});
   return res.status(200).json({report:result.rows[0],message:`Report marked ${status}`});
  }catch{return res.status(500).json({error:"Could not update report"});}
 };
}
export default createReportDecideHandler();