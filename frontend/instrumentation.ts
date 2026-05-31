export function register() {
  // Suppress EPIPE errors from broken streaming connections in Next.js 16 dev mode.
  // These occur when the browser closes a connection while the server is still streaming.
  process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return;
  });
}
