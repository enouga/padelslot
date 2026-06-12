'use client';
import { useTheme } from '@/lib/ThemeProvider';
import { Screen } from '@/components/ui/Screen';
import { Logotype, ThemeToggle, MyBookingsButton } from '@/components/ui/atoms';
import { ProfileMenu } from '@/components/ProfileMenu';
import { ClubDirectory } from '@/components/ClubDirectory';

export default function ClubsDirectory() {
  const { th } = useTheme();
  return (
    <Screen>
      <div style={{ paddingBottom: 40 }}>
        <div style={{ padding: '28px 20px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logotype size={22} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MyBookingsButton />
              <ThemeToggle />
              <ProfileMenu />
            </div>
          </div>
          <div style={{ fontFamily: th.fontDisplay, fontWeight: 500, fontSize: 38, lineHeight: 1.05, color: th.text, marginTop: 22, letterSpacing: -0.5 }}>
            Trouvez votre<br />club.
          </div>
        </div>

        <ClubDirectory />
      </div>
    </Screen>
  );
}
