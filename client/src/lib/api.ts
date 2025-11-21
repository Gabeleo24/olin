import { getAccessToken } from './supabaseClient';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

type QueryValue = string | number | boolean | undefined | null;

function buildUrl(path: string, params?: Record<string, QueryValue>): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });
  }
  return url.toString();
}

async function httpGet<T>(path: string, params?: Record<string, QueryValue>): Promise<T> {
  const response = await fetch(buildUrl(path, params));
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request to ${path} failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function authedRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, QueryValue>,
): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('You must be signed in to perform this action.');
  }
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(buildUrl(path, params), init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Authenticated request to ${path} failed (${response.status}).`);
  }
  if (response.status === 204) {
    return null as T;
  }
  return response.json() as Promise<T>;
}

async function authedGet<T>(path: string, params?: Record<string, QueryValue>): Promise<T> {
  return authedRequest<T>('GET', path, undefined, params);
}

async function authedPost<T>(path: string, body: unknown): Promise<T> {
  return authedRequest<T>('POST', path, body);
}

async function authedPut<T>(path: string, body: unknown): Promise<T> {
  return authedRequest<T>('PUT', path, body);
}

async function authedDelete(path: string): Promise<void> {
  await authedRequest<void>('DELETE', path);
}

export interface ListResponse<T> {
  count: number;
  results: T[];
}

export interface ProgramFilters {
  cipPrefix?: string;
  credential?: number;
  regionId?: number;
  state?: string;
  maxNetPrice?: number;
  nearLat?: number;
  nearLon?: number;
  nearRadiusMiles?: number;
  limit?: number;
}

export interface ProgramRecord {
  program_id: number;
  unit_id: number;
  program_code: string;
  program_title: string;
  credential_name?: string;
  program_credential_level?: number;
  school_name: string;
  city: string | null;
  state: string | null;
  region_id: number | null;
  region_name?: string | null;
  avg_net_price: number | null;
  resolved_tuition: number | null;
  in_state_tuition: number | null;
  out_state_tuition: number | null;
  program_opportunity_score: number | null;
  aid_strength_score: number | null;
  affordability_score: number | null;
  supply_gap_score: number | null;
  scholarship_volatility: number | null;
  housing_discrepancy_flag: number | boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  distance_miles?: number | null;
}

export interface ProgramDetail extends ProgramRecord {
  student_size: number | null;
  academic_year_cost: number | null;
  program_year_cost: number | null;
  pell_grant_rate: number | null;
  federal_loan_rate: number | null;
  median_debt_completion: number | null;
  admission_rate: number | null;
  sat_average: number | null;
  act_midpoint: number | null;
  median_earnings_10yr: number | null;
}

export interface StateProfile {
  state: string;
  region_id: number;
  region_name: string;
  school_count: number;
  program_count: number;
  avg_student_size: number | null;
  avg_in_state_tuition: number | null;
  avg_out_of_state_tuition: number | null;
  avg_cost_of_attendance: number | null;
  avg_net_price: number | null;
}

export interface CityProfile {
  state: string;
  city: string;
  region_id: number;
  region_name: string;
  school_count: number;
  program_count: number;
  avg_student_size: number | null;
  avg_in_state_tuition: number | null;
  avg_out_of_state_tuition: number | null;
  avg_cost_of_attendance: number | null;
  avg_net_price: number | null;
}

export interface SchoolSummary {
  unit_id: number;
  name: string;
  city: string | null;
  state: string | null;
  region_id: number | null;
  region_name: string | null;
  program_count: number;
  avg_net_price: number | null;
  avg_in_state_tuition: number | null;
  avg_out_state_tuition: number | null;
  avg_student_size: number | null;
}

export interface SchoolDetail {
  school: {
    unit_id: number;
    name: string;
    city: string | null;
    state: string | null;
    region_id: number | null;
    region_name: string | null;
    website: string | null;
    avg_student_size: number | null;
    program_count: number;
    avg_net_price: number | null;
    avg_in_state_tuition: number | null;
    avg_out_state_tuition: number | null;
    avg_cost_of_attendance: number | null;
    pell_grant_rate: number | null;
    federal_loan_rate: number | null;
  };
  programs: ProgramRecord[];
}

export interface LocationCostRecord {
  city: string;
  state: string | null;
  slug: string | null;
  cost_index: number | null;
  cost_plus_rent_index: number | null;
  rent_index: number | null;
  groceries_index: number | null;
  restaurant_index: number | null;
  rent_small: number | null;
  rent_large: number | null;
  meal_cost: number | null;
  transit_monthly: number | null;
  latitude?: number | null;
  longitude?: number | null;
  distance_miles?: number | null;
  last_updated: string;
  source: string | null;
}

export interface PortfolioItem {
  id: number;
  profile_id: number;
  title: string;
  description: string | null;
  media_url: string | null;
  tags: string[];
  created_at: string;
}

export interface StudentProfile {
  id: number;
  name: string;
  tagline: string | null;
  bio: string | null;
  home_city: string | null;
  home_state: string | null;
  program_focus: string | null;
  budget_focus: string | null;
  avatar_url: string | null;
  website_url: string | null;
  showcase_video_url: string | null;
  status?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
  portfolio: PortfolioItem[];
}

export interface UploadMediaResponse {
  public_url: string;
  storage_path: string;
}

export interface CreatePortfolioItemPayload {
  title: string;
  description?: string;
  media_url?: string;
  tags?: string[];
}

export interface CreateProfilePayload {
  name: string;
  tagline?: string;
  bio?: string;
  home_city?: string;
  home_state?: string;
  program_focus?: string;
  budget_focus?: string;
  avatar_url?: string;
  website_url?: string;
  showcase_video_url?: string;
  portfolio?: CreatePortfolioItemPayload[];
}

export async function fetchPrograms(filters: ProgramFilters = {}): Promise<ListResponse<ProgramRecord>> {
  const params: Record<string, QueryValue> = {
    limit: filters.limit ?? 25,
  };
  if (filters.cipPrefix) params.cip_prefix = filters.cipPrefix;
  if (filters.credential) params.credential = filters.credential;
  if (filters.regionId) params.region_id = filters.regionId;
  if (filters.state) params.state = filters.state.toUpperCase();
  if (filters.maxNetPrice !== undefined) params.max_net_price = filters.maxNetPrice;
  if (filters.nearLat !== undefined) params.near_lat = filters.nearLat;
  if (filters.nearLon !== undefined) params.near_lon = filters.nearLon;
  if (filters.nearRadiusMiles !== undefined) params.near_radius_miles = filters.nearRadiusMiles;
  return httpGet<ListResponse<ProgramRecord>>('/programs', params);
}

export async function fetchSchools(params: { state?: string; regionId?: number; limit?: number } = {}): Promise<ListResponse<SchoolSummary>> {
  const query: Record<string, QueryValue> = {
    limit: params.limit ?? 200,
  };
  if (params.state) query.state = params.state.toUpperCase();
  if (params.regionId) query.region_id = params.regionId;
  return httpGet<ListResponse<SchoolSummary>>('/schools', query);
}

export async function fetchStateProfiles(): Promise<ListResponse<StateProfile>> {
  return httpGet<ListResponse<StateProfile>>('/locations/states');
}

export async function fetchCityProfiles(params: { state?: string; limit?: number } = {}): Promise<ListResponse<CityProfile>> {
  const query: Record<string, QueryValue> = {
    limit: params.limit ?? 500,
  };
  if (params.state) query.state = params.state.toUpperCase();
  return httpGet<ListResponse<CityProfile>>('/locations/cities', query);
}

export async function fetchProgramDetail(programId: number): Promise<ProgramDetail> {
  return httpGet<ProgramDetail>(`/programs/${programId}`);
}

export async function fetchSchoolDetail(unitId: number, options: { programLimit?: number } = {}): Promise<SchoolDetail> {
  const params: Record<string, QueryValue> = {};
  if (options.programLimit) params.program_limit = options.programLimit;
  return httpGet<SchoolDetail>(`/schools/${unitId}`, params);
}

export async function fetchCostOfLiving(params: { city?: string; state?: string; limit?: number } = {}): Promise<ListResponse<LocationCostRecord>> {
  const query: Record<string, QueryValue> = {
    limit: params.limit ?? 25,
  };
  if (params.city) query.city = params.city;
  if (params.state) query.state = params.state;
  return httpGet<ListResponse<LocationCostRecord>>('/locations/cost', query);
}

export async function fetchNearbyLocations(params: {
  lat: number;
  lon: number;
  radiusMiles?: number;
  limit?: number;
}): Promise<ListResponse<LocationCostRecord>> {
  const query: Record<string, QueryValue> = {
    lat: params.lat,
    lon: params.lon,
    radius_miles: params.radiusMiles ?? 100,
    limit: params.limit ?? 100,
  };
  return httpGet<ListResponse<LocationCostRecord>>('/locations/nearby', query);
}

export async function fetchProfilesDirectory(params: {
  state?: string;
  program_focus?: string;
  search?: string;
  limit?: number;
} = {}): Promise<ListResponse<StudentProfile>> {
  const query: Record<string, QueryValue> = {};
  if (params.state) query.state = params.state.toUpperCase();
  if (params.program_focus) query.program_focus = params.program_focus;
  if (params.search) query.search = params.search;
  query.limit = params.limit ?? 50;
  return httpGet<ListResponse<StudentProfile>>('/profiles', query);
}

export async function fetchStudentProfile(profileId: number): Promise<StudentProfile> {
  return httpGet<StudentProfile>(`/profiles/${profileId}`);
}

export async function createStudentProfile(payload: CreateProfilePayload): Promise<StudentProfile> {
  return authedPost<StudentProfile>('/profiles', payload);
}

export async function addPortfolioItem(
  profileId: number,
  payload: CreatePortfolioItemPayload,
): Promise<PortfolioItem> {
  return authedPost<PortfolioItem>(`/profiles/${profileId}/portfolio`, payload);
}

export async function fetchMyProfile(): Promise<StudentProfile> {
  return authedGet<StudentProfile>('/profiles/me');
}

export async function updateStudentProfile(
  profileId: number,
  payload: CreateProfilePayload,
): Promise<StudentProfile> {
  return authedPut<StudentProfile>(`/profiles/${profileId}`, payload);
}

export async function deleteStudentProfile(profileId: number): Promise<void> {
  await authedDelete(`/profiles/${profileId}`);
}

export async function uploadProfileMedia(
  file: File,
  kind: 'avatar' | 'portfolio' | 'video' = 'portfolio',
): Promise<UploadMediaResponse> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('You must be signed in to upload media.');
  }
  const formData = new FormData();
  formData.append('kind', kind);
  formData.append('file', file);
  const response = await fetch(buildUrl('/profiles/upload-media'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Upload failed.');
  }
  return response.json() as Promise<UploadMediaResponse>;
}

// Legacy mock implementations (settings page still relies on these placeholders)
const api = {
  get: async (url: string) => {
    console.warn(`API GET ${url} is not implemented in the mock client.`);
    return { data: {} };
  },
  put: async (url: string, data: any) => {
    console.warn(`API PUT ${url} is mocked. Payload:`, data);
    return { data };
  },
  post: async (url: string, data: any) => {
    console.warn(`API POST ${url} is mocked. Payload:`, data);
    return { data };
  },
};

export const preferencesAPI = {
  get: async () => ({
      data: {
        timezone: 'Pacific (UTC-8)',
        theme: 'auto',
        autoSave: true,
  },
  }),
  update: async (data: any) => {
    console.log('Updating preferences:', data);
    return { data };
  },
};

export default api;
