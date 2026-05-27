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

export type SSEEventType = 'slot_held' | 'slot_confirmed' | 'slot_released' | 'connected';

export interface SSEEvent {
  type: SSEEventType;
  courtId: string;
  reservationId?: string;
  startTime?: string;
  endTime?: string;
  expiresAt?: string;
}
