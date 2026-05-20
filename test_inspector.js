process.on('unhandledRejection', (reason) => {
  console.error('🔥 UNHANDLED REJECTION DETECTED!');
  console.error(reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION DETECTED!');
  console.error(err && err.stack ? err.stack : err);
});

// Run Next.js CLI build
process.argv = [process.argv[0], process.argv[1], 'build'];
require('./node_modules/next/dist/bin/next');
