import type { CreateTravelPlanInput, TravelPlan, TravelPlanSummary, TravelRow, UpdateTravelRowInput } from "@homeos/shared";

export type AuthUser = { email: string; name: string; picture?: string };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getAuthConfig() {
  return request<{ googleClientId: string }>("/api/auth/config");
}

export async function getCurrentUser() {
  return request<{ user: AuthUser }>("/api/auth/me");
}

export async function signInWithGoogle(credential: string) {
  return request<{ user: AuthUser }>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential })
  });
}

export async function logout() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Sign out failed");
}

export async function listTravelPlans() {
  return request<{ travelPlans: TravelPlanSummary[] }>("/api/travel-plans");
}

export async function createTravelPlan(input: CreateTravelPlanInput) {
  return request<{ travelPlan: TravelPlan }>("/api/travel-plans", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getTravelPlan(id: string) {
  return request<{ travelPlan: TravelPlan }>(`/api/travel-plans/${id}`);
}

export async function updateTravelRow(id: string, input: UpdateTravelRowInput) {
  return request<{ travelRow: TravelRow }>(`/api/travel-rows/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}
