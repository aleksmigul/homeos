import type { CreateTravelPlanInput, TravelPlan, TravelPlanSummary, TravelRow, UpdateTravelRowInput } from "@homeos/shared";

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

