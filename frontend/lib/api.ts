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
  getCourts: (clubId: string) =>
    request<Court[]>(`/api/courts?clubId=${clubId}`),

  getAvailability: (courtId: string, date: string, duration: 60 | 90 | 120) =>
    request<TimeSlot[]>(`/api/courts/${courtId}/availability?date=${date}&duration=${duration}`),

  holdSlot: (params: HoldParams, token: string) =>
    request<Reservation>('/api/reservations/hold', {
      method: 'POST',
      body: JSON.stringify(params),
    }, token),

  confirmReservation: (reservationId: string, token: string) =>
    request<Reservation>(`/api/reservations/${reservationId}/confirm`, {
      method: 'POST',
    }, token),

  cancelReservation: (reservationId: string, token: string) =>
    request<Reservation>(`/api/reservations/${reservationId}`, {
      method: 'DELETE',
    }, token),

  // --- Espace admin club ---

  adminGetCourts: (token: string) =>
    request<AdminCourt[]>('/api/admin/courts', {}, token),

  adminCreateCourt: (body: CreateCourtBody, token: string) =>
    request<AdminCourt>('/api/admin/courts', {
      method: 'POST',
      body: JSON.stringify(body),
    }, token),

  adminUpdateCourt: (id: string, body: UpdateCourtBody, token: string) =>
    request<AdminCourt>(`/api/admin/courts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, token),

  adminSetCourtActive: (id: string, isActive: boolean, token: string) =>
    request<AdminCourt>(`/api/admin/courts/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }, token),

  adminGetReservations: (filters: AdminReservationFilters, token: string) => {
    const qs = new URLSearchParams();
    if (filters.date)    qs.set('date', filters.date);
    if (filters.courtId) qs.set('courtId', filters.courtId);
    if (filters.status)  qs.set('status', filters.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<ClubReservationsResponse>(`/api/admin/reservations${suffix}`, {}, token);
  },

  adminCancelReservation: (reservationId: string, token: string) =>
    request<Reservation>(`/api/admin/reservations/${reservationId}`, {
      method: 'DELETE',
    }, token),
};

// Types
export interface Court {
  id: string;
  name: string;
  surface: string;
  pricePerHour: string;
  openHour: number;
  closeHour: number;
  club: { name: string; timezone: string };
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface Reservation {
  id: string;
  courtId: string;
  userId: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  totalPrice: string;
  createdAt: string;
}

export interface HoldParams {
  courtId: string;
  startTime: string;
  endTime: string;
}

// --- Types admin club ---

export type UserRole = 'CLIENT' | 'CLUB_ADMIN';

export interface AdminCourt {
  id: string;
  name: string;
  surface: string;
  isActive: boolean;
  pricePerHour: string;
  openHour: number;
  closeHour: number;
}

export interface CreateCourtBody {
  name: string;
  surface?: string;
  pricePerHour: number;
  openHour?: number;
  closeHour?: number;
}

export type UpdateCourtBody = Partial<CreateCourtBody>;

export interface AdminReservationFilters {
  date?: string;
  courtId?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

export interface ClubReservation {
  id: string;
  courtId: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  totalPrice: string;
  court: { id: string; name: string };
  user: { firstName: string; lastName: string; email: string };
}

export interface ClubReservationsResponse {
  reservations: ClubReservation[];
  summary: { total: string; paidTotal: string };
}

export type SSEEventType = 'slot_held' | 'slot_confirmed' | 'slot_released' | 'connected';

export interface SSEEvent {
  type: SSEEventType;
  courtId: string;
  reservationId?: string;
  startTime?: string;
  endTime?: string;
  expiresAt?: string;
}
