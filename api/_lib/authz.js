const STAFF_ROLES = new Set(["moderator", "admin"]);

export function getAuthenticatedUser(req) {
  // Authentication middleware/provider adapter must set this server-side.
  // Never trust user IDs or roles supplied in query strings or request bodies.
  const user = req?.auth?.user;
  if (!user || typeof user.id !== "string" || !user.id.trim()) return null;
  if (typeof user.role !== "string") return null;
  return {
    id: user.id,
    role: user.role,
    suspended: user.suspended === true,
  };
}

export function authorize(req, allowedRoles = []) {
  const user = getAuthenticatedUser(req);
  if (!user) return { ok: false, status: 401, error: "Authentication required" };
  if (user.suspended) return { ok: false, status: 403, error: "Account is suspended" };
  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    return { ok: false, status: 403, error: "Insufficient permissions" };
  }
  return { ok: true, user };
}

export function authorizeStaff(req, allowedRoles = ["moderator", "admin"]) {
  const result = authorize(req, allowedRoles);
  if (!result.ok) return result;
  if (!STAFF_ROLES.has(result.user.role)) {
    return { ok: false, status: 403, error: "Staff access required" };
  }
  return result;
}
