export type PlanId = "starter_9" | "growth_15"

export type PlanConfig = {
  id: PlanId
  name: string
  price: string
  maxKeywords: number
  trialDays: number
  description: string
}

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {
  starter_9: {
    id: "starter_9",
    name: "Starter",
    price: "$5/month",
    maxKeywords: 7,
    trialDays: 5,
    description: "For solo founders tracking core keywords with dashboard updates.",
  },
  growth_15: {
    id: "growth_15",
    name: "Pro",
    price: "$9/month",
    maxKeywords: 35,
    trialDays: 5,
    description: "For teams tracking larger keyword sets with Slack alerts and faster refresh.",
  },
}

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === "starter_9" || value === "growth_15"
}
