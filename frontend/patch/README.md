# Palova — Mise en place (identité + sélecteur de dates B)

Recopiez le contenu de ce dossier `patch/` dans votre `frontend/` (les chemins sont identiques).
Aucune dépendance à installer : tout utilise Tailwind v4 + les polices Google déjà importées dans `globals.css`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `app/globals.css` | **Palette Palova** (brand bleu, navy, apricot, paper/ink) + polices Hanken / Cormorant / JetBrains Mono comme tokens Tailwind. |
| `components/Logo.tsx` | Logo réutilisable — `<Logo />` (mark + wordmark) ou `<Logo variant="mark" />`. Props : `size`, `tone="ink"|"light"`. |
| `components/DateSelector.tsx` | **Sélecteur de dates — proposition B.** Semaine navigable, jour actif en pastille Court Navy, point apricot = jour ouvert. |
| `app/courts/[id]/page.tsx` | Écran de réservation câblé : `<Logo>` + `<DateSelector>` + sélecteur de durée segmenté + grille de créneaux. |
| `app/courts/page.tsx` | Liste des terrains, en-tête Palova. |
| `app/login/page.tsx` | Connexion centrée sur le logo. |
| `app/admin/layout.tsx` | Nav admin avec le logo. |
| `app/layout.tsx` | Titre « Palova », favicon. |
| `public/favicon.svg` + icônes | Favicon et icônes d'app. |

## Brancher les disponibilités réelles (optionnel)

`<DateSelector>` accepte `openDates?: Set<string>` (clés `YYYY-MM-DD`) pour n'afficher
le point apricot que sur les jours qui ont encore des créneaux libres. Sans cette prop,
tous les jours futurs sont marqués ouverts.

```tsx
<DateSelector value={date} onChange={setDate} openDates={joursOuverts} />
```

## Palette

| Token | Hex | Usage |
|---|---|---|
| `brand-500` | `#5E93DA` | Primaire — boutons, sélection, liens (~90 %) |
| `brand-300` | `#93B8E8` | Bleu clair |
| `navy` | `#2C4A78` | Profondeur, jour sélectionné |
| `accent-400` | `#EF9F6A` | Apricot — touches chaudes (~10 %) |
| `ink` / `paper` | `#1B1810` / `#F1EDE3` | Texte / fond |
