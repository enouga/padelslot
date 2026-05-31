// main.jsx — root: design canvas with the two directions + admin, plus Tweaks.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#d6ff3f",
  "serif": "Cormorant",
  "neon": true
}/*EDITMODE-END*/;

const ACCENT_OPTIONS = ['#d6ff3f', '#46e6d0', '#ff7a4d', '#bda6ff'];

function Phone({ th, dark, seed }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: th.canvas }}>
      <IOSDevice width={390} height={844} dark={dark}>
        <SlotPadelApp th={th} seed={seed} />
      </IOSDevice>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const serifKey = t.serif === 'Spectral' ? 'spectral' : 'cormorant';
  const opts = { accent: t.accent, serif: serifKey, neon: t.neon };
  const thA = React.useMemo(() => makeTheme('floodlit', opts), [t.accent, serifKey, t.neon]);
  const thB = React.useMemo(() => makeTheme('daylight', opts), [t.accent, serifKey, t.neon]);

  return (
    <>
      <DesignCanvas>
        <DCSection id="player" title="Parcours joueur"
          subtitle="La même app, deux directions à comparer. Tout est cliquable : connexion → terrains → créneaux en direct → pré-réservation → paiement → billet.">
          <DCArtboard id="floodlit" label="A · Floodlit — nocturne" width={462} height={912} style={{ background: thA.canvas }}>
            <Phone th={thA} dark seed="a" />
          </DCArtboard>
          <DCArtboard id="daylight" label="B · Daylight — jour" width={462} height={912} style={{ background: thB.canvas }}>
            <Phone th={thB} dark={false} seed="b" />
          </DCArtboard>
        </DCSection>

        <DCSection id="admin" title="Espace club"
          subtitle="Tableau de bord administrateur — planning et activité en temps réel.">
          <DCArtboard id="dashboard" label="Tableau de bord (desktop)" width={1240} height={772} style={{ background: thA.canvas }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChromeWindow width={1180} height={712} url="admin.slotpadel.com">
                <AdminDashboard accent={t.accent} serif={serifKey} neon={t.neon} />
              </ChromeWindow>
            </div>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Couleur d'accent" />
        <TweakColor label="Accent" value={t.accent} options={ACCENT_OPTIONS} onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Typographie" />
        <TweakRadio label="Serif d'affichage" value={t.serif} options={['Cormorant', 'Spectral']} onChange={(v) => setTweak('serif', v)} />
        <TweakSection label="Ambiance" />
        <TweakToggle label="Lueur néon (direction sombre)" value={t.neon} onChange={(v) => setTweak('neon', v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
