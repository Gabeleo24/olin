import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ProgramFilters,
  ProgramRecord,
  ProgramDetail,
  CityProfile,
  StateProfile,
  SchoolDetail,
  LocationCostRecord,
  fetchPrograms,
  fetchCityProfiles,
  fetchStateProfiles,
  fetchProgramDetail,
  fetchSchoolDetail,
  fetchCostOfLiving,
  fetchNearbyLocations,
} from '../lib/api';
import {
  BudgetScenario,
  BudgetBreakdown,
  DEFAULT_SCENARIO,
  DEFAULT_SAVED_SCENARIOS,
  SavedScenario,
  cloneScenario,
  createSavedScenario,
  estimateBudget,
  formatBudgetSummary,
  ResidencyOption,
  HousingOption,
  MealOption,
  TransitOption,
} from '../lib/budget';

const CREDENTIAL_MAP: Record<number, string> = {
  1: "Undergraduate Certificate",
  2: "Associate's Degree",
  3: "Bachelor's Degree",
  4: 'Post-baccalaureate Certificate',
  5: "Master's Degree",
  6: "Doctoral Degree",
  7: 'First Professional Degree',
};

const REGION_MAP: Record<number, string> = {
  1: 'New England',
  2: 'Mid East',
  3: 'Great Lakes',
  4: 'Plains',
  5: 'Southeast',
  6: 'Southwest',
  7: 'Rocky Mountains',
  8: 'Far West',
  9: 'Outlying Areas',
};

type SelectOption = { value: string; label: string };

const credentialOptions: SelectOption[] = [{ label: 'All credentials', value: '' }].concat(
  Object.entries(CREDENTIAL_MAP).map(([value, label]) => ({ value, label })),
);

const regionOptions: SelectOption[] = [{ label: 'All regions', value: '' }].concat(
  Object.entries(REGION_MAP).map(([value, label]) => ({ value, label: `${label} (${value})` })),
);

type FormFilters = {
  cipPrefix: string;
  credential: string;
  regionId: string;
  state: string;
  maxNetPrice: string;
  nearLat: string;
  nearLon: string;
  nearRadius: string;
};

const initialForm: FormFilters = {
  cipPrefix: '',
  credential: '',
  regionId: '',
  state: '',
  maxNetPrice: '',
  nearLat: '',
  nearLon: '',
  nearRadius: '50',
};

const SCENARIO_STORAGE_KEY = 'budget_scenarios_v1';

export default function Dashboard() {
  const sanitizeScenario = (scenario?: Partial<BudgetScenario>): BudgetScenario => {
    const roommates = typeof scenario?.roommates === 'number' ? scenario.roommates : DEFAULT_SCENARIO.roommates;
    return {
      residency: scenario?.residency === 'out_of_state' ? 'out_of_state' : 'in_state',
      housing: (scenario?.housing as HousingOption) ?? DEFAULT_SCENARIO.housing,
      roommates: Math.max(1, Math.min(6, roommates)),
      mealPlan: (scenario?.mealPlan as MealOption) ?? DEFAULT_SCENARIO.mealPlan,
      transit: (scenario?.transit as TransitOption) ?? DEFAULT_SCENARIO.transit,
      miscPercent:
        typeof scenario?.miscPercent === 'number' && scenario.miscPercent >= 0 ? scenario.miscPercent : DEFAULT_SCENARIO.miscPercent,
    };
  };

  const defaultSavedList = DEFAULT_SAVED_SCENARIOS.map((item) => ({
    ...item,
    scenario: sanitizeScenario(item.scenario),
  }));

  const loadSavedScenarios = (): SavedScenario[] => {
    if (typeof window === 'undefined') {
      return defaultSavedList;
    }
    try {
      const raw = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item) => item && typeof item.name === 'string' && item.scenario)
            .map((item) => ({
              id: item.id || `${item.name}-${Date.now()}`,
              name: item.name,
              scenario: sanitizeScenario(item.scenario),
            }));
        }
      }
    } catch (error) {
      console.warn('Failed to load saved scenarios:', error);
    }
    return defaultSavedList;
  };

  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [programCount, setProgramCount] = useState(0);
  const [programFilters, setProgramFilters] = useState<ProgramFilters>({ limit: 25 });
  const [formFilters, setFormFilters] = useState<FormFilters>(initialForm);
  const [programLoading, setProgramLoading] = useState(false);
  const [programError, setProgramError] = useState<string | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [programDetail, setProgramDetail] = useState<ProgramDetail | null>(null);
  const [programDetailLoading, setProgramDetailLoading] = useState(false);
  const [programDetailError, setProgramDetailError] = useState<string | null>(null);
  const [schoolDetail, setSchoolDetail] = useState<SchoolDetail | null>(null);
  const [schoolDetailLoading, setSchoolDetailLoading] = useState(false);
  const [schoolDetailError, setSchoolDetailError] = useState<string | null>(null);
  const [costRecords, setCostRecords] = useState<LocationCostRecord[]>([]);
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);
  const primaryCostRecord = costRecords[0];
  const costSourceLabel = primaryCostRecord?.source ?? 'teleport';
  const costSourceDescription =
    costSourceLabel === 'teleport'
      ? 'Live Teleport data'
      : costSourceLabel === 'synthetic_territory'
      ? 'Regional synthetic estimate'
      : 'Fallback estimate';
  const isFallbackCost = costSourceLabel !== 'teleport';
  const [budgetScenario, setBudgetScenario] = useState<BudgetScenario>(DEFAULT_SCENARIO);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => loadSavedScenarios());
  const [scenarioNameInput, setScenarioNameInput] = useState('');
  const [comparisonScenarioId, setComparisonScenarioId] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [stateProfiles, setStateProfiles] = useState<StateProfile[]>([]);
  const [cityProfiles, setCityProfiles] = useState<CityProfile[]>([]);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [nearbyLocations, setNearbyLocations] = useState<LocationCostRecord[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(savedScenarios));
    }
  }, [savedScenarios]);

  useEffect(() => {
    let cancelled = false;
    setProgramLoading(true);
    setProgramError(null);
    fetchPrograms(programFilters)
      .then((resp) => {
        if (cancelled) return;
        setPrograms(resp.results);
        setProgramCount(resp.count);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setProgramError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setProgramLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [programFilters]);

  useEffect(() => {
    let cancelled = false;
    setLocationLoading(true);
    setLocationError(null);
    Promise.all([fetchStateProfiles(), fetchCityProfiles({ limit: 1000 })])
      .then(([statesResp, citiesResp]) => {
        if (cancelled) return;
        setStateProfiles(statesResp.results);
        setCityProfiles(citiesResp.results);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLocationError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLocationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (programs.length === 0) {
      setSelectedProgramId(null);
      setProgramDetail(null);
      setSchoolDetail(null);
      return;
    }
    if (!selectedProgramId || !programs.some((p) => p.program_id === selectedProgramId)) {
      setSelectedProgramId(programs[0].program_id);
    }
  }, [programs, selectedProgramId]);

  useEffect(() => {
    if (selectedProgramId == null) {
      setProgramDetail(null);
      setSchoolDetail(null);
      return;
    }
    setProgramDetailLoading(true);
    setProgramDetailError(null);
    fetchProgramDetail(selectedProgramId)
      .then((detail) => setProgramDetail(detail))
      .catch((err: Error) => {
        setProgramDetailError(err.message);
        setProgramDetail(null);
      })
      .finally(() => setProgramDetailLoading(false));
  }, [selectedProgramId]);

  useEffect(() => {
    if (!programDetail?.unit_id) {
      setSchoolDetail(null);
      setCostRecords([]);
      return;
    }
    setSchoolDetailLoading(true);
    setSchoolDetailError(null);
    fetchSchoolDetail(programDetail.unit_id, { programLimit: 8 })
      .then((detail) => setSchoolDetail(detail))
      .catch((err: Error) => {
        setSchoolDetailError(err.message);
        setSchoolDetail(null);
      })
      .finally(() => setSchoolDetailLoading(false));
  }, [programDetail?.unit_id]);

  useEffect(() => {
    if (!programDetail?.city) {
      setCostRecords([]);
      return;
    }
    setCostLoading(true);
    setCostError(null);
    fetchCostOfLiving({
      city: programDetail.city,
      state: programDetail.state ?? undefined,
      limit: 1,
    })
      .then((resp) => {
        setCostRecords(resp.results);
      })
      .catch((err: Error) => {
        setCostError(err.message);
        setCostRecords([]);
      })
      .finally(() => setCostLoading(false));
  }, [programDetail?.city, programDetail?.state]);

  useEffect(() => {
    if (programFilters.nearLat === undefined || programFilters.nearLon === undefined) {
      setNearbyLocations([]);
      setNearbyError(null);
      return;
    }
    setNearbyLoading(true);
    setNearbyError(null);
    fetchNearbyLocations({
      lat: programFilters.nearLat,
      lon: programFilters.nearLon,
      radiusMiles: programFilters.nearRadiusMiles ?? 50,
      limit: 6,
    })
      .then((resp) => setNearbyLocations(resp.results))
      .catch((err: Error) => {
        setNearbyError(err.message);
        setNearbyLocations([]);
      })
      .finally(() => setNearbyLoading(false));
  }, [programFilters.nearLat, programFilters.nearLon, programFilters.nearRadiusMiles]);

  const budgetEstimate = useMemo(() => {
    if (!programDetail) return null;
    return estimateBudget(programDetail, budgetScenario, costRecords[0]);
  }, [programDetail, budgetScenario, costRecords]);

  const comparisonScenario = useMemo(() => {
    if (!comparisonScenarioId) return null;
    return savedScenarios.find((scenario) => scenario.id === comparisonScenarioId) ?? null;
  }, [savedScenarios, comparisonScenarioId]);

  const comparisonEstimate = useMemo(() => {
    if (!programDetail || !comparisonScenario) return null;
    return estimateBudget(programDetail, comparisonScenario.scenario, costRecords[0]);
  }, [programDetail, comparisonScenario, costRecords]);

  const scenarioSummaryText = useMemo(() => {
    if (!programDetail || !budgetEstimate) return '';
    const sections = [
      formatBudgetSummary(programDetail, budgetScenario, budgetEstimate, 'Primary'),
    ];
    if (comparisonScenario && comparisonEstimate) {
      sections.push(
        formatBudgetSummary(
          programDetail,
          comparisonScenario.scenario,
          comparisonEstimate,
          comparisonScenario.name,
        ),
      );
    }
    return sections.join('\n\n');
  }, [programDetail, budgetScenario, budgetEstimate, comparisonScenario, comparisonEstimate]);

  const updateScenario = (updates: Partial<BudgetScenario>) => {
    setBudgetScenario((prev) => ({ ...prev, ...updates }));
  };

  const handleSaveScenario = () => {
    const newScenario = createSavedScenario(scenarioNameInput || 'Custom Scenario', budgetScenario);
    setSavedScenarios((prev) => [...prev, newScenario]);
    setScenarioNameInput('');
  };

  const handleLoadScenario = (id: string) => {
    const saved = savedScenarios.find((scenario) => scenario.id === id);
    if (saved) {
      setBudgetScenario(cloneScenario(saved.scenario));
    }
  };

  const handleDeleteScenario = (id: string) => {
    setSavedScenarios((prev) => prev.filter((scenario) => scenario.id !== id));
    if (comparisonScenarioId === id) {
      setComparisonScenarioId(null);
    }
  };

  const toggleComparisonScenario = (id: string) => {
    setComparisonScenarioId((current) => (current === id ? null : id));
  };

  const handleResetScenario = () => {
    setBudgetScenario(DEFAULT_SCENARIO);
  };

  const stateOptions = useMemo(() => {
    const unique = new Set<string>();
    stateProfiles.forEach((profile) => {
      if (profile.state) unique.add(profile.state);
    });
    return [''].concat(Array.from(unique).sort());
  }, [stateProfiles]);

  const affordableStates = useMemo(() => {
    return [...stateProfiles]
      .filter((state) => state.avg_net_price !== null)
      .sort((a, b) => (a.avg_net_price ?? Infinity) - (b.avg_net_price ?? Infinity))
      .slice(0, 6);
  }, [stateProfiles]);

  const costlyCities = useMemo(() => {
    return [...cityProfiles]
      .filter((city) => city.avg_net_price !== null)
      .sort((a, b) => (b.avg_net_price ?? -Infinity) - (a.avg_net_price ?? -Infinity))
      .slice(0, 6);
  }, [cityProfiles]);

  const topMetros = useMemo(() => {
    return [...cityProfiles]
      .filter((city) => city.avg_net_price !== null && city.program_count > 0)
      .sort((a, b) => (a.avg_net_price ?? Infinity) - (b.avg_net_price ?? Infinity))
      .slice(0, 4);
  }, [cityProfiles]);

  const handleFilterChange = (field: keyof FormFilters, value: string) => {
    setFormFilters((prev) => ({ ...prev, [field]: value }));
  };

  const buildFiltersFromForm = (): ProgramFilters => {
    const nextFilters: ProgramFilters = { limit: programFilters.limit ?? 50 };
    if (formFilters.cipPrefix.trim()) nextFilters.cipPrefix = formFilters.cipPrefix.trim();
    if (formFilters.credential) nextFilters.credential = Number(formFilters.credential);
    if (formFilters.regionId) nextFilters.regionId = Number(formFilters.regionId);
    if (formFilters.state) nextFilters.state = formFilters.state.toUpperCase();
    if (formFilters.maxNetPrice) nextFilters.maxNetPrice = Number(formFilters.maxNetPrice);
    if (formFilters.nearLat && formFilters.nearLon) {
      nextFilters.nearLat = Number(formFilters.nearLat);
      nextFilters.nearLon = Number(formFilters.nearLon);
      if (formFilters.nearRadius) {
        nextFilters.nearRadiusMiles = Number(formFilters.nearRadius);
      }
    }
    return nextFilters;
  };

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProgramFilters(buildFiltersFromForm());
  };

  const handleResetFilters = () => {
    setFormFilters(initialForm);
    setProgramFilters({ limit: programFilters.limit });
    setGeoStatus(null);
  };

  const handleSelectProgram = (program: ProgramRecord) => {
    setSelectedProgramId(program.program_id);
  };

  const showDistanceColumn = programFilters.nearLat !== undefined && programFilters.nearLon !== undefined;
  const programColumnCount = showDistanceColumn ? 8 : 7;

  const handleUseMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('Geolocation is not supported in this browser.');
      return;
    }
    setGeoStatus('Detecting location…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFormFilters((prev) => ({
          ...prev,
          nearLat: latitude.toFixed(4),
          nearLon: longitude.toFixed(4),
        }));
        setGeoStatus('Location detected. Click "Run Search" to update results.');
      },
      (error) => {
        setGeoStatus(error.message || 'Unable to retrieve location.');
      },
    );
  };

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto bg-gray-50 p-6">
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Program Explorer</h1>
            <p className="text-sm text-gray-500">Query every Title IV institution with live federal data.</p>
          </div>
          <div className="text-sm text-gray-500">
            Showing <span className="font-semibold text-indigo-600">{Math.min(programs.length, programCount)}</span> of{' '}
            <span className="font-semibold text-indigo-600">{programCount}</span> matches
          </div>
        </div>

        <form onSubmit={handleFilterSubmit} className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <FilterInput
            label="CIP Prefix"
            value={formFilters.cipPrefix}
            onChange={(value) => handleFilterChange('cipPrefix', value)}
            placeholder="e.g. 11.07"
          />
          <FilterSelect
            label="Credential"
            value={formFilters.credential}
            onChange={(value) => handleFilterChange('credential', value)}
            options={credentialOptions}
          />
          <FilterSelect
            label="Region"
            value={formFilters.regionId}
            onChange={(value) => handleFilterChange('regionId', value)}
            options={regionOptions}
          />
          <FilterSelect
            label="State"
            value={formFilters.state}
            onChange={(value) => handleFilterChange('state', value)}
            options={stateOptions.map((code) => ({ value: code, label: code || 'All states' }))}
          />
          <FilterInput
            label="Max Net Price"
            type="number"
            min={0}
            value={formFilters.maxNetPrice}
            onChange={(value) => handleFilterChange('maxNetPrice', value)}
            placeholder="USD"
          />
          <FilterInput
            label="Near Latitude"
            type="number"
            value={formFilters.nearLat}
            onChange={(value) => handleFilterChange('nearLat', value)}
            placeholder="e.g. 34.05"
          />
          <FilterInput
            label="Near Longitude"
            type="number"
            value={formFilters.nearLon}
            onChange={(value) => handleFilterChange('nearLon', value)}
            placeholder="-118.25"
          />
          <FilterInput
            label="Radius (miles)"
            type="number"
            min={5}
            value={formFilters.nearRadius}
            onChange={(value) => handleFilterChange('nearRadius', value)}
            placeholder="50"
          />
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
              disabled={programLoading}
            >
              {programLoading ? 'Searching…' : 'Run Search'}
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              disabled={programLoading}
            >
              Reset
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Nearby Search Tools</label>
            <button
              type="button"
              onClick={handleUseMyLocation}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Use My Location
            </button>
            {geoStatus && <p className="text-xs text-gray-500">{geoStatus}</p>}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Top Value Metros</h2>
            <p className="text-sm text-gray-500">
              Cities with the lowest average net price per program. Use them as starting points for exploration.
            </p>
          </div>
          {locationLoading && <span className="text-xs text-gray-400">Refreshing…</span>}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {topMetros.map((metro) => (
            <div key={`${metro.city}-${metro.state}`} className="rounded-xl border border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-900">
                {metro.city}, {metro.state}
              </p>
              <p className="text-xs text-gray-500">
                {metro.school_count} schools · {metro.program_count} programs
              </p>
              <p className="mt-2 text-lg font-bold text-emerald-600">{formatCurrency(metro.avg_net_price)}</p>
              <p className="text-xs text-gray-500">Avg net price</p>
            </div>
          ))}
          {!topMetros.length && !locationLoading && (
            <div className="rounded-xl border border-gray-100 p-4 text-sm text-gray-500">No metro data yet.</div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Top Matches</h2>
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Ordered by opportunity score
          </span>
        </div>
        {programError && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{programError}</p>}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Program</th>
                <th className="px-4 py-3">School</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Net Price</th>
                <th className="px-4 py-3">In-State</th>
                <th className="px-4 py-3">Out-of-State</th>
                <th className="px-4 py-3">Opportunity</th>
                {showDistanceColumn && <th className="px-4 py-3">Distance</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {programLoading && (
                <tr>
                  <td colSpan={programColumnCount} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading programs…
                  </td>
                </tr>
              )}
              {!programLoading && programs.length === 0 && (
                <tr>
                  <td colSpan={programColumnCount} className="px-4 py-6 text-center text-sm text-gray-500">
                    No results. Adjust your filters and try again.
                  </td>
                </tr>
              )}
              {!programLoading &&
                programs.map((program) => (
                  <tr
                    key={`${program.program_id}-${program.school_name}`}
                    onClick={() => handleSelectProgram(program)}
                    className={`cursor-pointer transition ${
                      program.program_id === selectedProgramId ? 'bg-indigo-50/60' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{program.program_title}</div>
                      <div className="text-xs text-gray-500">
                        {program.credential_name || CREDENTIAL_MAP[program.program_credential_level ?? 0] || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{program.school_name}</div>
                      <div className="text-xs text-gray-500">{REGION_MAP[program.region_id ?? 0] || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {[program.city, program.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-indigo-600">{formatCurrency(program.avg_net_price)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(program.in_state_tuition)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(program.out_state_tuition)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                        {formatScore(program.program_opportunity_score)}
                      </span>
                    </td>
                    {showDistanceColumn && (
                      <td className="px-4 py-3 text-gray-700">{formatMiles(program.distance_miles)}</td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <DetailCard
            title="Program Detail"
            loading={programDetailLoading}
            error={programDetailError}
            content={
              programDetail ? (
                <div className="space-y-4 text-sm text-gray-700">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{programDetail.program_title}</p>
                    <p className="text-xs text-gray-500">
                      {programDetail.credential_name ||
                        CREDENTIAL_MAP[programDetail.program_credential_level ?? 0] ||
                        '—'}
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <MetricBlock label="Avg Net Price" value={formatCurrency(programDetail.avg_net_price)} />
                    <MetricBlock label="In-State Tuition" value={formatCurrency(programDetail.in_state_tuition)} />
                    <MetricBlock label="Out-of-State Tuition" value={formatCurrency(programDetail.out_state_tuition)} />
                    <MetricBlock
                      label="Cost of Attendance"
                      value={formatCurrency(
                        programDetail.academic_year_cost || programDetail.program_year_cost,
                      )}
                    />
                    <MetricBlock label="Admission Rate" value={formatPercent(programDetail.admission_rate)} />
                    <MetricBlock label="Median Earnings (10 yr)" value={formatCurrency(programDetail.median_earnings_10yr)} />
                    <MetricBlock label="Pell Grant Rate" value={formatPercent(programDetail.pell_grant_rate)} />
                    <MetricBlock label="Federal Loan Rate" value={formatPercent(programDetail.federal_loan_rate)} />
                    <MetricBlock label="SAT Average" value={programDetail.sat_average ?? '—'} />
                    <MetricBlock label="ACT Midpoint" value={programDetail.act_midpoint ?? '—'} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Select a program above to view details.</p>
              )
            }
          />
          <DetailCard
            title="School Snapshot"
            loading={schoolDetailLoading}
            error={schoolDetailError}
            content={
              schoolDetail ? (
                <div className="space-y-4 text-sm text-gray-700">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{schoolDetail.school.name}</p>
                    <p className="text-xs text-gray-500">
                      {[schoolDetail.school.city, schoolDetail.school.state].filter(Boolean).join(', ')}
                    </p>
                    {schoolDetail.school.website && (
                      <a
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                        href={schoolDetail.school.website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Visit website →
                      </a>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <MetricBlock label="Avg Net Price" value={formatCurrency(schoolDetail.school.avg_net_price)} />
                    <MetricBlock label="Cost of Attendance" value={formatCurrency(schoolDetail.school.avg_cost_of_attendance)} />
                    <MetricBlock label="# Programs" value={schoolDetail.school.program_count.toLocaleString()} />
                    <MetricBlock label="Avg Student Size" value={formatCount(schoolDetail.school.avg_student_size)} />
                    <MetricBlock label="Pell Grant Rate" value={formatPercent(schoolDetail.school.pell_grant_rate)} />
                    <MetricBlock label="Federal Loan Rate" value={formatPercent(schoolDetail.school.federal_loan_rate)} />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Featured Programs</p>
                    <ul className="mt-2 space-y-2">
                      {schoolDetail.programs.slice(0, 4).map((program) => (
                        <li key={program.program_id} className="rounded-lg border border-gray-100 px-3 py-2 text-xs text-gray-600">
                          <div className="font-semibold text-gray-900">{program.program_title}</div>
                          <div className="text-xs">
                            {formatCurrency(program.avg_net_price)} · {formatScore(program.program_opportunity_score)}
                          </div>
                        </li>
                      ))}
                      {schoolDetail.programs.length === 0 && (
                        <li className="text-xs text-gray-500">Program roster unavailable.</li>
                      )}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Program details will load a school snapshot automatically.</p>
              )
            }
          />
          <DetailCard
            title="Cost of Living"
            loading={costLoading}
            error={costError}
            content={
            primaryCostRecord ? (
                <div className="space-y-4 text-sm text-gray-700">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                    {primaryCostRecord.city}
                    {primaryCostRecord.state ? `, ${primaryCostRecord.state}` : ''}
                    </p>
                  <p className="text-xs text-gray-500">
                    Source: {costSourceDescription} · Updated {new Date(primaryCostRecord.last_updated).toLocaleDateString()}
                  </p>
                  {isFallbackCost && (
                    <p className="text-xs text-amber-600">
                      This market uses a regional fallback estimate until live data is available.
                    </p>
                  )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                  <MetricBlock label="Cost + Rent Index" value={formatIndex(primaryCostRecord.cost_plus_rent_index)} />
                  <MetricBlock label="Rent Index" value={formatIndex(primaryCostRecord.rent_index)} />
                  <MetricBlock label="Groceries Index" value={formatIndex(primaryCostRecord.groceries_index)} />
                  <MetricBlock label="Restaurant Index" value={formatIndex(primaryCostRecord.restaurant_index)} />
                  <MetricBlock label="1BR Rent" value={formatCurrency(primaryCostRecord.rent_small)} />
                  <MetricBlock label="3BR Rent" value={formatCurrency(primaryCostRecord.rent_large)} />
                  <MetricBlock label="Meal (Restaurant)" value={formatCurrency(primaryCostRecord.meal_cost)} />
                  <MetricBlock label="Transit Pass" value={formatCurrency(primaryCostRecord.transit_monthly)} />
                  </div>
                  <p className="text-xs text-gray-500">
                    Index values are relative to New York City = 100. Combine with tuition + housing to plan a realistic budget.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No cost-of-living data available for this city yet. Try selecting a different program.
                </p>
              )
            }
          />
        <DetailCard
          title="Budget Planner"
          loading={!programDetail}
          error={null}
          content={
            programDetail && budgetEstimate ? (
              <>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4 text-sm text-gray-700">
                    <ScenarioSelect
                      label="Residency"
                      value={budgetScenario.residency}
                      onChange={(value) => updateScenario({ residency: value as ResidencyOption })}
                      options={[
                        { value: 'in_state', label: 'In-State' },
                        { value: 'out_of_state', label: 'Out-of-State' },
                      ]}
                    />
                    <ScenarioSelect
                      label="Housing"
                      value={budgetScenario.housing}
                      onChange={(value) => updateScenario({ housing: value as HousingOption })}
                      options={[
                        { value: 'on_campus', label: 'On Campus' },
                        { value: 'off_single', label: 'Off Campus (Solo)' },
                        { value: 'off_shared', label: 'Off Campus (Shared)' },
                      ]}
                    />
                    {budgetScenario.housing === 'off_shared' && (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Roommates</label>
                        <input
                          type="number"
                          min={1}
                          max={6}
                          value={budgetScenario.roommates}
                          onChange={(e) =>
                            updateScenario({ roommates: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })
                          }
                          className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    )}
                    <ScenarioSelect
                      label="Meals"
                      value={budgetScenario.mealPlan}
                      onChange={(value) => updateScenario({ mealPlan: value as MealOption })}
                      options={[
                        { value: 'campus', label: 'Campus Meal Plan' },
                        { value: 'self_cook', label: 'Cook at Home' },
                        { value: 'restaurants', label: 'Eat Out Frequently' },
                      ]}
                    />
                    <ScenarioSelect
                      label="Transport"
                      value={budgetScenario.transit}
                      onChange={(value) => updateScenario({ transit: value as TransitOption })}
                      options={[
                        { value: 'public', label: 'Public Transit' },
                        { value: 'car', label: 'Own a Car' },
                      ]}
                    />
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Miscellaneous %
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        value={Math.round(budgetScenario.miscPercent * 100)}
                        onChange={(e) => updateScenario({ miscPercent: Number(e.target.value) / 100 })}
                      />
                      <span className="text-xs text-gray-500">
                        Covers books, insurance, personal expenses ({Math.round(budgetScenario.miscPercent * 100)}%)
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Scenario Label</label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          placeholder="e.g. Parent Plan"
                          value={scenarioNameInput}
                          onChange={(e) => setScenarioNameInput(e.target.value)}
                          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={handleSaveScenario}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                        >
                          Save Scenario
                        </button>
                      </div>
                    </div>
                    <SavedScenarioList
                      scenarios={savedScenarios}
                      comparisonId={comparisonScenarioId}
                      onLoad={handleLoadScenario}
                      onDelete={handleDeleteScenario}
                      onToggleCompare={toggleComparisonScenario}
                    />
                    <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                      <button
                        type="button"
                        onClick={handleResetScenario}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Reset to Default
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSummaryModal(true)}
                        className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
                      >
                        Share / Print Summary
                      </button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <BudgetSummaryCard
                      title="Primary Scenario"
                      scenarioName="Student Plan"
                      scenario={budgetScenario}
                      breakdown={budgetEstimate}
                      accent="primary"
                    />
                    {comparisonScenario && comparisonEstimate && (
                      <BudgetSummaryCard
                        title="Comparison Scenario"
                        scenarioName={comparisonScenario.name}
                        scenario={comparisonScenario.scenario}
                        breakdown={comparisonEstimate}
                        accent="comparison"
                        onClear={() => setComparisonScenarioId(null)}
                      />
                    )}
                  </div>
                </div>
                <p className="mt-4 text-xs text-gray-500">
                  Tip: Save variations (parent vs. student budgets, on vs. off campus) and toggle “Compare” to see two plans
                  side-by-side.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">Select a program to estimate a full annual budget.</p>
            )
          }
        />
        <BudgetSummaryModal
          open={showSummaryModal && Boolean(programDetail && budgetEstimate)}
          onClose={() => setShowSummaryModal(false)}
          summary={scenarioSummaryText}
        />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Most Affordable States</h3>
            {locationLoading && <span className="text-xs text-gray-400">Refreshing…</span>}
          </div>
          {locationError && <p className="mt-4 text-sm text-red-600">{locationError}</p>}
          <ul className="mt-4 space-y-3">
            {affordableStates.map((state) => (
              <li key={state.state} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {state.state}{' '}
                    <span className="text-xs font-normal text-gray-500">({REGION_MAP[state.region_id] ?? '—'})</span>
                  </p>
                  <p className="text-xs text-gray-500">{state.school_count} schools · {state.program_count} programs</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-green-600">{formatCurrency(state.avg_net_price)}</p>
                  <p className="text-xs text-gray-500">Avg net price</p>
                </div>
              </li>
            ))}
            {!affordableStates.length && !locationLoading && (
              <li className="rounded-lg border border-gray-100 px-4 py-3 text-sm text-gray-500">No state data yet.</li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Highest-Cost Cities</h3>
            {locationLoading && <span className="text-xs text-gray-400">Refreshing…</span>}
          </div>
          {locationError && <p className="mt-4 text-sm text-red-600">{locationError}</p>}
          <ul className="mt-4 space-y-3">
            {costlyCities.map((city) => (
              <li key={`${city.city}-${city.state}`} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {city.city}, {city.state}
                  </p>
                  <p className="text-xs text-gray-500">{city.school_count} schools · {city.program_count} programs</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-rose-600">{formatCurrency(city.avg_net_price)}</p>
                  <p className="text-xs text-gray-500">Avg net price</p>
                </div>
              </li>
            ))}
            {!costlyCities.length && !locationLoading && (
              <li className="rounded-lg border border-gray-100 px-4 py-3 text-sm text-gray-500">No city data yet.</li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Nearby Cost of Living</h3>
            {nearbyLoading && <span className="text-xs text-gray-400">Scanning…</span>}
          </div>
          {nearbyError && <p className="mt-4 text-sm text-red-600">{nearbyError}</p>}
          {!nearbyError && programFilters.nearLat === undefined && (
            <p className="mt-4 text-sm text-gray-500">Set the “Near Latitude/Longitude” filters above to unlock nearby insights.</p>
          )}
          {!nearbyError && programFilters.nearLat !== undefined && (
            <ul className="mt-4 space-y-3">
              {nearbyLocations.map((location) => (
                <li key={`${location.city}-${location.state}`} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {location.city}
                      {location.state ? `, ${location.state}` : ''}
                    </p>
                    <p className="text-xs text-gray-500">
                      Cost+Rent {formatIndex(location.cost_plus_rent_index)} · {formatMiles(location.distance_miles)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-indigo-600">{formatCurrency(location.rent_small)}</p>
                    <p className="text-xs text-gray-500">1BR rent</p>
                  </div>
                </li>
              ))}
              {!nearbyLocations.length && !nearbyLoading && (
                <li className="rounded-lg border border-gray-100 px-4 py-3 text-sm text-gray-500">
                  No nearby cities within {programFilters.nearRadiusMiles ?? 50} miles.
                </li>
              )}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  min?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</label>
      <input
        type={type}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {options.map((option) => (
          <option key={option.value || 'all'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DetailCard({
  title,
  loading,
  error,
  content,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  content: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {loading && <span className="text-xs text-gray-400">Loading…</span>}
      </div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-4">{content}</div>
    </div>
  );
}

function ScenarioSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function BudgetLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{formatCurrency(value)}</p>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string | number }) {
                        return (
    <div className="rounded-lg border border-gray-100 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function SavedScenarioList({
  scenarios,
  comparisonId,
  onLoad,
  onDelete,
  onToggleCompare,
}: {
  scenarios: SavedScenario[];
  comparisonId: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCompare: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Saved Scenarios</label>
        <span className="text-xs text-gray-400">{scenarios.length}</span>
              </div>
      {scenarios.length === 0 ? (
        <p className="text-xs text-gray-500">No saved scenarios yet. Configure a plan and tap “Save Scenario”.</p>
      ) : (
        <ul className="space-y-2">
          {scenarios.map((scenario) => (
            <li key={scenario.id} className="rounded-lg border border-gray-100 px-3 py-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{scenario.name}</p>
                  <p className="text-xs text-gray-500">
                    {[scenario.scenario.residency === 'in_state' ? 'In-State' : 'Out-of-State', scenario.scenario.housing]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
          </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => onLoad(scenario.id)}
                    className="rounded-lg border border-gray-200 px-3 py-1 text-gray-700 hover:bg-gray-50"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleCompare(scenario.id)}
                    className={`rounded-lg border px-3 py-1 ${
                      comparisonId === scenario.id
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {comparisonId === scenario.id ? 'Comparing' : 'Compare'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(scenario.id)}
                    className="rounded-lg border border-gray-200 px-3 py-1 text-gray-500 hover:bg-gray-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
                    </li>
                  ))}
                </ul>
      )}
              </div>
  );
}

function BudgetSummaryCard({
  title,
  scenarioName,
  scenario,
  breakdown,
  accent = 'primary',
  onClear,
}: {
  title: string;
  scenarioName?: string;
  scenario: BudgetScenario;
  breakdown: BudgetBreakdown;
  accent?: 'primary' | 'comparison';
  onClear?: () => void;
}) {
  const accentClasses =
    accent === 'comparison'
      ? 'border-rose-100 bg-rose-50 text-rose-900'
      : 'border-indigo-100 bg-indigo-50 text-indigo-900';
  return (
    <div className="space-y-3 rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
          {scenarioName && <p className="text-sm font-semibold text-gray-900">{scenarioName}</p>}
           </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-rose-600 hover:text-rose-500"
          >
            Clear compare
          </button>
        )}
              </div>
      <div className={`rounded-lg px-4 py-3 text-sm ${accentClasses}`}>
        <p className="text-xs uppercase tracking-wide text-opacity-75">
          {scenario.residency === 'in_state' ? 'In-State' : 'Out-of-State'} · {scenario.housing.replace('_', ' ')}
        </p>
        <p className="text-2xl font-bold">${Math.round(breakdown.totalAnnual).toLocaleString()}</p>
        <p className="text-xs">
          ≈ ${Math.round(breakdown.totalMonthly).toLocaleString()} per month · Misc {Math.round(scenario.miscPercent * 100)}%
              </p>
           </div>
      <div className="space-y-2 text-sm text-gray-700">
        <BudgetLine label="Tuition & Fees" value={breakdown.tuition} />
        <BudgetLine label="Housing" value={breakdown.housing} />
        <BudgetLine label="Food" value={breakdown.food} />
        <BudgetLine label="Transit" value={breakdown.transit} />
        <BudgetLine label="Miscellaneous" value={breakdown.misc} />
      </div>
    </div>
  );
}

function BudgetSummaryModal({ open, onClose, summary }: { open: boolean; onClose: () => void; summary: string }) {
  if (!open) return null;

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      console.warn('Clipboard API unavailable in this environment.');
      return;
    }
    try {
      await navigator.clipboard.writeText(summary);
    } catch (error) {
      console.warn('Failed to copy summary:', error);
    }
  };

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (!printWindow) return;
    printWindow.document.write('<pre style="font-family:Inter, sans-serif; padding:24px;">');
    printWindow.document.write(summary.replace(/\n/g, '<br/>'));
    printWindow.document.write('</pre>');
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">Budget Summary</p>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">Copy or print this summary to share with family or advisors.</p>
        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-4 text-xs text-gray-800">
          <pre className="whitespace-pre-wrap">{summary}</pre>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Copy Summary
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `$${Math.round(value).toLocaleString()}`;
}

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(2);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Math.round(value).toLocaleString();
}

function formatIndex(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

function formatMiles(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)} mi`;
}
