const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// URL complète d'un fichier servi par le backend (ex. avatarUrl `/uploads/avatars/...`).
// Une URL déjà absolue (http/https) est renvoyée telle quelle — rétro-compat des logos
// partenaires saisis en URL externe avant le passage à l'upload de fichier.
export function assetUrl(path: string | null): string | null {
  if (!path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`;
}

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
    const err = new Error(body.error || `HTTP ${res.status}`);
    if (body && typeof body.subject === 'string') (err as Error & { subject?: string }).subject = body.subject;
    throw err;
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

  /** Résout un libellé de sous-domaine (slug actuel ou alias historique). 404 si inconnu. */
  resolveClubSlug: (slug: string) =>
    request<{ slug: string; moved: boolean }>(`/api/clubs/_resolve/${slug}`),

  getResource: (resourceId: string) => request<PublicResource>(`/api/resources/${resourceId}`),

  getAvailability: (resourceId: string, date: string, duration: number) =>
    request<TimeSlot[]>(`/api/resources/${resourceId}/availability?date=${date}&duration=${duration}`),

  getClubAvailability: (slug: string, date: string, duration: number) =>
    request<ClubAvailability[]>(`/api/clubs/${slug}/availability?date=${date}&duration=${duration}`),

  // --- Compte ---
  // L'inscription ne renvoie plus de token : elle déclenche l'envoi d'un code par email.
  register: (body: RegisterBody) =>
    request<RegisterPending>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  verifyEmail: (email: string, code: string) =>
    request<AuthResponse>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code }) }),

  resendCode: (email: string) =>
    request<{ ok: boolean; devCode?: string }>('/api/auth/resend-code', { method: 'POST', body: JSON.stringify({ email }) }),

  getMyClubs: (token: string) => request<ManagedClub[]>('/api/me/clubs', {}, token),

  getMyReservations: (token: string) => request<MyReservation[]>('/api/me/reservations', {}, token),

  // Adhésions du joueur (clubs dont il est membre + statut abonné).
  getMyMemberships: (token: string) => request<PlayerMembership[]>('/api/me/memberships', {}, token),

  // Auto-inscription du joueur connecté à un club (adhésion automatique, idempotente).
  joinClub: (slug: string, token: string) =>
    request<{ ok: boolean }>(`/api/clubs/${slug}/join`, { method: 'POST' }, token),

  createClub: (body: CreateClubBody, token: string) =>
    request<ClubAdminDetail>('/api/clubs', { method: 'POST', body: JSON.stringify(body) }, token),

  // --- Réservation joueur ---
  holdSlot: (params: HoldParams, token: string) =>
    request<Reservation>('/api/reservations/hold', { method: 'POST', body: JSON.stringify(params) }, token),

  confirmReservation: (reservationId: string, token: string, paymentSource?: { packageId: string }) =>
    request<Reservation>(`/api/reservations/${reservationId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(paymentSource ? { paymentSource } : {}),
    }, token),

  cancelReservation: (reservationId: string, token: string) =>
    request<Reservation>(`/api/reservations/${reservationId}`, { method: 'DELETE' }, token),

  getReservationPlayers: (reservationId: string, token: string) =>
    request<ReservationPlayers>(`/api/reservations/${reservationId}/players`, {}, token),
  addReservationPlayer: (reservationId: string, memberUserId: string, token: string) =>
    request<ReservationPlayers>(`/api/reservations/${reservationId}/players`, { method: 'POST', body: JSON.stringify({ memberUserId }) }, token),
  removeReservationPlayer: (reservationId: string, participantId: string, token: string) =>
    request<ReservationPlayers>(`/api/reservations/${reservationId}/players/${participantId}`, { method: 'DELETE' }, token),

  // --- Parties ouvertes (membres du club) ---
  getOpenMatches: (slug: string, token: string) =>
    request<OpenMatch[]>(`/api/clubs/${slug}/open-matches`, {}, token),
  joinOpenMatch: (slug: string, id: string, token: string) =>
    request<{ id: string }>(`/api/clubs/${slug}/open-matches/${id}/join`, { method: 'POST' }, token),
  leaveOpenMatch: (slug: string, id: string, token: string) =>
    request<{ id: string }>(`/api/clubs/${slug}/open-matches/${id}/join`, { method: 'DELETE' }, token),
  removeOpenMatchPlayer: (slug: string, id: string, userId: string, token: string) =>
    request<{ id: string }>(`/api/clubs/${slug}/open-matches/${id}/participants/${userId}`, { method: 'DELETE' }, token),

  // --- Back-office club (scopé par clubId) ---
  adminGetClub: (clubId: string, token: string) =>
    request<ClubAdminDetail>(`/api/clubs/${clubId}/admin`, {}, token),

  adminGetMembers: (clubId: string, token: string) =>
    request<Member[]>(`/api/clubs/${clubId}/admin/members`, {}, token),

  adminAddMemberByEmail: (clubId: string, email: string, token: string) =>
    request<{ ok: boolean }>(`/api/clubs/${clubId}/admin/members`, { method: 'POST', body: JSON.stringify({ email }) }, token),

  adminCreateMember: (clubId: string, body: CreateMemberBody, token: string) =>
    request<{ tempPassword: string | null; existed: boolean }>(`/api/clubs/${clubId}/admin/members/create`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminUpdateMember: (clubId: string, id: string, body: UpdateMemberBody, token: string) =>
    request<Member>(`/api/clubs/${clubId}/admin/members/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  adminSetMemberBlocked: (clubId: string, id: string, blocked: boolean, token: string) =>
    request<Member>(`/api/clubs/${clubId}/admin/members/${id}/blocked`, { method: 'PATCH', body: JSON.stringify({ blocked }) }, token),

  adminRemoveMember: (clubId: string, id: string, token: string) =>
    request<{ ok: boolean }>(`/api/clubs/${clubId}/admin/members/${id}`, { method: 'DELETE' }, token),

  adminUpdateClub: (clubId: string, body: UpdateClubBody, token: string) =>
    request<ClubAdminDetail>(`/api/clubs/${clubId}/admin`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  // Upload du logo du club en FormData — fetch dédié (request() force du JSON). Persiste côté serveur.
  uploadClubLogo: async (clubId: string, file: File, token: string): Promise<{ logoUrl: string }> => {
    const form = new FormData();
    form.append('logo', file);
    const res = await fetch(`${BASE_URL}/api/clubs/${clubId}/admin/club-logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  adminGetSports: (clubId: string, token: string) =>
    request<AdminClubSport[]>(`/api/clubs/${clubId}/admin/sports`, {}, token),

  adminAddSport: (clubId: string, sportId: string, token: string) =>
    request<AdminClubSport>(`/api/clubs/${clubId}/admin/sports`, { method: 'POST', body: JSON.stringify({ sportId }) }, token),

  adminUpdateClubSport: (clubId: string, clubSportId: string, durationsMin: number[], token: string) =>
    request<AdminClubSport>(`/api/clubs/${clubId}/admin/sports/${clubSportId}`, { method: 'PATCH', body: JSON.stringify({ durationsMin }) }, token),

  adminGetResources: (clubId: string, token: string) =>
    request<AdminResource[]>(`/api/clubs/${clubId}/admin/resources`, {}, token),

  adminCreateResource: (clubId: string, body: CreateResourceBody, token: string) =>
    request<AdminResource>(`/api/clubs/${clubId}/admin/resources`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminUpdateResource: (clubId: string, id: string, body: UpdateResourceBody, token: string) =>
    request<AdminResource>(`/api/clubs/${clubId}/admin/resources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  adminSetResourceActive: (clubId: string, id: string, isActive: boolean, token: string) =>
    request<AdminResource>(`/api/clubs/${clubId}/admin/resources/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }, token),

  adminReorderResources: (clubId: string, orderedIds: string[], token: string) =>
    request<AdminResource[]>(`/api/clubs/${clubId}/admin/resources/reorder`, { method: 'PATCH', body: JSON.stringify({ orderedIds }) }, token),

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

  adminSetReservationType: (clubId: string, reservationId: string, type: ReservationType, token: string) =>
    request<Reservation>(`/api/clubs/${clubId}/admin/reservations/${reservationId}`, { method: 'PATCH', body: JSON.stringify({ type }) }, token),

  adminCreateReservation: (clubId: string, body: CreateReservationBody, token: string) =>
    request<ClubReservation>(`/api/clubs/${clubId}/admin/reservations`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminAddPayment: (clubId: string, reservationId: string, body: AddPaymentBody, token: string) =>
    request<Payment>(`/api/clubs/${clubId}/admin/reservations/${reservationId}/payments`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminAssignReservationMember: (clubId: string, reservationId: string, memberUserId: string, token: string) =>
    request<ClubReservation>(`/api/clubs/${clubId}/admin/reservations/${reservationId}/member`, { method: 'PATCH', body: JSON.stringify({ memberUserId }) }, token),

  adminAddReservationParticipant: (clubId: string, reservationId: string, memberUserId: string, token: string) =>
    request<ClubReservation>(`/api/clubs/${clubId}/admin/reservations/${reservationId}/participants`, { method: 'POST', body: JSON.stringify({ memberUserId }) }, token),

  adminRemoveReservationParticipant: (clubId: string, reservationId: string, participantId: string, token: string) =>
    request<ClubReservation>(`/api/clubs/${clubId}/admin/reservations/${reservationId}/participants/${participantId}`, { method: 'DELETE' }, token),

  // --- Offres prépayées & caisse ---
  adminGetPackageTemplates: (clubId: string, token: string) =>
    request<PackageTemplate[]>(`/api/clubs/${clubId}/admin/packages/templates`, {}, token),

  adminCreatePackageTemplate: (clubId: string, body: CreatePackageTemplateBody, token: string) =>
    request<PackageTemplate>(`/api/clubs/${clubId}/admin/packages/templates`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminUpdatePackageTemplate: (clubId: string, id: string, body: UpdatePackageTemplateBody, token: string) =>
    request<PackageTemplate>(`/api/clubs/${clubId}/admin/packages/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  adminGetMemberPackages: (clubId: string, userId: string, token: string) =>
    request<MemberPackage[]>(`/api/clubs/${clubId}/admin/members/${userId}/packages`, {}, token),

  adminSellPackage: (clubId: string, userId: string, body: SellPackageBody, token: string) =>
    request<{ package: MemberPackage; payment: Payment }>(`/api/clubs/${clubId}/admin/members/${userId}/packages`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminGetCaisse: (clubId: string, date: string, token: string) =>
    request<CaisseSummary>(`/api/clubs/${clubId}/admin/caisse?date=${date}`, {}, token),

  adminGetVouchers: (clubId: string, status: VoucherStatus | '', token: string) =>
    request<CaissePayment[]>(`/api/clubs/${clubId}/admin/caisse/vouchers${status ? `?status=${status}` : ''}`, {}, token),

  adminSetVoucherStatus: (clubId: string, paymentId: string, status: VoucherStatus, token: string) =>
    request<Payment>(`/api/clubs/${clubId}/admin/payments/${paymentId}/voucher`, { method: 'PATCH', body: JSON.stringify({ status }) }, token),

  // --- Annonces & sponsors (page d'accueil club) ---
  getClubAnnouncements: (slug: string) => request<Announcement[]>(`/api/clubs/${slug}/announcements`),
  getClubSponsors: (slug: string) => request<Sponsor[]>(`/api/clubs/${slug}/sponsors`),

  adminGetAnnouncements: (clubId: string, token: string) =>
    request<Announcement[]>(`/api/clubs/${clubId}/admin/announcements`, {}, token),
  adminCreateAnnouncement: (clubId: string, body: AnnouncementBody, token: string) =>
    request<Announcement>(`/api/clubs/${clubId}/admin/announcements`, { method: 'POST', body: JSON.stringify(body) }, token),
  adminUpdateAnnouncement: (clubId: string, id: string, body: AnnouncementBody, token: string) =>
    request<Announcement>(`/api/clubs/${clubId}/admin/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  adminDeleteAnnouncement: (clubId: string, id: string, token: string) =>
    request<{ ok: boolean }>(`/api/clubs/${clubId}/admin/announcements/${id}`, { method: 'DELETE' }, token),

  adminGetSponsors: (clubId: string, token: string) =>
    request<Sponsor[]>(`/api/clubs/${clubId}/admin/sponsors`, {}, token),
  adminCreateSponsor: (clubId: string, body: SponsorBody, token: string) =>
    request<Sponsor>(`/api/clubs/${clubId}/admin/sponsors`, { method: 'POST', body: JSON.stringify(body) }, token),
  adminUpdateSponsor: (clubId: string, id: string, body: SponsorBody, token: string) =>
    request<Sponsor>(`/api/clubs/${clubId}/admin/sponsors/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  adminDeleteSponsor: (clubId: string, id: string, token: string) =>
    request<{ ok: boolean }>(`/api/clubs/${clubId}/admin/sponsors/${id}`, { method: 'DELETE' }, token),
  // Upload du logo partenaire (multipart) → renvoie le chemin /uploads à stocker dans logoUrl.
  uploadSponsorLogo: async (clubId: string, file: File, token: string): Promise<{ logoUrl: string }> => {
    const form = new FormData();
    form.append('logo', file);
    const res = await fetch(`${BASE_URL}/api/clubs/${clubId}/admin/sponsors/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // --- Tournois (public + joueur) ---
  getClubTournaments: (slug: string) => request<Tournament[]>(`/api/clubs/${slug}/tournaments`),

  getTournament: (id: string) => request<TournamentDetail>(`/api/tournaments/${id}`),

  getTournamentParticipants: (id: string) => request<TournamentParticipant[]>(`/api/tournaments/${id}/participants`),

  registerTournament: (id: string, partnerUserId: string, token: string) =>
    request<TournamentRegistrationRecord>(`/api/tournaments/${id}/register`, { method: 'POST', body: JSON.stringify({ partnerUserId }) }, token),

  changeTournamentPartner: (id: string, partnerUserId: string, token: string) =>
    request<TournamentRegistrationRecord>(`/api/tournaments/${id}/registration`, { method: 'PATCH', body: JSON.stringify({ partnerUserId }) }, token),

  cancelTournamentRegistration: (id: string, token: string) =>
    request<TournamentRegistrationRecord>(`/api/tournaments/${id}/registration`, { method: 'DELETE' }, token),

  // --- Events (public + joueur) ---
  getClubEvents: (slug: string) => request<ClubEvent[]>(`/api/clubs/${slug}/events`),

  getEvent: (id: string) => request<ClubEventDetail>(`/api/events/${id}`),

  getEventParticipants: (id: string) => request<EventParticipant[]>(`/api/events/${id}/participants`),

  registerEvent: (id: string, token: string) =>
    request<EventRegistrationRecord>(`/api/events/${id}/register`, { method: 'POST' }, token),

  cancelEventRegistration: (id: string, token: string) =>
    request<EventRegistrationRecord>(`/api/events/${id}/registration`, { method: 'DELETE' }, token),

  // --- Profil joueur ---
  getMyProfile: (token: string) => request<MyProfile>('/api/me/profile', {}, token),

  updateMyProfile: (body: { phone?: string | null; sex?: Sex | null; birthDate?: string | null; locale?: string | null }, token: string) =>
    request<MyProfile>('/api/me', { method: 'PATCH', body: JSON.stringify(body) }, token),

  // Upload d'avatar en FormData — fetch dédié : request() force Content-Type JSON.
  uploadMyAvatar: async (file: File, token: string): Promise<MyProfile> => {
    const form = new FormData();
    form.append('avatar', file);
    const res = await fetch(`${BASE_URL}/api/me/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // --- Annuaire & adhésion (club courant) ---
  searchClubMembers: (slug: string, q: string, token: string) =>
    request<ClubMemberSearchResult[]>(`/api/clubs/${slug}/members/search?q=${encodeURIComponent(q)}`, {}, token),

  getMyClubMembership: (slug: string, token: string) =>
    request<MyClubMembership>(`/api/clubs/${slug}/me/membership`, {}, token),

  updateMyClubMembership: (slug: string, membershipNo: string, token: string) =>
    request<MyClubMembership>(`/api/clubs/${slug}/me/membership`, { method: 'PATCH', body: JSON.stringify({ membershipNo }) }, token),

  // Soldes prépayés du joueur sur ce club.
  getMyClubPackages: (slug: string, token: string) =>
    request<MemberPackage[]>(`/api/clubs/${slug}/me/packages`, {}, token),

  getMyTournaments: (token: string) => request<MyTournamentRegistration[]>('/api/me/tournaments', {}, token),

  getMyEvents: (token: string) => request<MyEventRegistration[]>('/api/me/events', {}, token),

  // --- Tournois (back-office club) ---
  adminGetTournaments: (clubId: string, token: string) =>
    request<Tournament[]>(`/api/clubs/${clubId}/admin/tournaments`, {}, token),

  adminGetTournament: (clubId: string, id: string, token: string) =>
    request<AdminTournamentDetail>(`/api/clubs/${clubId}/admin/tournaments/${id}`, {}, token),

  adminCreateTournament: (clubId: string, body: CreateTournamentBody, token: string) =>
    request<Tournament>(`/api/clubs/${clubId}/admin/tournaments`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminUpdateTournament: (clubId: string, id: string, body: UpdateTournamentBody, token: string) =>
    request<Tournament>(`/api/clubs/${clubId}/admin/tournaments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  adminDeleteTournament: (clubId: string, id: string, token: string) =>
    request<{ ok: boolean }>(`/api/clubs/${clubId}/admin/tournaments/${id}`, { method: 'DELETE' }, token),

  adminPromoteRegistration: (clubId: string, tournamentId: string, regId: string, token: string) =>
    request<AdminRegistration>(`/api/clubs/${clubId}/admin/tournaments/${tournamentId}/registrations/${regId}`, { method: 'PATCH' }, token),

  adminRemoveRegistration: (clubId: string, tournamentId: string, regId: string, token: string) =>
    request<{ id: string }>(`/api/clubs/${clubId}/admin/tournaments/${tournamentId}/registrations/${regId}`, { method: 'DELETE' }, token),

  // --- Events (back-office club) ---
  adminGetEvents: (clubId: string, token: string) =>
    request<ClubEvent[]>(`/api/clubs/${clubId}/admin/events`, {}, token),

  adminGetEvent: (clubId: string, id: string, token: string) =>
    request<AdminEventDetail>(`/api/clubs/${clubId}/admin/events/${id}`, {}, token),

  adminCreateEvent: (clubId: string, body: CreateEventBody, token: string) =>
    request<ClubEvent>(`/api/clubs/${clubId}/admin/events`, { method: 'POST', body: JSON.stringify(body) }, token),

  adminUpdateEvent: (clubId: string, id: string, body: UpdateEventBody, token: string) =>
    request<ClubEvent>(`/api/clubs/${clubId}/admin/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  adminDeleteEvent: (clubId: string, id: string, token: string) =>
    request<{ ok: boolean }>(`/api/clubs/${clubId}/admin/events/${id}`, { method: 'DELETE' }, token),

  adminPromoteEventRegistration: (clubId: string, eventId: string, regId: string, token: string) =>
    request<AdminEventRegistration>(`/api/clubs/${clubId}/admin/events/${eventId}/registrations/${regId}`, { method: 'PATCH' }, token),

  adminRemoveEventRegistration: (clubId: string, eventId: string, regId: string, token: string) =>
    request<{ id: string }>(`/api/clubs/${clubId}/admin/events/${eventId}/registrations/${regId}`, { method: 'DELETE' }, token),

  // --- Plateforme (super-admin) ---
  platformStats: (token: string) => request<PlatformStats>('/api/platform/stats', {}, token),

  platformClubs: (token: string) => request<PlatformClub[]>('/api/platform/clubs', {}, token),

  platformSetClubStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED', token: string) =>
    request<{ id: string; status: 'ACTIVE' | 'SUSPENDED' }>(`/api/platform/clubs/${id}`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }, token),

  platformChangeClubSlug: (id: string, slug: string, token: string) =>
    request<{ id: string; slug: string; name: string }>(`/api/platform/clubs/${id}/slug`, {
      method: 'POST', body: JSON.stringify({ slug }),
    }, token),

  platformCreateClub: (body: CreateClubByPlatformBody, token: string) =>
    request<{ club: { id: string; slug: string; name: string }; owner: { id: string; email: string } }>(
      '/api/platform/clubs', { method: 'POST', body: JSON.stringify(body) }, token),
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

export interface ManagedClub {
  clubId: string;
  slug: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'STAFF';
}

export interface MyReservation {
  id: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  totalPrice: string;
  resource: { id: string; name: string; club: { name: string; slug: string; timezone: string; playerChangeCutoffHours?: number; cancellationCutoffHours?: number } };
}

export interface ReservationPlayer {
  id: string;
  userId: string;
  isOrganizer: boolean;
  firstName: string;
  lastName: string;
  share: string;
}
export interface ReservationPlayers {
  id: string;
  capacity: number;
  participants: ReservationPlayer[];
}

export interface Resource {
  id: string;
  name: string;
  attributes: { surface?: string } & Record<string, unknown>;
  price: string;
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
  publicBookingDays: number;
  memberBookingDays: number;
  clubSports: ClubSportPublic[];
}

export interface Member {
  id: string;          // id de l'adhésion (ClubMembership)
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isSubscriber: boolean;
  membershipNo: string | null;
  status: 'ACTIVE' | 'BLOCKED';
  note: string | null;
  since?: string;
}

export interface PlayerMembership {
  clubId: string;
  slug: string;
  isSubscriber: boolean;
  status: 'ACTIVE' | 'BLOCKED';
  club: ClubSummary;
}

export type CreateMemberBody = { firstName: string; lastName: string; email: string; phone?: string; membershipNo?: string };
export type UpdateMemberBody = Partial<{ isSubscriber: boolean; membershipNo: string | null; status: 'ACTIVE' | 'BLOCKED'; note: string | null; phone: string | null }>;

// Plages d'heures creuses par jour (weekday Luxon 1=lundi..7=dimanche), plusieurs
// plages possibles par jour, précision à la minute. Hors plage (ou jour absent) = heures pleines.
export type OffPeakRange = { start: number; startMin?: number; end: number; endMin?: number };
export type OffPeakHours = Record<number, Array<OffPeakRange>>;

export interface PublicResource {
  id: string;
  name: string;
  attributes: { surface?: string } & Record<string, unknown>;
  price: string;
  offPeakPrice: string | null;
  openHour: number;
  closeHour: number;
  club: { slug: string; name: string; timezone: string; status: string; accentColor: string };
  clubSport: { durationsMin: number[]; sport: { name: string; resourceNoun: string; defaultDurationsMin: number[] } };
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
  price: string;    // prix du créneau (tarif creux si entièrement en heures creuses)
  offPeak: boolean; // true si le créneau est ENTIÈREMENT en heures creuses
}

export interface ClubAvailability {
  resource: {
    id: string;
    name: string;
    attributes: { surface?: string; format?: string } & Record<string, unknown>;
    price: string;
    offPeakPrice: string | null;
    sport: { key: string; name: string };
    clubSportId: string;
  };
  slots: TimeSlot[];
}

export interface ReservationParticipant {
  id: string;
  userId: string;
  isOrganizer: boolean;
  share: string;
}

export interface Reservation {
  id: string;
  resourceId: string;
  userId: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  visibility?: 'PRIVATE' | 'PUBLIC';
  totalPrice: string;
  createdAt: string;
  participants?: ReservationParticipant[];
}

export interface HoldParams {
  resourceId: string;
  startTime: string;
  endTime: string;
  partnerUserIds?: string[];
  visibility?: 'PRIVATE' | 'PUBLIC';
}

export interface OpenMatchPlayer {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  isOrganizer: boolean;
}

export interface OpenMatch {
  id: string;
  resourceName: string;
  startTime: string;
  endTime: string;
  maxPlayers: number;
  spotsLeft: number;
  full: boolean;
  viewerIsParticipant: boolean;
  viewerIsOrganizer: boolean;
  players: OpenMatchPlayer[];
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
  user: { id: string; email: string; firstName: string; lastName: string; isSuperAdmin: boolean };
}

// Réponse d'inscription : aucun token, le compte attend la validation par code email.
export interface RegisterPending {
  pendingVerification: true;
  email: string;
  devCode?: string; // présent uniquement en dev (sans SMTP)
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
  listedInDirectory: boolean;
  publicBookingDays: number;
  memberBookingDays: number;
  offPeakHours: OffPeakHours | null;
  bookingQuotas: BookingQuotas | null;
  playerChangeCutoffHours: number;
  cancellationCutoffHours: number;
}

// Quotas de réservations COURT par joueur (réglage club, null = désactivé).
// UPCOMING = résas à venir simultanées ; WEEKLY = semaine calendaire lun-dim.
// Limite null = illimité, 0 = bloqué.
export interface QuotaLimits { peak: number | null; offPeak: number | null }
export interface BookingQuotas {
  model: 'UPCOMING' | 'WEEKLY';
  subscriber: QuotaLimits;
  nonSubscriber: QuotaLimits;
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
  listedInDirectory: boolean;
  publicBookingDays: number;
  memberBookingDays: number;
  offPeakHours: OffPeakHours | null;
  bookingQuotas: BookingQuotas | null;
  playerChangeCutoffHours: number;
  cancellationCutoffHours: number;
}>;

// --- Types back-office ---

export interface AdminClubSport {
  id: string;
  slotStepMin: number | null;
  durationsMin: number[];
  sport: { id: string; key: string; name: string; resourceNoun: string; defaultDurationsMin: number[] };
}

export interface AdminResource {
  id: string;
  name: string;
  attributes: { surface?: string; format?: string } & Record<string, unknown>;
  isActive: boolean;
  price: string;
  offPeakPrice: string | null;
  openHour: number;
  closeHour: number;
  slotStepMin: number | null;
  clubSport: { id: string; slotStepMin: number | null; durationsMin: number[]; sport: { key: string; name: string; resourceNoun: string; defaultSlotStepMin: number; defaultDurationsMin: number[] } };
}

export interface CreateResourceBody {
  clubSportId: string;
  name: string;
  attributes?: Record<string, unknown>;
  price: number;
  offPeakPrice?: number | null;
  openHour?: number;
  closeHour?: number;
  slotStepMin?: number | null;
}

export type UpdateResourceBody = Partial<Omit<CreateResourceBody, 'clubSportId'>>;

export interface AdminReservationFilters {
  date?: string;
  resourceId?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

export interface CreateReservationBody {
  resourceId: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  type: ReservationType;
  title?: string;
  memberUserId?: string;
  price?: number;
}

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE' | 'OTHER' | 'VOUCHER' | 'PACK_CREDIT' | 'WALLET' | 'MEMBER';
export type PackageKind = 'ENTRIES' | 'WALLET';
export type VoucherStatus = 'PENDING_REIMBURSEMENT' | 'REIMBURSED';

export interface Payment {
  id: string;
  amount: string;
  method: PaymentMethod;
  payerName: string | null;
  note: string | null;
  voucherRef: string | null;
  voucherIssuer: string | null;
  voucherStatus: VoucherStatus | null;
  createdAt: string;
}

export interface AddPaymentBody {
  amount: number;
  method?: PaymentMethod;
  payerName?: string;
  note?: string;
  sourcePackageId?: string;
  voucherRef?: string;
  voucherIssuer?: string;
  participantId?: string; // attribue l'encaissement à un joueur précis de la résa
}

export interface PackageTemplate {
  id: string;
  kind: PackageKind;
  name: string;
  price: string;
  entriesCount: number | null;
  walletAmount: string | null;
  validityDays: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface MemberPackage {
  id: string;
  kind: PackageKind;
  creditsTotal: number | null;
  creditsRemaining: number | null;
  amountTotal: string | null;
  amountRemaining: string | null;
  purchasedAt: string;
  expiresAt: string | null;
  template: { name: string };
}

export interface CaissePayment extends Payment {
  reservation: {
    id: string; startTime: string;
    resource: { name: string };
    user: { firstName: string; lastName: string } | null;
  } | null;
  memberPackage: {
    id: string; kind: PackageKind;
    user: { firstName: string; lastName: string };
    template: { name: string };
  } | null;
}

export interface CaisseSummary {
  date: string;
  totalsByMethod: Partial<Record<PaymentMethod, string>>;
  collected: string;
  payments: CaissePayment[];
}

export interface SellPackageBody {
  templateId: string;
  method?: PaymentMethod;
  payerName?: string;
  voucherRef?: string;
  voucherIssuer?: string;
}

export type CreatePackageTemplateBody = {
  kind: PackageKind; name: string; price: number;
  entriesCount?: number; walletAmount?: number; validityDays?: number | null;
};
export type UpdatePackageTemplateBody = Partial<{ name: string; price: number; validityDays: number | null; isActive: boolean }>;

export interface Announcement {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  isPublished: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string;
  linkUrl: string | null;
  offerText: string | null;
  offerCode: string | null;
  offerUntil: string | null;
  pinned: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export type AnnouncementBody = Partial<{ title: string; body: string; linkUrl: string; imageUrl: string; isPublished: boolean; pinned: boolean; }>;
export type SponsorBody = Partial<{ name: string; logoUrl: string; linkUrl: string; sortOrder: number; isActive: boolean; offerText: string; offerCode: string; offerUntil: string; pinned: boolean; }>;

export type ReservationType = 'COURT' | 'COACHING' | 'TOURNAMENT' | 'EVENT';

export interface ParticipantBill {
  id: string;
  userId: string;
  isOrganizer: boolean;
  firstName: string;
  lastName: string;
  share: string;        // part due de ce joueur
  paid: string;         // déjà encaissé pour ce joueur
  outstanding: string;  // reste dû
}

export interface ClubReservation {
  id: string;
  resourceId: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  type: ReservationType;
  title: string | null;
  totalPrice: string;
  paidAmount: string;
  dueAmount: string;  // dû calculé par le backend (prix ou tarif prorata) — source de vérité
  resource: { id: string; name: string };
  user: { id: string; firstName: string; lastName: string; email: string } | null;
  payments: Payment[];
  participants: ParticipantBill[];
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

// --- Types tournois ---

export type TournamentGender = 'MEN' | 'WOMEN' | 'MIXED';
export type TournamentStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
export type RegistrationStatus = 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';
export type Sex = 'MALE' | 'FEMALE';

export interface Tournament {
  id: string;
  clubId: string;
  clubSportId: string;
  name: string;
  category: string;
  gender: TournamentGender;
  description: string | null;
  contactInfo: string | null;
  startTime: string;
  endTime: string | null;
  registrationDeadline: string;
  maxTeams: number | null;
  entryFee: string | null;
  status: TournamentStatus;
  confirmedCount: number;
  waitlistCount: number;
}

export interface TournamentDetail extends Tournament {
  club: { slug: string; name: string; timezone: string };
  clubSport: { sport: { key: string; name: string } };
}

export interface TournamentRegistrationRecord {
  id: string;
  tournamentId: string;
  captainUserId: string;
  partnerUserId: string;
  status: RegistrationStatus;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentParticipant {
  id: string;
  status: RegistrationStatus;
  captain: { firstName: string; lastName: string; avatarUrl: string | null };
  partner: { firstName: string; lastName: string; avatarUrl: string | null };
}

export interface MyTournamentRegistration {
  id: string;
  status: RegistrationStatus;
  createdAt: string;
  captain: { id: string; firstName: string; lastName: string; email: string; phone: string | null };
  partner: { id: string; firstName: string; lastName: string; email: string; phone: string | null };
  captainLicense: string | null;
  partnerLicense: string | null;
  tournament: Tournament & { club: { slug: string; name: string; timezone: string } };
}

export interface MyProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  sex: Sex | null;
  birthDate: string | null;
  avatarUrl: string | null;
  locale: string | null;
  isSuperAdmin: boolean;
}

export interface ClubMemberSearchResult {
  id: string;
  firstName: string;
  lastName: string;
}

export interface MyClubMembership {
  membershipNo: string | null;
  status: 'ACTIVE' | 'BLOCKED';
  isSubscriber: boolean;
}

export interface AdminRegistration {
  id: string;
  status: RegistrationStatus;
  createdAt: string;
  captain: { id: string; firstName: string; lastName: string; email: string; phone: string | null; sex: Sex | null };
  partner: { id: string; firstName: string; lastName: string; email: string; phone: string | null; sex: Sex | null };
  captainLicense: string | null;
  partnerLicense: string | null;
}

export interface AdminTournamentDetail {
  tournament: Tournament;
  registrations: AdminRegistration[];
}

export type CreateTournamentBody = {
  clubSportId: string;
  name: string;
  category: string;
  gender: TournamentGender;
  description?: string | null;
  contactInfo?: string | null;
  startTime: string;
  endTime?: string | null;
  registrationDeadline: string;
  maxTeams?: number | null;
  entryFee?: number | null;
};
export type UpdateTournamentBody = Partial<CreateTournamentBody & { status: TournamentStatus }>;

// --- Events (animations : mêlées, stages, soirées…) ---

export type ClubEventKind = 'MELEE' | 'STAGE' | 'SOIREE' | 'INITIATION' | 'AUTRE';
export type ClubEventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';

export interface ClubEvent {
  id: string;
  clubId: string;
  name: string;
  kind: ClubEventKind;
  description: string | null;
  startTime: string;
  endTime: string | null;
  registrationDeadline: string;
  capacity: number | null;
  price: string | null;       // Decimal sérialisé — informatif, règlement au club
  memberOnly: boolean;
  status: ClubEventStatus;
  confirmedCount: number;
  waitlistCount: number;
}

export interface ClubEventDetail extends ClubEvent {
  club: { slug: string; name: string; timezone: string };
}

export interface EventRegistrationRecord {
  id: string;
  eventId: string;
  userId: string;
  status: RegistrationStatus;
}

export interface EventParticipant {
  id: string;
  status: RegistrationStatus;
  user: { firstName: string; lastName: string; avatarUrl: string | null };
}

export interface MyEventRegistration {
  id: string;
  status: RegistrationStatus;
  event: ClubEvent & { club: { slug: string; name: string; timezone: string } };
}

export interface AdminEventRegistration {
  id: string;
  status: RegistrationStatus;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string; phone: string | null };
}

export interface AdminEventDetail {
  event: ClubEvent;
  registrations: AdminEventRegistration[];
}

export type CreateEventBody = {
  name: string;
  kind: ClubEventKind;
  description?: string | null;
  startTime: string;
  endTime?: string | null;
  registrationDeadline: string;
  capacity?: number | null;
  price?: number | null;
  memberOnly?: boolean;
};
export type UpdateEventBody = Partial<CreateEventBody & { status: ClubEventStatus }>;

export interface PlatformStats {
  clubs: { total: number; active: number; suspended: number };
  users: number;
  reservations: number;
  tournaments: number;
}

export interface PlatformClub {
  id: string;
  slug: string;
  aliases: string[];
  name: string;
  city: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  owners: { id: string; email: string; firstName: string; lastName: string }[];
  counts: { adherents: number; resources: number };
}

export interface CreateClubByPlatformBody {
  club: { name: string; city?: string; timezone?: string; sportKey?: string };
  owner: { firstName: string; lastName: string; email: string; password: string };
}
