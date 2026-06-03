export function register() {
  // process.on n'existe que dans le runtime Node.js, pas dans l'Edge Runtime.
  // Next compile instrumentation.ts pour les deux → on garde l'API Node derrière ce test.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Suppress EPIPE errors from broken streaming connections in Next.js 16 dev mode.
    // These occur when the browser closes a connection while the server is still streaming.
    process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') return;
    });
  }
}
