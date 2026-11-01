import { getPool } from "../_lib/db.js";
import { authorizeStaff } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createUserSuspensionHandler({getDatabase=getPool}={}) {
 return async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
  if(!req?.auth?.user){const populated=await populateAuth(req,{database:getDatabase(),bootstrapProfile:false});if(!populated.ok)return res.status(populated.status).json({error:populated.error});}
  const auth=authorizeStaff(req,["moderator","admin"]);if(!auth.ok)return res.status(auth.status).json({error:auth.error});
  if(!UUID.test(auth.user.id))return res.status(401).json({error:"Authenticated staff account is not configured for marketplace access"});
  const body=req.body&&typeof req.body==="object"?req.body:{};
  const userId=typeof body.user_id==="string"?body.user_id:"";
  const suspended=body.suspended;
  const reason=typeof body.reason==="string"?body.reason.trim().slice(0,1000):"";
  if(!UUID.test(userId))return res.status(400).json({error:"A valid user_id is required"});
  if(userId===auth.user.id)return res.status(400).json({error:"You cannot suspend or reinstate your own account"});
  if(typeof suspended!=="boolean")return res.status(400).json({error:"suspended must be true or false"});
  if(reason.length<3)return res.status(400).json({error:"A reason of at least 3 characters is required"});
  const database=getDatabase();if(!database)return res.status(503).json({error:"User management is temporarily unavailable"});
  try {
   const result=await database.query(`UPDATE public.profiles p SET is_suspended=$2,updated_at=now() WHERE p.id=$1::uuid AND NOT EXISTS (SELECT 1 FROM public.staff_memberships sm WHERE sm.user_id=p.id AND sm.is_active=true AND sm.role='admin'::public.account_role) RETURNING p.id,p.display_name,p.is_suspended,p.updated_at`,[userId,suspended]);
   if(!result.rows?.length)return res.status(404).json({error:"User not found or protected administrator account"});
   try{await database.query(`INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,details) VALUES($1::uuid,$2,'profile',$3,$4::jsonb)`,[auth.user.id,suspended?"suspend_user":"reinstate_user",userId,JSON.stringify({reason})]);}catch{}
   return res.status(200).json({user:result.rows[0],message:suspended?"User suspended":"User reinstated"});
  }catch{return res.status(500).json({error:"Could not update user status"});}
 };
}
export default createUserSuspensionHandler();