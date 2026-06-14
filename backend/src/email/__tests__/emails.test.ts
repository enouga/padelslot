import { buildOrganizerEmail, buildPlayerEmail, buildVerificationEmail, buildMatchJoinEmail, buildMatchInviteEmail, buildMatchRemovedEmail, buildMatchLeftEmail } from '../templates/emails';
import { escapeHtml, readableTextOn, darken, PALOVA_BRAND } from '../templates/layout';
import { absoluteAsset, clubAppUrl, formatDateFr, formatDateRangeFr } from '../links';
import { Brand } from '../templates/layout';

const brand: Brand = { name: 'Padel Arena', logoUrl: null, accentColor: '#d6ff3f' };

const baseTournament = {
  firstName: 'Jean',
  activityType: 'tournament' as const,
  activityName: 'Open P100',
  clubName: 'Padel Arena',
  dateLabel: 'samedi 12 juillet 2026 à 09h00',
  url: 'https://arena.palova.fr/tournois/t1',
  brand,
  partnerName: 'Marie Martin',
};

describe('buildPlayerEmail', () => {
  it('inscription confirmée : objet + corps avec date, club, coéquipier et lien', () => {
    const mail = buildPlayerEmail({ ...baseTournament, action: 'confirmed' });
    expect(mail.subject).toBe('Inscription confirmée — Open P100');
    expect(mail.html).toContain('Jean');
    expect(mail.html).toContain('Open P100');
    expect(mail.html).toContain('samedi 12 juillet 2026 à 09h00');
    expect(mail.html).toContain('Marie Martin');
    expect(mail.html).toContain('https://arena.palova.fr/tournois/t1');
    expect(mail.html).toContain('Voir le tournoi');
    expect(mail.text).toContain('https://arena.palova.fr/tournois/t1');
  });

  it('liste d attente : objet et mention explicites', () => {
    const mail = buildPlayerEmail({ ...baseTournament, action: 'waitlisted', waitlistPosition: 3 });
    expect(mail.subject).toContain("Liste d'attente");
    expect(mail.html).toContain("liste d'attente");
    expect(mail.html).toContain('position 3');
  });

  it('désinscription : mention annulée', () => {
    const mail = buildPlayerEmail({ ...baseTournament, action: 'cancelled' });
    expect(mail.subject).toContain('Désinscription confirmée');
    expect(mail.html).toContain('annulée');
  });

  it('promotion : message « place libérée »', () => {
    const mail = buildPlayerEmail({ ...baseTournament, action: 'promoted' });
    expect(mail.subject).toContain("place s'est libérée");
    expect(mail.html).toContain('place');
    expect(mail.html).toContain('confirmé');
  });

  it('événement (sans coéquipier) : vocabulaire et lien adaptés', () => {
    const mail = buildPlayerEmail({
      firstName: 'Lucas',
      action: 'confirmed',
      activityType: 'event',
      activityName: 'Mêlée du vendredi',
      clubName: 'Padel Arena',
      dateLabel: 'vendredi 11 juillet 2026 à 19h00',
      url: 'https://arena.palova.fr/events/e1',
      brand,
    });
    expect(mail.html).toContain("l'événement");
    expect(mail.text).toContain("Voir l'événement"); // libellé CTA (apostrophe échappée dans le HTML)
    expect(mail.html).not.toContain('Coéquipier');
  });

  it('échappe le HTML des intitulés dynamiques', () => {
    const mail = buildPlayerEmail({ ...baseTournament, activityName: 'Open <script>', action: 'confirmed' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

describe('buildMatchJoinEmail', () => {
  const base = {
    organizerFirstName: 'Léa', joinerName: 'Marc Dupont', resourceName: 'Court 1',
    dateLabel: 'samedi 12 juillet 2026 à 18h00', clubName: 'Padel Arena', url: 'https://arena.palova.fr/parties', brand,
  };

  it('annonce le joueur, les places restantes et le lien vers les parties', () => {
    const mail = buildMatchJoinEmail({ ...base, spotsLeft: 2 });
    expect(mail.subject).toContain('Marc Dupont');
    expect(mail.html).toContain('Léa');
    expect(mail.html).toContain('Court 1');
    expect(mail.html).toContain('Il reste 2 places');
    expect(mail.html).toContain('https://arena.palova.fr/parties');
    expect(mail.text).toContain('https://arena.palova.fr/parties');
  });

  it('signale une partie complète quand il ne reste plus de place', () => {
    const mail = buildMatchJoinEmail({ ...base, spotsLeft: 0 });
    expect(mail.html).toContain('complète');
  });

  it('échappe le HTML du nom du joueur', () => {
    const mail = buildMatchJoinEmail({ ...base, joinerName: '<script>x', spotsLeft: 1 });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

describe('buildOrganizerEmail', () => {
  it('inscription : récap pour le staff avec noms et statut', () => {
    const mail = buildOrganizerEmail({
      staffFirstName: 'Olivia',
      kind: 'registration',
      activityType: 'tournament',
      activityName: 'Open P100',
      playerNames: 'Jean Dupont & Marie Martin',
      statusLabel: 'confirmée',
      confirmedCount: 7,
      url: 'https://arena.palova.fr/admin/tournaments',
      brand,
    });
    expect(mail.subject).toContain('Nouvelle inscription');
    expect(mail.html).toContain('Jean Dupont &amp; Marie Martin');
    expect(mail.html).toContain('Gérer le tournoi');
    expect(mail.html).toContain('7');
  });

  it('désinscription : objet adapté', () => {
    const mail = buildOrganizerEmail({
      staffFirstName: 'Olivia',
      kind: 'cancellation',
      activityType: 'event',
      activityName: 'Mêlée',
      playerNames: 'Lucas Moreau',
      statusLabel: '',
      url: 'https://arena.palova.fr/admin/events',
      brand,
    });
    expect(mail.subject).toContain('Désinscription');
    expect(mail.html).toContain('désinscrire');
  });
});

describe('buildVerificationEmail', () => {
  const palova: Brand = { ...PALOVA_BRAND, logoUrl: 'https://palova.fr/icon-192.png' };

  it('met le code en avant dans le HTML, le sujet et le texte de repli', () => {
    const mail = buildVerificationEmail('493028', palova);
    expect(mail.subject).toContain('code de validation');
    expect(mail.html).toContain('493028');
    expect(mail.html).toContain('Votre code');
    expect(mail.html).toContain('15 minutes');
    expect(mail.text).toContain('493028'); // repli texte
  });

  it('intègre le logo Palova (URL absolue) dans l en-tête', () => {
    const mail = buildVerificationEmail('000000', palova);
    expect(mail.html).toContain('https://palova.fr/icon-192.png');
    expect(mail.html).toContain('Palova');
  });

  it('échappe un code potentiellement dangereux', () => {
    const mail = buildVerificationEmail('<x>', palova);
    expect(mail.html).not.toContain('<x>');
    expect(mail.html).toContain('&lt;x&gt;');
  });
});

describe('helpers HTML', () => {
  it('escapeHtml neutralise les balises', () => {
    expect(escapeHtml('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });

  it('readableTextOn : texte foncé sur accent clair, clair sur fond foncé', () => {
    expect(readableTextOn('#d6ff3f')).toBe('#0b0b0c'); // lime clair → texte foncé
    expect(readableTextOn('#0b1f3a')).toBe('#ffffff'); // bleu nuit → texte clair
  });

  it('PALOVA_BRAND = bleu primaire du site', () => {
    expect(PALOVA_BRAND.accentColor).toBe('#5e93da');
  });

  it('darken assombrit une couleur (bleu Palova → ~navy)', () => {
    expect(darken('#5e93da', 0.5)).toBe('#2f4a6d');
    expect(darken('#ffffff', 0.5)).toBe('#808080');
    expect(darken('pas-une-couleur')).toBe('pas-une-couleur'); // repli inchangé
  });
});

describe('links', () => {
  it('clubAppUrl construit le sous-domaine du club', () => {
    // En test, FRONTEND_ROOT_DOMAIN n'est pas « palova.fr » → on vérifie juste le slug + chemin.
    const url = clubAppUrl('arena', '/tournois/t1');
    expect(url).toContain('arena');
    expect(url).toContain('/tournois/t1');
  });

  it('absoluteAsset laisse une URL http intacte et préfixe les chemins /uploads', () => {
    expect(absoluteAsset('https://cdn.x/logo.png')).toBe('https://cdn.x/logo.png');
    expect(absoluteAsset('/uploads/logo.png')).toContain('/uploads/logo.png');
    expect(absoluteAsset(null)).toBeNull();
  });

  it('formatDateFr rend une date lisible en français', () => {
    const out = formatDateFr(new Date('2026-07-12T07:00:00.000Z'), 'Europe/Paris');
    expect(out).toContain('juillet');
    expect(out).toContain('2026');
  });

  describe('formatDateRangeFr', () => {
    const start = new Date('2026-07-12T07:00:00.000Z'); // 09h00 Paris
    const tz = 'Europe/Paris';

    it('sans fin : début seul (identique à formatDateFr)', () => {
      expect(formatDateRangeFr(start, null, tz)).toBe(formatDateFr(start, tz));
    });

    it('fin le même jour : ajoute « → HHhmm »', () => {
      const end = new Date('2026-07-12T10:00:00.000Z'); // 12h00 Paris
      const out = formatDateRangeFr(start, end, tz);
      expect(out).toContain('09h00');
      expect(out).toContain('→ 12h00');
    });

    it('fin un autre jour : ajoute « → <date complète> »', () => {
      const end = new Date('2026-07-13T10:00:00.000Z'); // 13 juillet 12h00 Paris
      const out = formatDateRangeFr(start, end, tz);
      expect(out).toContain('→');
      expect(out).toContain('13 juillet');
      expect(out).toContain('12h00');
    });

    it('fin incohérente (≤ début) : ignorée', () => {
      const end = new Date('2026-07-12T06:00:00.000Z'); // avant le début
      expect(formatDateRangeFr(start, end, tz)).toBe(formatDateFr(start, tz));
    });
  });
});

describe('buildMatchInviteEmail', () => {
  const base = {
    recipientFirstName: 'Sophie', resourceName: 'Terrain 2',
    dateLabel: 'samedi 12 juillet 2026 à 18h00', clubName: 'Padel Arena',
    url: 'https://arena.palova.fr/me/reservations', brand,
  };

  it('mentionne qui a ajouté le joueur, le terrain et le lien', () => {
    const mail = buildMatchInviteEmail({ ...base, byName: 'Adam Laurent' });
    expect(mail.subject).toContain('Padel Arena');
    expect(mail.html).toContain('Sophie');
    expect(mail.html).toContain('Adam Laurent');
    expect(mail.html).toContain('Terrain 2');
    expect(mail.html).toContain('samedi 12 juillet 2026 à 18h00');
    expect(mail.html).toContain('https://arena.palova.fr/me/reservations');
    expect(mail.text).toContain('https://arena.palova.fr/me/reservations');
  });

  it('sans byName (rattachement club) : formulation neutre', () => {
    const mail = buildMatchInviteEmail({ ...base, byName: null });
    expect(mail.html).toContain('ajouté');
    expect(mail.html).not.toContain('vous a ajouté'); // pas de « X vous a ajouté » sans nom
  });

  it('échappe le HTML du nom de celui qui ajoute', () => {
    const mail = buildMatchInviteEmail({ ...base, byName: '<script>x' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

describe('buildMatchRemovedEmail', () => {
  it('email au joueur retiré, avec club et lien', () => {
    const m = buildMatchRemovedEmail({ recipientFirstName: 'Léa', resourceName: 'Court 1', dateLabel: 'lun. 16 juin, 18h00 → 19h00', clubName: 'Padel Arena Paris', url: 'https://x/parties', brand: { name: 'Padel Arena Paris', accentColor: '#5e93da', logoUrl: null } });
    expect(m.subject).toContain('Padel Arena Paris');
    expect(m.text).toContain('Court 1');
    expect(m.html).toContain('Léa');
  });
});

describe('buildMatchLeftEmail', () => {
  it('email à l organisateur avec le nom du partant', () => {
    const m = buildMatchLeftEmail({ organizerFirstName: 'Tom', leaverName: 'Léa Martin', resourceName: 'Court 1', dateLabel: 'lun. 16 juin', clubName: 'Padel Arena Paris', spotsLeft: 1, url: 'https://x/parties', brand: { name: 'Padel Arena Paris', accentColor: '#5e93da', logoUrl: null } });
    expect(m.subject).toContain('Léa Martin');
    expect(m.text).toContain('1 place');
  });
});
