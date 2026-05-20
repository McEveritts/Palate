// Inspector Shim for Node environments without inspector support (e.g., custom seedbox compiles)
const Module = require('module');
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
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
  return originalLoad.apply(this, arguments);
};
