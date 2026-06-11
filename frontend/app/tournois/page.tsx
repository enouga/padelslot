import { redirect } from 'next/navigation';

// L'onglet « Tournois » est devenu « Events » (tournois + animations).
// Les fiches /tournois/[id] restent en place.
export default function TournoisRedirect() {
  redirect('/events?filtre=competitions');
}
