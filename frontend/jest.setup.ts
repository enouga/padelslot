import '@testing-library/jest-dom';

// jsdom n'implémente pas matchMedia (utilisé par useInstallPrompt pour détecter
// le mode standalone PWA) : stub neutre « ne matche jamais ».
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});
