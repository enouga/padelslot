import { installState, isIosUa } from '../lib/install';

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const UA_CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

describe('isIosUa', () => {
  it('détecte un iPhone', () => expect(isIosUa(UA_IPHONE)).toBe(true));
  it('détecte un iPad récent (UA Macintosh) via le tactile', () => expect(isIosUa(UA_IPAD_DESKTOP, true)).toBe(true));
  it("un vrai Mac (sans tactile) n'est pas iOS", () => expect(isIosUa(UA_IPAD_DESKTOP, false)).toBe(false));
  it("Android n'est pas iOS", () => expect(isIosUa(UA_CHROME_ANDROID)).toBe(false));
});

describe('installState', () => {
  it('déjà installée (standalone) → hidden, même si prompt dispo', () =>
    expect(installState({ standalone: true, canPrompt: true, ios: false })).toBe('hidden'));
  it('prompt natif capturé → native', () =>
    expect(installState({ standalone: false, canPrompt: true, ios: false })).toBe('native'));
  it('iOS sans prompt → ios-manual', () =>
    expect(installState({ standalone: false, canPrompt: false, ios: true })).toBe('ios-manual'));
  it('navigateur sans installation → hidden', () =>
    expect(installState({ standalone: false, canPrompt: false, ios: false })).toBe('hidden'));
});
