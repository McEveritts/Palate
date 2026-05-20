const mod = require('module');
const originalRequire = mod.prototype.require;

mod.prototype.require = function (request) {
  if (request === 'inspector' || request === 'node:inspector') {
    return {
      url: () => undefined,
      open: () => {},
      close: () => {},
      Session: class Session {
        connect() {}
        disconnect() {}
        post() {}
        on() {}
      }
    };
  }
  try {
    return originalRequire.call(this, request);
  } catch (err) {
    if (request === 'inspector' || request === 'node:inspector' || err.code === 'ERR_INSPECTOR_NOT_AVAILABLE') {
      return {
        url: () => undefined,
        open: () => {},
        close: () => {},
        Session: class Session {
          connect() {}
          disconnect() {}
          post() {}
          on() {}
        }
      };
    }
    throw err;
  }
};

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
