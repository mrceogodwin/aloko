import { createAuthClient } from "@neon/neon-js/auth";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;

export const authClient = authUrl ? createAuthClient(authUrl) : null;

export async function getAuthSession() {
  if (!authClient) return null;
  const result = await authClient.getSession();
  if (result.error) throw new Error(result.error.message || "Could not restore session");
  return result.data || null;
}

export async function signUpWithEmail({ email, password, name }) {
  if (!authClient) throw new Error("Authentication is not configured");
  const result = await authClient.signUp.email({ email, password, name });
  if (result.error) throw new Error(result.error.message || "Could not create account");
  return result.data;
}

export async function signInWithEmail({ email, password }) {
  if (!authClient) throw new Error("Authentication is not configured");
  const result = await authClient.signIn.email({ email, password });
  if (result.error) throw new Error(result.error.message || "Could not sign in");
  return result.data;
}

export async function signOutFromAloko() {
  if (!authClient) return;
  const result = await authClient.signOut();
  if (result.error) throw new Error(result.error.message || "Could not sign out");
}
