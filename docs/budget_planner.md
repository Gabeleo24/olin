# Budget Planner Blueprint

## Objective
Give students and families a realistic total cost projection by combining academic expenses (tuition/net price, housing) with local living costs (rent, food, transit, insurance). The planner should allow different living scenarios (on/off campus, roommates, meal plans) and produce both annual and monthly estimates.

## Data Inputs
- **Academic**
  - `avg_net_price`, `in_state_tuition`, `out_state_tuition`, `avg_cost_of_attendance` (from `programs` / `schools` tables)
- **Housing & Living**
  - `location_costs` table: `rent_small`, `rent_large`, `meal_cost`, `transit_monthly`, `cost_index`, `rent_index`, etc.
  - Derived defaults (e.g., utilities %, books/supplies portion, insurance multipliers)

## Scenario Controls
| Control | Options | Notes |
| --- | --- | --- |
| Residency | In-State / Out-of-State | toggles tuition + COA |
| Housing | On-campus / Off-campus (1BR) / Off-campus (Shared) | Off-campus uses rent_small/roommates |
| Roommates | 1-4 | divides rent_small or rent_large |
| Meal Plan | Campus meal plan / Self-cook / Eating out | uses meal_cost + groceries index |
| Transit | Public transit / Own car | transit_monthly vs car estimates |
| Insurance/Other | slider or flat % | factor on top of total |

## Calculations
1. **Base Tuition** = `in_state_tuition` or `out_state_tuition` (fallback to `avg_net_price` if missing).
2. **Housing**:
   - On-campus: use `avg_cost_of_attendance` room/board delta or `rent_small` equivalent.
   - Off-campus single: `rent_small`.
   - Off-campus shared: `rent_small / roommates`.
3. **Food**:
   - Meal plan: portion of COA room/board.
   - Self-cook: `meal_cost * 30` or groceries index multiplier.
4. **Transit**:
   - Public: `transit_monthly`.
   - Car: (gas + insurance placeholder) based on cost index.
5. **Misc**: Books, healthcare, personal—use percentages of COA or indexes.
6. **Total Annual** = Tuition + Housing + Food + Transit + Misc.
7. **Monthly** = Annual / 12.

## API Updates Needed
- Optionally extend `/programs/{id}` to include precomputed annual budget scenarios.
- Or add `/budget/estimate` endpoint that accepts program_id + scenario inputs and returns totals.

## UI Sketch
1. **Scenario Form** (dropdowns/sliders for controls)
2. **Summary Cards** (Annual Total, Monthly Total)
3. **Breakdown Chart** (stacked bar: tuition vs housing vs food vs transit vs misc)
4. **Tips** (call to action: “Apply for aid”, “Explore cheaper housing”)

## Next Steps
1. Implement calculation helpers (TypeScript utility or API route).
2. Extend dashboard to include Budget Planner section under Program Detail.
3. Add export/share (PDF or CSV) for families.

# Budget Planner UI

The dashboard now includes a "Budget Planner" card that lets students mix tuition/net price data with local cost-of-living metrics to estimate a realistic annual budget.

## Data Inputs
- **Program detail** (`/programs/{id}`): net price (`avg_net_price`), cost-of-attendance, tuition figures.
- **Cost-of-living record** (`/locations/cost`): rent estimates (`rent_small`, `rent_large`), meal cost, transit pass, cost indexes.
- **User controls**: housing type (on/off campus), roommates, meal plan vs cooking, transportation mode.

## Derived Numbers
- Rent is scaled by roommates or discounted for on-campus living.
- Food budget switches between meal-plan (restaurant cost) and grocery-based estimates.
- Transportation toggles between public-transit pass and generic car ownership cost.
- Miscellaneous allowance (default \$180/month) covers utilities, insurance, incidentals.
- Monthly totals are annualized and added to the program’s tuition/net-price figure for a headline “Estimated Annual Cost”.

## How to Use
1. Select a program in the Program Explorer table.
2. Adjust the sliders/dropdowns in the Budget Planner card to match your living situation.
3. Review the monthly category breakdown and the combined annual total (tuition + living).
4. Use the figures when counseling students/parents or exporting reports.

The planner is intentionally transparent and conservative; feel free to tweak the misc allowance or conversion factors in `client/src/pages/Dashboard.tsx` if you have school-specific assumptions.


