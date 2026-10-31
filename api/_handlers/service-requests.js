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
                  preferred_date, status, quoted_amount_kobo, proposed_start, proposed_end, created_at, updated_at
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
        if (!UUID.test(requestId) || !["quote","accept","cancel","propose_schedule","confirm_schedule"].includes(action)) {
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
        if (action === "propose_schedule") {
          const provider = await database.query(
            "SELECT provider_id FROM public.service_provider_profiles WHERE provider_id=$1::uuid AND status='approved' AND is_accepting_requests=true",
            [auth.user.id],
          );
          if (!provider.rows?.length) return res.status(403).json({error:"Only approved providers accepting requests can propose a schedule"});
          const start = typeof body.scheduled_start === "string" ? new Date(body.scheduled_start) : null;
          const end = typeof body.scheduled_end === "string" ? new Date(body.scheduled_end) : null;
          if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ||
              start.getTime() <= Date.now() || end.getTime() <= start.getTime() ||
              end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) {
            return res.status(400).json({error:"Choose a future appointment window no longer than 24 hours"});
          }
          if ((start.toISOString().slice(0,10)!==end.toISOString().slice(0,10)) ||
              start.getTime()<=Date.now()) return res.status(400).json({error:"Appointment must start in the future and finish on the same calendar day"});
          const result = await database.query(
            `UPDATE public.service_requests sr SET proposed_start=$3::timestamptz,proposed_end=$4::timestamptz,
                    status='accepted',updated_at=now()
             WHERE sr.id=$1::uuid AND sr.provider_id=$2::uuid AND sr.status='accepted'
               AND EXISTS (
                 SELECT 1 FROM public.service_provider_profiles p
                 WHERE p.provider_id=sr.provider_id AND p.status='approved' AND p.is_accepting_requests=true
                   AND (
                     EXISTS (
                       SELECT 1 FROM public.service_provider_availability_exceptions e
                       WHERE e.provider_id=p.provider_id
                         AND e.exception_date=($3::timestamptz AT TIME ZONE COALESCE(
                           (SELECT a.timezone FROM public.service_provider_availability a WHERE a.provider_id=p.provider_id LIMIT 1),
                           'Africa/Lagos'))::date
                         AND e.is_available=true
                         AND ($3::timestamptz AT TIME ZONE COALESCE((SELECT a.timezone FROM public.service_provider_availability a WHERE a.provider_id=p.provider_id LIMIT 1),'Africa/Lagos'))::time >= e.starts_at
                         AND ($4::timestamptz AT TIME ZONE COALESCE((SELECT a.timezone FROM public.service_provider_availability a WHERE a.provider_id=p.provider_id LIMIT 1),'Africa/Lagos'))::time <= e.ends_at
                     )
                     OR (
                       NOT EXISTS (
                         SELECT 1 FROM public.service_provider_availability_exceptions e
                         WHERE e.provider_id=p.provider_id
                           AND e.exception_date=($3::timestamptz AT TIME ZONE COALESCE(
                             (SELECT a.timezone FROM public.service_provider_availability a WHERE a.provider_id=p.provider_id LIMIT 1),
                             'Africa/Lagos'))::date
                       )
                       AND EXISTS (
                         SELECT 1 FROM public.service_provider_availability a
                         WHERE a.provider_id=p.provider_id AND a.is_active=true
                           AND a.weekday=EXTRACT(DOW FROM ($3::timestamptz AT TIME ZONE a.timezone))::int
                           AND ($3::timestamptz AT TIME ZONE a.timezone)::date=($4::timestamptz AT TIME ZONE a.timezone)::date
                           AND ($3::timestamptz AT TIME ZONE a.timezone)::time >= a.starts_at
                           AND ($4::timestamptz AT TIME ZONE a.timezone)::time <= a.ends_at
                       )
                     )
                   )
               )
             RETURNING sr.id,sr.status,sr.proposed_start,sr.proposed_end,sr.updated_at`,
            [requestId,auth.user.id,start.toISOString(),end.toISOString()],
          );
          if (!result.rows?.length) return res.status(409).json({error:"That appointment falls outside your saved availability or on a day off. Update availability or choose another time."});
          return res.status(200).json({request:result.rows[0],message:"Appointment time proposed. The customer must confirm it."});
        }
        if (action === "confirm_schedule") {
          const result = await database.query(
            `UPDATE public.service_requests SET status='scheduled',updated_at=now()
             WHERE id=$1::uuid AND customer_id=$2::uuid AND status='accepted'
               AND proposed_start IS NOT NULL AND proposed_end IS NOT NULL
             RETURNING id,status,proposed_start,proposed_end,updated_at`,
            [requestId,auth.user.id],
          );
          if (!result.rows?.length) return res.status(409).json({error:"There is no appointment proposal to confirm"});
          return res.status(200).json({request:result.rows[0],message:"Appointment confirmed."});
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
          (date !== null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+"T00:00:00Z")))) ||
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
