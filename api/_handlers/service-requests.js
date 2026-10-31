import { getPool } from "../_lib/db.js";
import { authorize } from "../_lib/authz.js";
import { populateAuth } from "../_lib/populate-auth.js";
import { rateLimit } from "../_lib/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["decluttering","organising","bulk_removal"]);

export function createServiceRequestsHandler({ getDatabase = getPool } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control","no-store");
    const database = getDatabase();
    if (!req?.auth?.user) {
      const populated = await populateAuth(req,{database,bootstrapProfile:true});
      if (!populated.ok) return res.status(populated.status).json({error:populated.error});
    }
    const auth = authorize(req);
    if (!auth.ok) return res.status(auth.status).json({error:auth.error});
    if (!UUID.test(auth.user.id)) return res.status(401).json({error:"Marketplace account is not configured"});
    if (!database) return res.status(503).json({error:"Service requests are temporarily unavailable"});
    const limited = rateLimit(req,{scope:"service-requests",limit:req.method==="POST"||req.method==="PATCH"?5:30,windowMs:60000});
    if (!limited.ok) { res.setHeader("Retry-After",String(limited.retryAfterSec)); return res.status(limited.status).json({error:limited.error}); }

    try {
      if (req.method === "GET") {
        const providerCheck = await database.query(
          "SELECT status FROM public.service_provider_profiles WHERE provider_id = $1::uuid LIMIT 1",
          [auth.user.id],
        );
        const isApprovedProvider = providerCheck.rows?.[0]?.status === "approved";
        const column = isApprovedProvider ? "provider_id" : "customer_id";
        const result = await database.query(
          `SELECT id, service_type, description, city, state,
                  preferred_date, status, quoted_amount_kobo, created_at, updated_at
           FROM public.service_requests WHERE ${column} = $1::uuid
           ORDER BY created_at DESC LIMIT 50`,
          [auth.user.id],
        );
        return res.status(200).json({items:result.rows||[]});
      }
      if (req.method === "PATCH") {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const requestId = typeof body.request_id === "string" ? body.request_id : "";
        const action = body.action;
        if (!UUID.test(requestId) || !["quote","accept","cancel"].includes(action)) {
          return res.status(400).json({error:"Choose a valid service request and action"});
        }
        if (action === "quote") {
          const provider = await database.query(
            "SELECT provider_id FROM public.service_provider_profiles WHERE provider_id=$1::uuid AND status='approved' AND is_accepting_requests=true",
            [auth.user.id],
          );
          if (!provider.rows?.length) return res.status(403).json({error:"Only approved providers accepting requests can send quotes"});
          const amount = Number(body.amount_naira);
          if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000000) {
            return res.status(400).json({error:"Enter a valid quote amount in naira"});
          }
          const result = await database.query(
            `UPDATE public.service_requests
             SET quoted_amount_kobo=$3::bigint,status='quoted',updated_at=now()
             WHERE id=$1::uuid AND provider_id=$2::uuid AND status IN ('requested','quoted')
             RETURNING id,status,quoted_amount_kobo,updated_at`,
            [requestId,auth.user.id,amount*100],
          );
          if (!result.rows?.length) return res.status(404).json({error:"This request is not assigned to your provider account"});
          return res.status(200).json({request:result.rows[0],message:"Your quote has been sent to the customer."});
        }
        if (action === "accept") {
          const result = await database.query(
            `UPDATE public.service_requests SET status='accepted',updated_at=now()
             WHERE id=$1::uuid AND customer_id=$2::uuid AND status='quoted'
             RETURNING id,status,quoted_amount_kobo,updated_at`,
            [requestId,auth.user.id],
          );
          if (!result.rows?.length) return res.status(404).json({error:"No quoted request was found for your account"});
          return res.status(200).json({request:result.rows[0],message:"Quote accepted. Contact the provider to confirm the schedule."});
        }
        const result = await database.query(
          `UPDATE public.service_requests SET status='cancelled',updated_at=now()
           WHERE id=$1::uuid AND customer_id=$2::uuid AND status IN ('requested','quoted')
           RETURNING id,status,updated_at`,
          [requestId,auth.user.id],
        );
        if (!result.rows?.length) return res.status(404).json({error:"This request cannot be cancelled"});
        return res.status(200).json({request:result.rows[0],message:"Service request cancelled."});
      }
      if (req.method !== "POST") { res.setHeader("Allow","GET, POST, PATCH"); return res.status(405).json({error:"Method not allowed"}); }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const type = typeof body.service_type === "string" ? body.service_type : "decluttering";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const city = typeof body.city === "string" ? body.city.trim() : "";
      const state = typeof body.state === "string" ? body.state.trim() : "";
      const date = body.preferred_date == null || body.preferred_date === "" ? null : body.preferred_date;
      const providerId = body.provider_id == null || body.provider_id === "" ? null : body.provider_id;
      if (!TYPES.has(type) || description.length < 10 || description.length > 3000 ||
          !city || city.length > 100 || !state || state.length > 100 ||
          (date !== null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+"T00:00:00Z"))) ||
          (providerId !== null && (typeof providerId !== "string" || !UUID.test(providerId) || providerId === auth.user.id))) {
        return res.status(400).json({error:"Provide a service type, a description of at least 10 characters, city and state. Preferred date is optional."});
      }
      if (providerId) {
        const eligible = await database.query(
          "SELECT provider_id FROM public.service_provider_profiles WHERE provider_id=$1::uuid AND status='approved' AND is_accepting_requests=true",
          [providerId],
        );
        if (!eligible.rows?.length) return res.status(400).json({error:"That service provider is not currently accepting enquiries"});
      }
      const result = await database.query(
        `INSERT INTO public.service_requests (customer_id,provider_id,service_type,description,city,state,preferred_date)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::date)
         RETURNING id,provider_id,service_type,description,city,state,preferred_date,status,created_at`,
        [auth.user.id,providerId,type,description,city,state,date],
      );
      return res.status(201).json({request:result.rows?.[0]||null,message:"Your service enquiry has been sent to Aloko. We’ll connect you with a suitable provider."});
    } catch {
      return res.status(500).json({error:"Could not process service request"});
    }
  };
}

export default createServiceRequestsHandler();
