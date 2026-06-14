import { isPlayerChangeOpen, isCancellationOpen } from '@/lib/reservations';
import { MyReservation } from '@/lib/api';

const NOW = Date.now();
const r = (startInHours: number, cutoff: number, status: MyReservation['status'] = 'CONFIRMED'): MyReservation => ({
  id: 'r1',
  startTime: new Date(NOW + startInHours * 3_600_000).toISOString(),
  endTime: new Date(NOW + (startInHours + 1) * 3_600_000).toISOString(),
  status,
  totalPrice: '25',
  resource: { id: 'c1', name: 'Court 1', club: { name: 'Club', slug: 'club', timezone: 'Europe/Paris', playerChangeCutoffHours: cutoff, cancellationCutoffHours: cutoff } },
});

describe('isPlayerChangeOpen / isCancellationOpen', () => {
  it('ouvert quand on est avant la clôture', () => {
    expect(isPlayerChangeOpen(r(5, 2), NOW)).toBe(true);
    expect(isCancellationOpen(r(5, 2), NOW)).toBe(true);
  });
  it('fermé une fois la clôture passée', () => {
    expect(isPlayerChangeOpen(r(1, 2), NOW)).toBe(false);
    expect(isCancellationOpen(r(1, 2), NOW)).toBe(false);
  });
  it('cutoff 0 (ou absent) = ouvert jusqu au début', () => {
    expect(isPlayerChangeOpen(r(1, 0), NOW)).toBe(true);
    expect(isPlayerChangeOpen(r(-1, 0), NOW)).toBe(false); // déjà commencé
  });
  it('fermé si la réservation est annulée / non confirmée', () => {
    expect(isPlayerChangeOpen(r(5, 0, 'CANCELLED'), NOW)).toBe(false);
    expect(isCancellationOpen(r(5, 0, 'CANCELLED'), NOW)).toBe(false);
    expect(isPlayerChangeOpen(r(5, 0, 'PENDING'), NOW)).toBe(false);
  });
});
