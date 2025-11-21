import { ProgramDetail, LocationCostRecord } from './api';

export type ResidencyOption = 'in_state' | 'out_of_state';
export type HousingOption = 'on_campus' | 'off_single' | 'off_shared';
export type MealOption = 'campus' | 'self_cook' | 'restaurants';
export type TransitOption = 'public' | 'car';

export interface BudgetScenario {
  residency: ResidencyOption;
  housing: HousingOption;
  roommates: number;
  mealPlan: MealOption;
  transit: TransitOption;
  miscPercent: number; // percentage applied to subtotal
}

export interface BudgetBreakdown {
  tuition: number;
  housing: number;
  food: number;
  transit: number;
  misc: number;
  totalAnnual: number;
  totalMonthly: number;
}

export interface SavedScenario {
  id: string;
  name: string;
  scenario: BudgetScenario;
}

export const DEFAULT_SCENARIO: BudgetScenario = {
  residency: 'in_state',
  housing: 'on_campus',
  roommates: 2,
  mealPlan: 'self_cook',
  transit: 'public',
  miscPercent: 0.1,
};

export function estimateBudget(
  program: Pick<ProgramDetail, 'avg_net_price' | 'in_state_tuition' | 'out_state_tuition' | 'academic_year_cost' | 'program_year_cost' | 'state'>,
  scenario: BudgetScenario,
  cost?: LocationCostRecord,
): BudgetBreakdown {
  const tuition = getTuition(program, scenario);
  const housing = getHousing(program, scenario, cost);
  const food = getFoodCost(scenario, cost);
  const transit = getTransitCost(scenario, cost);
  const subtotal = tuition + housing + food + transit;
  const misc = subtotal * scenario.miscPercent;
  const totalAnnual = subtotal + misc;
  return {
    tuition,
    housing,
    food,
    transit,
    misc,
    totalAnnual,
    totalMonthly: totalAnnual / 12,
  };
}

function getTuition(program: Pick<ProgramDetail, 'avg_net_price' | 'in_state_tuition' | 'out_state_tuition'>, scenario: BudgetScenario): number {
  if (scenario.residency === 'in_state') {
    return cleanNumber(program.in_state_tuition, program.avg_net_price);
  }
  return cleanNumber(program.out_state_tuition, program.avg_net_price);
}

function getHousing(
  program: Pick<ProgramDetail, 'academic_year_cost' | 'program_year_cost' | 'avg_net_price'>,
  scenario: BudgetScenario,
  cost?: LocationCostRecord,
): number {
  const rentSingle = annualize(cost?.rent_small ?? 1600);
  const rentLarge = annualize(cost?.rent_large ?? 3000);
  switch (scenario.housing) {
    case 'on_campus': {
      const coa = program.academic_year_cost ?? program.program_year_cost;
      if (coa && coa > 0) {
        const housingAssumption = coa * 0.4; // treat ~40% of COA as room/board
        return housingAssumption;
      }
      return rentSingle;
    }
    case 'off_single':
      return rentSingle;
    case 'off_shared':
      return rentLarge / Math.max(scenario.roommates, 1);
    default:
      return rentSingle;
  }
}

function getFoodCost(scenario: BudgetScenario, cost?: LocationCostRecord): number {
  const mealBase = (cost?.meal_cost ?? 18) * 30 * 12; // 30 meals per month
  const groceriesBase = annualize((cost?.groceries_index ?? 60) / 60 * 400); // scale around $400/month baseline
  switch (scenario.mealPlan) {
    case 'campus':
      return 4500;
    case 'restaurants':
      return mealBase;
    case 'self_cook':
    default:
      return groceriesBase;
  }
}

function getTransitCost(scenario: BudgetScenario, cost?: LocationCostRecord): number {
  if (scenario.transit === 'public') {
    return annualize(cost?.transit_monthly ?? 100);
  }
  // rough car ownership estimate (insurance + fuel + maintenance)
  const insurance = 1200;
  const fuel = 1800;
  const maintenance = 800;
  return insurance + fuel + maintenance;
}

function annualize(monthly: number): number {
  return monthly * 12;
}

function cleanNumber(primary?: number | null, fallback?: number | null): number {
  if (primary !== undefined && primary !== null && !Number.isNaN(primary)) {
    return primary;
  }
  if (fallback !== undefined && fallback !== null && !Number.isNaN(fallback)) {
    return fallback;
  }
  return 0;
}

export function cloneScenario(scenario: BudgetScenario): BudgetScenario {
  return { ...scenario };
}

export function createSavedScenario(name: string, scenario: BudgetScenario): SavedScenario {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return { id, name: name.trim() || 'Custom Scenario', scenario: cloneScenario(scenario) };
}

export const DEFAULT_SAVED_SCENARIOS: SavedScenario[] = [
  {
    id: 'student-baseline',
    name: 'Student Baseline (Shared In-State)',
    scenario: {
      residency: 'in_state',
      housing: 'off_shared',
      roommates: 3,
      mealPlan: 'self_cook',
      transit: 'public',
      miscPercent: 0.08,
    },
  },
  {
    id: 'parent-support',
    name: 'Parent Support (Out-of-State Solo)',
    scenario: {
      residency: 'out_of_state',
      housing: 'off_single',
      roommates: 1,
      mealPlan: 'restaurants',
      transit: 'car',
      miscPercent: 0.15,
    },
  },
];

export function formatBudgetSummary(
  program: ProgramDetail,
  scenario: BudgetScenario,
  breakdown: BudgetBreakdown,
  comparisonLabel?: string,
): string {
  const lines = [
    `Budget Scenario${comparisonLabel ? ` (${comparisonLabel})` : ''}`,
    `Program: ${program.program_title} (${program.school_name})`,
    `Location: ${[program.city, program.state].filter(Boolean).join(', ')}`,
    `Residency: ${scenario.residency === 'in_state' ? 'In-State' : 'Out-of-State'}`,
    `Housing: ${scenario.housing} (${scenario.roommates} roommates)`,
    `Meals: ${scenario.mealPlan}`,
    `Transit: ${scenario.transit}`,
    '',
    `Tuition & Fees: $${Math.round(breakdown.tuition).toLocaleString()}`,
    `Housing: $${Math.round(breakdown.housing).toLocaleString()}`,
    `Food: $${Math.round(breakdown.food).toLocaleString()}`,
    `Transit: $${Math.round(breakdown.transit).toLocaleString()}`,
    `Misc (${Math.round(scenario.miscPercent * 100)}%): $${Math.round(breakdown.misc).toLocaleString()}`,
    `Total Annual Cost: $${Math.round(breakdown.totalAnnual).toLocaleString()}`,
    `≈ $${Math.round(breakdown.totalMonthly).toLocaleString()}/month`,
  ];
  return lines.join('\n');
}


