const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // --- Public ---
  getSports: () => request<Sport[]>('/api/sports'),

  listClubs: (filters: { sport?: string; city?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (filters.sport) qs.set('sport', filters.sport);
    if (filters.city)  qs.set('city', filters.city);
    if (filters.q)     qs.set('q', filters.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<ClubSummary[]>(`/api/clubs${suffix}`);
  },

  getClub: (slug: string) => request<ClubDetail>(`/api/clubs/${slug}`),

  getResource: (resourceId: string) => request<PublicResource>(`/api/resources/${resourceId}`),

  getAvailability: (resourceId: string, date: string, duration: number) =>
    request<TimeSlot[]>(`/api/resources/${resourceId}/availability?date=${date}&duration=${duration}`),

  // --- Compte ---
  register: (body: RegisterBody) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  getMyClubs: (token: string) => request<Membership[]>('/api/me/clubs', {}, token),

  createClub: (body: CreateClubBody, token: string) =>
    request<ClubAdminDetail>('/api/clubs', { method: 'POST', body: JSON.stringify(body) }, token),

  // --- Réservation joueur ---
  holdSlot: (params: HoldParams, token: string) =>
    request<Reservation>('/api/reservations/hold', { method: 'POST', body: JSON.stringify(params) }, token),

  confirmReservation: (reservationId: string, token: string) =>
    request<Reservation>(`/api/reservations/${reservationId}/confirm`, { method: 'POST' }, token),

  cancelReservation: (reservationId: string, token: string) =>
    request<Reservation>(`/api/reservations/${reservationId}`, { method: 'DELETE' }, token),

  // --- Back-office club (scopé par clubId) ---
  adminGetClub: (clubId: string, token: string) =>
    request<ClubAdminDetail>(`/api/clubs/${clubId}/admin`, {}, token),

  adminUpdateClub: (clubId: string, body: UpdateClubBody, token: string) =>
    request<ClubAdminDetail>(`/api/clubs/${clubId}/admin`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  adminGetSports: (clubId: string, token: string) =>
    request<AdminClubSport[]>(`/api/clubs/${clubId}/admin/sports`, {}, token),

  adminAddSport: (clubId: string, sportId: string, token: string) =>
    request<AdminClubSport>(`/api/clubs/${clubId}/admin/sports`, { method: 'POST', body: JSON.stringify({ sportId }) }, token),

  adminGetResources: (clubId: string, token: string) =>
    request<AdminResource[]>(`/api/clubs/${clubId}/admin/resources`, {}, token),

  adminCreateResource: (clubId: string, body: CreateResourceBody, token: string) =>
    request<AdminResource>(`/api/clubs/${clubId}/admin/resources`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminUpdateResource: (clubId: string, id: string, body: UpdateResourceBody, token: string) =>
    request<AdminResource>(`/api/clubs/${clubId}/admin/resources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  adminSetResourceActive: (clubId: string, id: string, isActive: boolean, token: string) =>
    request<AdminResource>(`/api/clubs/${clubId}/admin/resources/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }, token),

  adminGetReservations: (clubId: string, filters: AdminReservationFilters, token: string) => {
    const qs = new URLSearchParams();
    if (filters.date)       qs.set('date', filters.date);
    if (filters.resourceId) qs.set('resourceId', filters.resourceId);
    if (filters.status)     qs.set('status', filters.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<ClubReservationsResponse>(`/api/clubs/${clubId}/admin/reservations${suffix}`, {}, token);
  },

  adminCancelReservation: (clubId: string, reservationId: string, token: string) =>
    request<Reservation>(`/api/clubs/${clubId}/admin/reservations/${reservationId}`, { method: 'DELETE' }, token),

  adminAddPayment: (clubId: string, reservationId: string, body: AddPaymentBody, token: string) =>
    request<Payment>(`/api/clubs/${clubId}/admin/reservations/${reservationId}/payments`, { method: 'POST', body: JSON.stringify(body) }, token),
};

// --- Types ---

export interface Sport {
  id: string;
  key: string;
  name: string;
  resourceNoun: string;
  defaultSlotStepMin: number;
  defaultDurationsMin: number[];
  icon: string | null;
}

export interface Membership {
  clubId: string;
  slug: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'STAFF';
}

export interface Resource {
  id: string;
  name: string;
  attributes: { surface?: string } & Record<string, unknown>;
  pricePerHour: string;
  openHour: number;
  closeHour: number;
}

export interface ClubSportPublic {
  id: string;
  slotStepMin: number | null;
  durationsMin: number[];
  sport: Sport;
  resources: Resource[];
}

export interface ClubSummary {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  description: string | null;
  accentColor: string;
  logoUrl: string | null;
  sports: { key: string; name: string; icon: string | null }[];
  resourceCount: number;
}

export interface ClubDetail {
  id: string;
  slug: string;
  name: string;
  address: string;
  city: string | null;
  country: string | null;
  description: string | null;
  timezone: string;
  logoUrl: string | null;
  accentColor: string;
  defaultThemeMode: string;
  status: string;
  clubSports: ClubSportPublic[];
}

export interface PublicResource {
  id: string;
  name: string;
  attributes: { surface?: string } & Record<string, unknown>;
  pricePerHour: string;
  openHour: number;
  closeHour: number;
  club: { slug: string; name: string; timezone: string; status: string; accentColor: string };
  clubSport: { durationsMin: number[]; sport: { name: string; resourceNoun: string; defaultDurationsMin: number[] } };
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface Reservation {
  id: string;
  resourceId: string;
  userId: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  totalPrice: string;
  createdAt: string;
}

export interface HoldParams {
  resourceId: string;
  startTime: string;
  endTime: string;
}

export interface CreateClubBody {
  name: string;
  slug?: string;
  address?: string;
  city?: string;
  timezone?: string;
}

export interface RegisterBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; firstName: string; lastName: string };
}

export interface ClubAdminDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  address: string;
  city: string | null;
  country: string | null;
  timezone: string;
  logoUrl: string | null;
  accentColor: string;
  defaultThemeMode: string;
  status: string;
}

export type UpdateClubBody = Partial<{
  name: string;
  description: string;
  address: string;
  city: string;
  timezone: string;
  logoUrl: string;
  accentColor: string;
  defaultThemeMode: string;
}>;

// --- Types back-office ---

export interface AdminClubSport {
  id: string;
  slotStepMin: number | null;
  durationsMin: number[];
  sport: { id: string; key: string; name: string; resourceNoun: string };
}

export interface AdminResource {
  id: string;
  name: string;
  attributes: { surface?: string } & Record<string, unknown>;
  isActive: boolean;
  pricePerHour: string;
  openHour: number;
  closeHour: number;
  clubSport: { id: string; sport: { key: string; name: string; resourceNoun: string } };
}

export interface CreateResourceBody {
  clubSportId: string;
  name: string;
  attributes?: Record<string, unknown>;
  pricePerHour: number;
  openHour?: number;
  closeHour?: number;
}

export type UpdateResourceBody = Partial<Omit<CreateResourceBody, 'clubSportId'>>;

export interface AdminReservationFilters {
  date?: string;
  resourceId?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE' | 'OTHER';

export interface Payment {
  id: string;
  amount: string;
  method: PaymentMethod;
  payerName: string | null;
  note: string | null;
  createdAt: string;
}

export interface AddPaymentBody {
  amount: number;
  method?: PaymentMethod;
  payerName?: string;
  note?: string;
}

export interface ClubReservation {
  id: string;
  resourceId: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  totalPrice: string;
  paidAmount: string;
  resource: { id: string; name: string };
  user: { firstName: string; lastName: string; email: string };
  payments: Payment[];
}

export interface ClubReservationsResponse {
  reservations: ClubReservation[];
  summary: { total: string; paid: string; paidTotal: string; outstanding: string };
}

export type SSEEventType = 'slot_held' | 'slot_confirmed' | 'slot_released' | 'connected';

export interface SSEEvent {
  type: SSEEventType;
  resourceId: string;
  reservationId?: string;
  startTime?: string;
  endTime?: string;
  expiresAt?: string;
}
