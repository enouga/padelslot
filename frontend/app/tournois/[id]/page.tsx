'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClub } from '@/lib/ClubProvider';
import { useTheme } from '@/lib/ThemeProvider';
import { useAuth } from '@/lib/useAuth';
import { api, TournamentDetail, MyProfile, MyTournamentRegistration, MyClubMembership, TournamentParticipant } from '@/lib/api';
import { Screen } from '@/components/ui/Screen';
import { Icon } from '@/components/ui/Icon';
import { ClubNav } from '@/components/ClubNav';
import { TournamentHero, MetaCards } from '@/components/tournament/TournamentHero';
import { TournamentTimeline } from '@/components/tournament/TournamentTimeline';
import { TeamsGrid } from '@/components/tournament/TeamsGrid';
import { ShareActions } from '@/components/tournament/ShareActions';
import { MyRegistrationCard } from '@/components/tournament/MyRegistrationCard';
import { ProfileCompletion } from '@/components/tournament/ProfileCompletion';
import { PartnerSearch } from '@/components/tournament/PartnerSearch';
import { timelineSteps, waitlistPosition } from '@/lib/tournament';

const ERROR_FR: Record<string, string> = {
  TOURNAMENT_NOT_OPEN: 'Les inscriptions ne sont pas ouvertes.',
  REGISTRATION_CLOSED: 'Les inscriptions sont closes.',
  REGISTRATION_LOCKED: 'La date limite de modification est dépassée.',
  PARTNER_NOT_FOUND: "Aucun coéquipier trouvé (il doit avoir un compte actif et être membre du club).",
  PARTNER_IS_SELF: 'Vous ne pouvez pas être votre propre coéquipier.',
  MEMBERSHIP_REQUIRED: "{who} n'est pas membre du club.",
  MEMBERSHIP_BLOCKED: '{who} est bloqué(e) par le club.',
  PHONE_REQUIRED: "{who} doit renseigner un numéro de téléphone.",
  LICENSE_REQUIRED: "{who} doit renseigner un numéro de licence.",
  SEX_REQUIRED: '{who} doit renseigner son sexe dans son profil.',
  GENDER_MISMATCH: "La composition du binôme ne correspond pas à la catégorie du tournoi.",
  ALREADY_REGISTERED: "Un des deux joueurs est déjà inscrit à ce tournoi.",
};

function messageFor(err: unknown): string {
  const e = err as { message?: string; subject?: string };
  const tmpl = ERROR_FR[e.message ?? ''] ?? e.message ?? 'Une erreur est survenue.';
  const who = e.subject === 'partner' ? 'Votre coéquipier' : 'Vous';
  return tmpl.replace('{who}', who);
}

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { club } = useClub();
  const { th } = useTheme();
  const router = useRouter();
  const { token, ready } = useAuth();

  const [t, setT] = useState<TournamentDetail | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  // undefined = en cours de chargement ; null = pas membre de ce club ; sinon l'adhésion.
  const [membership, setMembership] = useState<MyClubMembership | null | undefined>(undefined);
  const [myReg, setMyReg] = useState<MyTournamentRegistration | null>(null);
  const [partner, setPartner] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [participants, setParticipants] = useState<TournamentParticipant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Horloge unique de la page : null au premier rendu (hydration-safe), puis tick chaque minute.
  const [now, setNow] = useState<Date | null>(null);

  const load = () => api.getTournament(id).then(setT).catch(() => setT(null));
  const loadParticipants = () => api.getTournamentParticipants(id).then(setParticipants).catch(() => setParticipants([]));
  useEffect(() => { load(); loadParticipants(); }, [id]);
  useEffect(() => {
    const tick = () => setNow(new Date());
    // 1er tick différé après le paint : pas de setState synchrone dans l'effet,
    // et la jauge du hero part bien de 0 avant sa transition.
    const t = setTimeout(tick, 0);
    const h = setInterval(tick, 60_000);
    return () => { clearTimeout(t); clearInterval(h); };
  }, []);
  useEffect(() => {
    if (!ready || !token) return;
    api.getMyProfile(token).then(setProfile).catch(() => {});
    api.getMyTournaments(token).then((rs) => setMyReg(rs.find((r) => r.tournament.id === id) ?? null)).catch(() => {});
    if (club) api.getMyClubMembership(club.slug, token).then(setMembership).catch(() => setMembership(null));
  }, [ready, token, id, club?.slug]);

  if (!t || !club) {
    return <div style={{ minHeight: '100vh', background: th.bg, color: th.textFaint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: th.fontUI }}>Chargement…</div>;
  }

  const closed = new Date(t.registrationDeadline) <= new Date();
  const full = t.maxTeams != null && t.confirmedCount >= t.maxTeams;
  // On attend que profil ET adhésion soient chargés. Si le joueur n'est pas membre (membership null),
  // on ne bloque pas ici : l'inscription renverra MEMBERSHIP_REQUIRED.
  const profileIncomplete =
    !!token && profile != null && membership !== undefined && membership !== null &&
    (!profile.phone || !profile.sex || !membership.membershipNo);

  const saveProfile = async (phone: string, sex: 'MALE' | 'FEMALE', license: string) => {
    if (!token || !club) return;
    setBusy(true); setError(null);
    try {
      const [p, m] = await Promise.all([
        api.updateMyProfile({ phone, sex }, token),
        api.updateMyClubMembership(club.slug, license, token),
      ]);
      setProfile(p);
      setMembership(m);
    } catch (e) { setError(messageFor(e)); }
    finally { setBusy(false); }
  };

  const register = async () => {
    if (!token) { router.push('/login'); return; }
    if (!partner) return;
    setBusy(true); setError(null);
    try {
      await api.registerTournament(id, partner.id, token);
      setPartner(null);
      await load();
      loadParticipants();
      const rs = await api.getMyTournaments(token);
      setMyReg(rs.find((r) => r.tournament.id === id) ?? null);
    } catch (e) { setError(messageFor(e)); }
    finally { setBusy(false); }
  };

  const changePartner = async () => {
    if (!token || !partner) return;
    setBusy(true); setError(null);
    try {
      await api.changeTournamentPartner(id, partner.id, token);
      setPartner(null);
      loadParticipants();
      const rs = await api.getMyTournaments(token);
      setMyReg(rs.find((r) => r.tournament.id === id) ?? null);
    } catch (e) { setError(messageFor(e)); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!token) return;
    setBusy(true); setError(null);
    try {
      await api.cancelTournamentRegistration(id, token);
      setMyReg(null);
      await load();
      loadParticipants();
    } catch (e) { setError(messageFor(e)); }
    finally { setBusy(false); }
  };

  const primaryBtn = { border: 'none', cursor: 'pointer', background: th.accent, color: th.onAccent, borderRadius: 11, padding: '12px 16px', fontFamily: th.fontUI, fontWeight: 700, fontSize: 14.5, opacity: busy ? 0.6 : 1 };

  return (
    <Screen>
      <div style={{ paddingBottom: 48 }}>
        <ClubNav club={club} />

        <div style={{ padding: '14px 20px 0' }}>
          <button onClick={() => router.push('/tournois')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: th.fontUI, fontSize: 13, fontWeight: 600, color: th.textMute, padding: 0 }}>
            <Icon name="chevL" size={16} color={th.textMute} />Tous les tournois
          </button>
        </div>

        <TournamentHero t={t} now={now} />
        <MetaCards t={t} />
        <ShareActions item={t} uidPrefix="tournament" />
        {now && <TournamentTimeline steps={timelineSteps(t, now)} tz={t.club.timezone} />}

        {t.description && (
          <p style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute, margin: 0, padding: '18px 20px 0', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{t.description}</p>
        )}

        <div style={{ padding: '24px 20px 0' }}>
          {error && <div style={{ background: '#3a1d1d', color: '#ff6b6b', borderRadius: 11, padding: '11px 13px', fontFamily: th.fontUI, fontSize: 13.5, marginBottom: 14 }}>{error}</div>}

          {/* Non connecté */}
          {ready && !token && (
            <button onClick={() => router.push('/login')} style={primaryBtn}>Se connecter pour s&apos;inscrire</button>
          )}

          {/* Déjà inscrit */}
          {token && myReg && (
            <MyRegistrationCard
              myReg={myReg} profileId={profile?.id} closed={closed} busy={busy}
              waitlistPos={participants ? waitlistPosition(participants, myReg.id) : null}
              slug={club.slug} token={token}
              partner={partner} onSelectPartner={setPartner} onClearPartner={() => setPartner(null)}
              onChangePartner={changePartner} onCancel={cancel}
            />
          )}

          {/* Pas encore inscrit, inscriptions ouvertes */}
          {token && !myReg && !closed && (
            <div>
              {profileIncomplete && (
                <ProfileCompletion busy={busy} initialPhone={profile?.phone ?? ''} initialSex={profile?.sex ?? ''} initialLicense={membership?.membershipNo ?? ''} onSave={saveProfile} />
              )}
              {full && <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginBottom: 10 }}>Tournoi complet : votre binôme sera placé en liste d&apos;attente.</div>}
              <div style={{ fontFamily: th.fontUI, fontSize: 13, color: th.textMute, marginBottom: 8, lineHeight: 1.5 }}>
                Votre coéquipier doit être membre du club et avoir renseigné téléphone, licence et sexe.
              </div>
              <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textMute, marginBottom: 6 }}>Coéquipier (recherche par nom)</div>
              <PartnerSearch key="register-partner-search" slug={club.slug} token={token} selected={partner} onSelect={setPartner} onClear={() => setPartner(null)} disabled={busy} />
              <button onClick={register} disabled={busy || !partner || profileIncomplete} style={{ ...primaryBtn, marginTop: 8 }}>S&apos;inscrire</button>
              {profileIncomplete && <div style={{ fontFamily: th.fontUI, fontSize: 12.5, color: th.textFaint, marginTop: 8 }}>Complétez votre profil ci-dessus pour pouvoir vous inscrire.</div>}
            </div>
          )}

          {token && !myReg && closed && (
            <div style={{ fontFamily: th.fontUI, fontSize: 14, color: th.textMute }}>Les inscriptions pour ce tournoi sont closes.</div>
          )}
        </div>

        {/* Liste publique des inscrits */}
        <div style={{ padding: '28px 0 0' }}>
          <div style={{ fontFamily: th.fontDisplay, fontWeight: 600, fontSize: 18, color: th.text, marginBottom: 12, padding: '0 20px' }}>Inscrits</div>
          <TeamsGrid participants={participants} myRegId={myReg?.id} />
        </div>
      </div>
    </Screen>
  );
}
