# Associer / créer un joueur à l'encaissement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Au moment de l'encaissement (caisse « Vendre une offre » + planning « Encaisser »), rattacher un joueur via un sélecteur réutilisable « rechercher ou créer », avec création de compte à la volée.

**Architecture :** Un composant React **pur** `PlayerPicker` (recherche locale dans le fichier-membres + mini-formulaire de création) branché dans la caisse et le planning. Réutilise `createMember` (route `POST /members/create`) sans toucher au modèle `User`. Une **nouvelle route** `PATCH /reservations/:id/member` (ré)affecte le joueur d'une résa.

**Tech Stack :** Express 5 + Prisma 7 (mock Jest, sans Docker) côté backend ; Next.js 16 + React 19 + RTL côté frontend.

**Spec :** `docs/superpowers/specs/2026-06-14-associer-joueur-encaissement-design.md`

**Branche de travail :** `feat/joueur-encaissement` (déjà créée ; la spec y est commitée).

> ⚠️ L'arbre de travail contient du WIP non commité hors périmètre. **Toujours `git add` uniquement les fichiers listés** dans chaque task — jamais `git add -A`.

---

### Task 1: Backend — `assignReservationMember` (service, TDD)

**Files:**
- Modify: `backend/src/services/reservation.service.ts` (ajouter une méthode après `setReservationType`, ~ligne 615)
- Test: `backend/src/services/__tests__/reservation.service.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter, dans `reservation.service.test.ts`, un nouveau `describe` à l'intérieur du `describe('ReservationService', …)` (par ex. juste avant sa dernière `})`), au même niveau que les autres blocs :

```typescript
  describe('assignReservationMember', () => {
    const resa = { id: 'res-1', resource: { clubId: 'club-1' } };

    it('affecte un membre actif à la résa', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1', status: 'ACTIVE' } as any);
      prismaMock.reservation.update.mockResolvedValue({ id: 'res-1', userId: 'user-1' } as any);

      await service.assignReservationMember('res-1', 'club-1', 'user-1');

      expect(prismaMock.reservation.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'res-1' }, data: { userId: 'user-1' },
      }));
    });

    it('refuse un joueur non membre (MEMBER_NOT_FOUND)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
      await expect(service.assignReservationMember('res-1', 'club-1', 'user-1')).rejects.toThrow('MEMBER_NOT_FOUND');
    });

    it('refuse un membre bloqué (MEMBER_NOT_FOUND)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(resa as any);
      prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1', status: 'BLOCKED' } as any);
      await expect(service.assignReservationMember('res-1', 'club-1', 'user-1')).rejects.toThrow('MEMBER_NOT_FOUND');
    });

    it('refuse une résa d’un autre club (CLUB_MISMATCH)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue({ id: 'res-1', resource: { clubId: 'autre' } } as any);
      await expect(service.assignReservationMember('res-1', 'club-1', 'user-1')).rejects.toThrow('CLUB_MISMATCH');
    });

    it('refuse une résa inconnue (RESERVATION_NOT_FOUND)', async () => {
      prismaMock.reservation.findUnique.mockResolvedValue(null as any);
      await expect(service.assignReservationMember('res-1', 'club-1', 'user-1')).rejects.toThrow('RESERVATION_NOT_FOUND');
    });
  });
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd backend && npm test -- reservation.service`
Expected: FAIL — `service.assignReservationMember is not a function`.

- [ ] **Step 3: Implémenter la méthode**

Dans `backend/src/services/reservation.service.ts`, juste après la méthode `setReservationType` (qui se termine ~ligne 615), ajouter :

```typescript
  /**
   * (Ré)affecte le joueur d'une réservation — action admin au comptoir, pour
   * associer un joueur à l'encaissement. Le joueur doit être membre ACTIF du
   * club. Pas de re-check quota (cohérent avec le bypass admin de
   * adminCreateReservation).
   */
  async assignReservationMember(reservationId: string, clubId: string, memberUserId: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { resource: { select: { clubId: true } } },
    });
    if (!reservation)                           throw new Error('RESERVATION_NOT_FOUND');
    if (reservation.resource.clubId !== clubId) throw new Error('CLUB_MISMATCH');

    const membership = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: memberUserId, clubId } },
    });
    if (!membership || membership.status === 'BLOCKED') throw new Error('MEMBER_NOT_FOUND');

    return prisma.reservation.update({ where: { id: reservationId }, data: { userId: memberUserId } });
  }
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd backend && npm test -- reservation.service`
Expected: PASS (anciens + 5 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/reservation.service.ts backend/src/services/__tests__/reservation.service.test.ts
git commit -m "feat(caisse): assignReservationMember - rattacher un joueur a une resa"
```

---

### Task 2: Backend — route `PATCH /reservations/:id/member` (TDD)

**Files:**
- Modify: `backend/src/routes/admin.ts` (ajouter la route après le `PATCH /reservations/:id` existant, ~ligne 286)
- Test: `backend/src/routes/__tests__/admin.reservations.routes.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `admin.reservations.routes.test.ts` (après le dernier `describe`) :

```typescript
describe('PATCH /api/clubs/:clubId/admin/reservations/:id/member', () => {
  const murl = `${url}/res-1/member`;

  it('200 affecte un membre actif', async () => {
    asMember();
    prismaMock.reservation.findUnique.mockResolvedValue({ id: 'res-1', resource: { clubId: 'club-demo' } } as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue({ id: 'mb-1', status: 'ACTIVE' } as any);
    prismaMock.reservation.update.mockResolvedValue({ id: 'res-1', userId: 'user-1' } as any);
    const res = await request(app).patch(murl).set('Authorization', `Bearer ${token}`).send({ memberUserId: 'user-1' });
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user-1');
  });

  it('400 si memberUserId manquant', async () => {
    asMember();
    const res = await request(app).patch(murl).set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });

  it('404 MEMBER_NOT_FOUND si le joueur n’est pas membre', async () => {
    asMember();
    prismaMock.reservation.findUnique.mockResolvedValue({ id: 'res-1', resource: { clubId: 'club-demo' } } as any);
    prismaMock.clubMembership.findUnique.mockResolvedValue(null as any);
    const res = await request(app).patch(murl).set('Authorization', `Bearer ${token}`).send({ memberUserId: 'user-1' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('MEMBER_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd backend && npm test -- admin.reservations`
Expected: FAIL — la route renvoie 404 « not found » Express (route inexistante) au lieu de 200/400/404 attendus.

- [ ] **Step 3: Ajouter la route**

Dans `backend/src/routes/admin.ts`, juste après le handler `router.patch('/reservations/:id', …)` (se termine ~ligne 286), ajouter :

```typescript
// (Ré)affecte le joueur d'une réservation (associer un joueur à l'encaissement).
router.patch('/reservations/:id/member', async (req: ClubScopedRequest, res: Response, next: NextFunction) => {
  try {
    const memberUserId = asString(req.body.memberUserId);
    if (!memberUserId) return void res.status(400).json({ error: 'memberUserId requis' });
    const updated = await reservationService.assignReservationMember(
      asString(req.params.id), req.membership!.clubId, memberUserId,
    );
    res.json(updated);
  } catch (err) { handleError(err, res, next); }
});
```

(`MEMBER_NOT_FOUND`, `CLUB_MISMATCH`, `RESERVATION_NOT_FOUND` sont déjà dans `ERROR_STATUS`.)

- [ ] **Step 4: Vérifier que les tests passent + compilation**

Run: `cd backend && npm test -- admin.reservations && npx tsc --noEmit`
Expected: PASS, compilation OK.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.ts backend/src/routes/__tests__/admin.reservations.routes.test.ts
git commit -m "feat(caisse): route PATCH /reservations/:id/member"
```

---

### Task 3: Frontend — client API `adminAssignReservationMember`

**Files:**
- Modify: `frontend/lib/api.ts` (après `adminAddPayment`, ~ligne 179)

- [ ] **Step 1: Ajouter la méthode**

Dans `frontend/lib/api.ts`, juste après `adminAddPayment: (…) => …,` ajouter :

```typescript
  adminAssignReservationMember: (clubId: string, reservationId: string, memberUserId: string, token: string) =>
    request<ClubReservation>(`/api/clubs/${clubId}/admin/reservations/${reservationId}/member`, { method: 'PATCH', body: JSON.stringify({ memberUserId }) }, token),
```

(`ClubReservation` et `CreateMemberBody` sont déjà exportés par ce fichier.)

- [ ] **Step 2: Vérifier la compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: OK (aucune nouvelle erreur).

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(caisse): api.adminAssignReservationMember"
```

---

### Task 4: Frontend — composant `PlayerPicker` (TDD, RTL)

**Files:**
- Create: `frontend/components/admin/PlayerPicker.tsx`
- Test: `frontend/__tests__/PlayerPicker.test.tsx`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/__tests__/PlayerPicker.test.tsx` :

```tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../lib/ThemeProvider';
import { PlayerPicker } from '../components/admin/PlayerPicker';
import type { Member } from '../lib/api';

const members: Member[] = [
  { id: 'mb-1', userId: 'u-1', firstName: 'Jean', lastName: 'Dupont', email: 'jean@x.fr', phone: null, isSubscriber: false, membershipNo: null, status: 'ACTIVE', note: null },
  { id: 'mb-2', userId: 'u-2', firstName: 'Marie', lastName: 'Curie', email: 'marie@x.fr', phone: null, isSubscriber: false, membershipNo: null, status: 'ACTIVE', note: null },
];

function setup(over: Partial<React.ComponentProps<typeof PlayerPicker>> = {}) {
  const onSelect = jest.fn();
  const onClear  = jest.fn();
  const onCreate = jest.fn().mockResolvedValue({ tempPassword: 'abc12345', existed: false });
  render(
    <ThemeProvider>
      <PlayerPicker members={members} value={null} onSelect={onSelect} onClear={onClear} onCreate={onCreate} {...over} />
    </ThemeProvider>,
  );
  return { onSelect, onClear, onCreate };
}

describe('PlayerPicker', () => {
  it('filtre les membres et sélectionne au clic', () => {
    const { onSelect } = setup();
    fireEvent.change(screen.getByPlaceholderText('Rechercher un joueur…'), { target: { value: 'mar' } });
    fireEvent.click(screen.getByText(/Marie Curie/));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-2' }));
  });

  it('affiche le joueur sélectionné et « Changer » appelle onClear', () => {
    const { onClear } = setup({ value: { firstName: 'Jean', lastName: 'Dupont' } });
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Changer'));
    expect(onClear).toHaveBeenCalled();
  });

  it('pré-remplit le formulaire de création depuis la recherche', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText('Rechercher un joueur…'), { target: { value: 'Paul Martin' } });
    fireEvent.click(screen.getByText('+ Créer un joueur'));
    expect((screen.getByLabelText('Prénom') as HTMLInputElement).value).toBe('Paul');
    expect((screen.getByLabelText('Nom') as HTMLInputElement).value).toBe('Martin');
  });

  it('refuse la création sans email', () => {
    const { onCreate } = setup();
    fireEvent.click(screen.getByText('+ Créer un joueur'));
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Paul' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Martin' } });
    fireEvent.click(screen.getByText('Créer le joueur'));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/requis/)).toBeInTheDocument();
  });

  it('crée un joueur et affiche le mot de passe temporaire', async () => {
    const { onCreate } = setup();
    fireEvent.click(screen.getByText('+ Créer un joueur'));
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Paul' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Martin' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'paul@x.fr' } });
    fireEvent.click(screen.getByText('Créer le joueur'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Paul', lastName: 'Martin', email: 'paul@x.fr' }),
    ));
    expect(await screen.findByText(/mot de passe temporaire à transmettre : abc12345/)).toBeInTheDocument();
  });

  it('message « rattaché » si le compte existait déjà', async () => {
    const onCreate = jest.fn().mockResolvedValue({ tempPassword: null, existed: true });
    setup({ onCreate });
    fireEvent.click(screen.getByText('+ Créer un joueur'));
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Paul' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Martin' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'paul@x.fr' } });
    fireEvent.click(screen.getByText('Créer le joueur'));
    expect(await screen.findByText(/rattaché au club/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd frontend && npm test -- PlayerPicker`
Expected: FAIL — `Cannot find module '../components/admin/PlayerPicker'`.

- [ ] **Step 3: Implémenter le composant**

Créer `frontend/components/admin/PlayerPicker.tsx` :

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { Member, CreateMemberBody } from '@/lib/api';
import { useTheme } from '@/lib/ThemeProvider';

export interface PlayerPickerProps {
  members: Member[];
  value: { firstName: string; lastName: string } | null;
  onSelect: (m: Member) => void;
  onClear: () => void;
  onCreate: (body: CreateMemberBody) => Promise<{ tempPassword: string | null; existed: boolean }>;
  placeholder?: string;
}

// "Jean Dupont" → { firstName: 'Jean', lastName: 'Dupont' } ; un seul mot → prénom.
function splitName(q: string): { firstName: string; lastName: string } {
  const parts = q.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function PlayerPicker({ members, value, onSelect, onClear, onCreate, placeholder }: PlayerPickerProps) {
  const { th } = useTheme();
  const [query, setQuery]           = useState('');
  const [editing, setEditing]       = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [creating, setCreating]     = useState(false);
  const [createErr, setCreateErr]   = useState<string | null>(null);
  const [createMsg, setCreateMsg]   = useState<string | null>(null);

  const valueKey = value ? `${value.firstName} ${value.lastName}` : '';
  // Changement de cible (autre résa / réinit) : on repart en mode « chip ».
  useEffect(() => { setEditing(false); setShowCreate(false); }, [valueKey]);

  const showChip = !!value && !editing;

  const matches = !showChip && !showCreate && query.trim().length > 0
    ? members.filter((m) => `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  const pick = (m: Member) => { setQuery(''); setEditing(false); setCreateMsg(null); onSelect(m); };

  const openCreate = () => {
    const { firstName, lastName } = splitName(query);
    setForm({ firstName, lastName, email: '', phone: '' });
    setCreateErr(null);
    setShowCreate(true);
  };

  const submitCreate = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setCreateErr('Prénom, nom et email sont requis.');
      return;
    }
    setCreating(true);
    try {
      setCreateErr(null);
      const r = await onCreate({
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        email:     form.email.trim(),
        phone:     form.phone.trim() || undefined,
      });
      setCreateMsg(r.existed
        ? 'Ce joueur avait déjà un compte — rattaché au club.'
        : `Compte créé — mot de passe temporaire à transmettre : ${r.tempPassword ?? '—'}`);
      setShowCreate(false);
      setEditing(false);
      setQuery('');
    } catch (e) {
      setCreateErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const input = { border: `1px solid ${th.line}`, background: th.bg, color: th.text, borderRadius: 8, padding: '8px 10px', fontFamily: th.fontUI, fontSize: 14 } as const;

  return (
    <div style={{ position: 'relative' }}>
      {showChip ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${th.line}`, borderRadius: 8, padding: '8px 10px' }}>
          <span style={{ flex: 1, fontFamily: th.fontUI, fontSize: 14, color: th.text }}>{value!.firstName} {value!.lastName}</span>
          <button type="button" onClick={() => { setEditing(true); setQuery(''); onClear(); }}
            style={{ border: 'none', background: th.surface2, cursor: 'pointer', borderRadius: 8, padding: '3px 8px', color: th.textMute, fontSize: 12 }}>Changer</button>
        </div>
      ) : showCreate ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: `1px solid ${th.line}`, borderRadius: 10, padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input aria-label="Prénom" placeholder="Prénom" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={{ ...input, flex: 1, minWidth: 120 }} />
            <input aria-label="Nom" placeholder="Nom" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={{ ...input, flex: 1, minWidth: 120 }} />
          </div>
          <input aria-label="Email" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
          <input aria-label="Téléphone" placeholder="Téléphone (optionnel)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
          {createErr && <div style={{ color: '#ff7a4d', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600 }}>{createErr}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={submitCreate} disabled={creating}
              style={{ border: 'none', background: th.accent, color: '#fff', borderRadius: 9, padding: '7px 13px', cursor: 'pointer', fontFamily: th.fontUI, fontSize: 13, fontWeight: 600 }}>{creating ? 'Création…' : 'Créer le joueur'}</button>
            <button type="button" onClick={() => setShowCreate(false)}
              style={{ border: 'none', background: 'transparent', color: th.textMute, cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5 }}>Annuler</button>
          </div>
        </div>
      ) : (
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder ?? 'Rechercher un joueur…'}
          style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
      )}

      {matches.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: th.surface, border: `1px solid ${th.line}`, borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: th.shadowSoft }}>
          {matches.map((m) => (
            <button key={m.userId} type="button" onClick={() => pick(m)}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 10px', fontFamily: th.fontUI, fontSize: 13.5, color: th.text }}>
              {m.firstName} {m.lastName} <span style={{ color: th.textFaint }}>· {m.email}</span>
            </button>
          ))}
        </div>
      )}

      {!showChip && !showCreate && (
        <button type="button" onClick={openCreate}
          style={{ marginTop: 6, border: 'none', background: 'transparent', color: th.accent, cursor: 'pointer', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600, padding: 0 }}>
          + Créer un joueur
        </button>
      )}

      {createMsg && (
        <div style={{ marginTop: 8, background: `${th.accent}22`, color: th.text, borderRadius: 10, padding: '8px 11px', fontFamily: th.fontUI, fontSize: 12.5, fontWeight: 600 }}>{createMsg}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd frontend && npm test -- PlayerPicker`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/admin/PlayerPicker.tsx frontend/__tests__/PlayerPicker.test.tsx
git commit -m "feat(caisse): composant PlayerPicker (rechercher ou creer un joueur)"
```

---

### Task 5: Frontend — brancher `PlayerPicker` dans la caisse

**Files:**
- Modify: `frontend/app/admin/caisse/page.tsx`

- [ ] **Step 1: Imports**

Ligne 3, ajouter `CreateMemberBody` à l'import `@/lib/api` :

```tsx
import { api, CaisseSummary, CaissePayment, Member, MemberPackage, PackageTemplate, PaymentMethod, CreateMemberBody } from '@/lib/api';
```

Après la ligne 8 (`import { Btn } …`), ajouter :

```tsx
import { PlayerPicker } from '@/components/admin/PlayerPicker';
```

- [ ] **Step 2: Supprimer l'état `query` devenu inutile**

Supprimer la ligne 46 :

```tsx
  const [query, setQuery]         = useState('');
```

- [ ] **Step 3: Mettre à jour `pickBuyer` et ajouter `createBuyer`**

Remplacer la fonction `pickBuyer` (lignes 75-80) par :

```tsx
  const pickBuyer = async (m: Member) => {
    if (!token || !clubId) return;
    setBuyer(m);
    try { setBuyerPackages(await api.adminGetMemberPackages(clubId, m.userId, token)); }
    catch (e) { setError((e as Error).message); }
  };

  // Création d'un joueur à la volée : crée le compte+adhésion, recharge le
  // fichier-membres, puis sélectionne le nouvel acheteur.
  const createBuyer = async (body: CreateMemberBody) => {
    if (!token || !clubId) return { tempPassword: null, existed: false };
    const r = await api.adminCreateMember(clubId, body, token);
    const mem = await api.adminGetMembers(clubId, token);
    setMembers(mem);
    const created = mem.find((m) => m.email.toLowerCase() === body.email.toLowerCase());
    if (created) await pickBuyer(created);
    return r;
  };
```

- [ ] **Step 4: Supprimer le calcul `matches`**

Supprimer les lignes 108-110 :

```tsx
  const matches = query.trim().length > 0 && !buyer
    ? members.filter((m) => `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];
```

- [ ] **Step 5: Remplacer le bloc de recherche acheteur par `PlayerPicker`**

Remplacer le bloc lignes 159-178 (de `<div style={{ position: 'relative', marginBottom: 12 }}>` jusqu'à son `</div>` fermant inclus) par :

```tsx
          <div style={{ marginBottom: 12 }}>
            <PlayerPicker
              members={members}
              value={buyer ? { firstName: buyer.firstName, lastName: buyer.lastName } : null}
              onSelect={pickBuyer}
              onClear={() => { setBuyer(null); setBuyerPackages([]); }}
              onCreate={createBuyer}
              placeholder="Rechercher un membre…"
            />
          </div>
```

- [ ] **Step 6: Compiler + suite de tests frontend**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: compilation OK (aucune variable `query`/`matches` orpheline), tous les tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/admin/caisse/page.tsx
git commit -m "feat(caisse): PlayerPicker dans la vente d'offre (rechercher/creer un joueur)"
```

---

### Task 6: Frontend — brancher `PlayerPicker` dans le planning

**Files:**
- Modify: `frontend/app/admin/planning/page.tsx`

- [ ] **Step 1: Imports**

Ligne 3, ajouter `CreateMemberBody` à l'import `@/lib/api` :

```tsx
import { api, AdminResource, ClubReservation, ReservationType, PaymentMethod, OffPeakHours, Member, MemberPackage, CreateMemberBody } from '@/lib/api';
```

Après la ligne 8 (`import { PaymentDots, SETTLED_COLOR } …`), ajouter :

```tsx
import { PlayerPicker } from '@/components/admin/PlayerPicker';
```

- [ ] **Step 2: Remplacer l'état du membre du formulaire de création**

Remplacer les lignes 104-105 :

```tsx
  const [cMemberId, setCMemberId] = useState<string | null>(null);
  const [cMemberQuery, setCMemberQuery] = useState('');
```

par :

```tsx
  const [cMember, setCMember] = useState<Member | null>(null);
```

- [ ] **Step 3: Ajouter les handlers d'affectation et de création**

Juste après la fonction `payWithPackage` (se termine ~ligne 282), ajouter :

```tsx
  // Associer / changer le joueur de la résa sélectionnée (au comptoir).
  const assignPlayer = async (m: Member) => {
    if (!token || !clubId || !selected) return;
    setBusy(true);
    try {
      setError(null);
      await api.adminAssignReservationMember(clubId, selected.id, m.userId, token);
      setSelected({ ...selected, user: { id: m.userId, firstName: m.firstName, lastName: m.lastName, email: m.email } });
      const pkgs = await api.adminGetMemberPackages(clubId, m.userId, token).catch(() => []);
      setSelPackages(pkgs.filter((p) => isUsable(p)));
      await load();
    } catch (e) {
      setError((e as Error).message === 'MEMBER_NOT_FOUND' ? "Ce joueur n'est pas membre actif du club." : (e as Error).message);
    } finally { setBusy(false); }
  };

  // Création à la volée + affectation (panneau Encaisser).
  const createAndAssign = async (body: CreateMemberBody) => {
    if (!token || !clubId) return { tempPassword: null, existed: false };
    const r = await api.adminCreateMember(clubId, body, token);
    const mem = await api.adminGetMembers(clubId, token);
    setMembers(mem);
    const created = mem.find((m) => m.email.toLowerCase() === body.email.toLowerCase());
    if (created) await assignPlayer(created);
    return r;
  };

  // Création à la volée + sélection (formulaire de création de résa).
  const createForResa = async (body: CreateMemberBody) => {
    if (!token || !clubId) return { tempPassword: null, existed: false };
    const r = await api.adminCreateMember(clubId, body, token);
    const mem = await api.adminGetMembers(clubId, token);
    setMembers(mem);
    const created = mem.find((m) => m.email.toLowerCase() === body.email.toLowerCase());
    if (created) setCMember(created);
    return r;
  };
```

- [ ] **Step 4: Mettre à jour `openCreate`, `submitCreate` et supprimer `memberMatches`**

Dans `openCreate` (ligne 293), remplacer :

```tsx
    setCTitle(''); setCMemberId(null); setCMemberQuery(''); setCPrice('');
```

par :

```tsx
    setCTitle(''); setCMember(null); setCPrice('');
```

Dans `submitCreate` (ligne 309), remplacer :

```tsx
        memberUserId: cMemberId ?? undefined,
```

par :

```tsx
        memberUserId: cMember?.userId ?? undefined,
```

Supprimer le calcul `memberMatches` (lignes 318-320) :

```tsx
  const memberMatches = cMemberQuery.trim().length > 0 && !cMemberId
    ? members.filter((m) => `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(cMemberQuery.toLowerCase())).slice(0, 6)
    : [];
```

- [ ] **Step 5: Insérer le `PlayerPicker` dans le panneau « Encaisser »**

Dans le rendu, juste avant le commentaire `{/* encaissement rapide */}` (ligne 514), insérer :

```tsx
            {/* joueur rattaché à la résa (associer à l'encaissement) */}
            {selected.status !== 'CANCELLED' && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: th.textMute, marginBottom: 4 }}>Joueur</div>
                <PlayerPicker
                  members={members}
                  value={selected.user ? { firstName: selected.user.firstName, lastName: selected.user.lastName } : null}
                  onSelect={assignPlayer}
                  onClear={() => {}}
                  onCreate={createAndAssign}
                  placeholder="Rechercher un membre…"
                />
              </div>
            )}

```

- [ ] **Step 6: Remplacer le bloc « Membre (optionnel) » du formulaire de création**

Remplacer le bloc lignes 660-681 (de `<div style={{ marginTop: 12, position: 'relative' }}>` jusqu'au `</div>` fermant à la ligne 681) par :

```tsx
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: th.textMute, marginBottom: 4 }}>Membre (optionnel)</div>
              <PlayerPicker
                members={members}
                value={cMember}
                onSelect={setCMember}
                onClear={() => setCMember(null)}
                onCreate={createForResa}
                placeholder="Rechercher un membre…"
              />
            </div>
```

- [ ] **Step 7: Compiler + suite de tests frontend**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: compilation OK (plus aucune référence à `cMemberId`/`cMemberQuery`/`memberMatches`), tous les tests PASS.

> Si un test du planning mocke `@/lib/api`, ajouter `adminAssignReservationMember: jest.fn()` au mock. (À la date d'écriture, aucun test ne rend la page planning — vérifier via le run ci-dessus.)

- [ ] **Step 8: Commit**

```bash
git add frontend/app/admin/planning/page.tsx
git commit -m "feat(caisse): PlayerPicker au planning (encaisser + creation de resa)"
```

---

### Task 7: Vérification finale

- [ ] **Step 1: Backend complet**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: compilation OK, toute la suite PASS.

- [ ] **Step 2: Frontend complet**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: compilation OK, toute la suite PASS.

- [ ] **Step 3: Revue manuelle (optionnelle mais recommandée)**

Avec backend + frontend lancés (`docker-compose-v1.exe up -d`, puis `npm run dev` dans chaque dossier), sur un sous-domaine club admin :
- `/admin/caisse` → « Vendre une offre » : rechercher un membre, puis « + Créer un joueur » → vente OK, mot de passe temporaire affiché.
- `/admin/planning` → cliquer une résa sans joueur → panneau Encaisser → rattacher un joueur (existant puis créé) → les boutons carnet/porte-monnaie du joueur apparaissent.
- `/admin/planning` → « Ajouter » → créer un joueur depuis le formulaire de résa.

- [ ] **Step 4: Commit final éventuel** (si des ajustements de mocks de tests ont été nécessaires)

```bash
git add <fichiers de test ajustés>
git commit -m "test(caisse): ajustements mocks PlayerPicker/assignReservationMember"
```

---

## Notes d'implémentation

- **DRY :** `PlayerPicker` remplace 3 blocs de recherche-membre quasi identiques (caisse, planning ×1, + le nouveau panneau Encaisser).
- **Sélection après création :** le composant reste pur — c'est la page qui, dans `onCreate`, recharge `members` et sélectionne le nouveau joueur (par email). Le composant n'affiche que le message de mot de passe temporaire renvoyé.
- **YAGNI :** pas de dé-rattachement, pas de walk-in sans email, pas de connexion immédiate (`emailVerified` inchangé) — cf. spec.
