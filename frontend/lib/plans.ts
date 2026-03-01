export type PlanId = "starter_9" | "growth_15"

export type PlanConfig = {
  id: PlanId
  name: string
  price: string
  maxBrands: number | null
  maxKeywords: number
  trialDays: number
  description: string
}

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {
  starter_9: {
    id: "starter_9",
    name: "Starter",
    price: "$5/month",
    maxBrands: 1,
    maxKeywords: 7,
    trialDays: 2,
    description: "For solo founders tracking one brand with dashboard updates.",
  },
  growth_15: {
    id: "growth_15",
    name: "Pro",
    price: "$9/month",
    maxBrands: null,
    maxKeywords: 35,
    trialDays: 2,
    description: "For teams tracking multiple brands with Slack alerts and faster refresh.",
  },
}

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === "starter_9" || value === "growth_15"
}
