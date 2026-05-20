const fs = require('fs');
const path = require('path');

const filesToPatch = [
  {
    path: path.join(__dirname, 'node_modules', 'next', 'dist', 'server', 'node-environment-extensions', 'console-dim.external.js'),
    find: 'require("node:inspector")',
    replace: '(() => { try { return require("node:inspector"); } catch (e) { return { url: () => undefined, default: { url: () => undefined } }; } })()'
  },
  {
    path: path.join(__dirname, 'node_modules', 'next', 'dist', 'esm', 'server', 'node-environment-extensions', 'console-dim.external.js'),
    find: "import * as inspector from 'node:inspector';",
    replace: "const inspector = { url: () => undefined };"
  }
];

console.log('🌿 Starting next:inspector safety patch for restricted environments...');

for (const fileInfo of filesToPatch) {
  if (fs.existsSync(fileInfo.path)) {
    try {
      let content = fs.readFileSync(fileInfo.path, 'utf8');
      if (content.includes(fileInfo.find)) {
        content = content.replace(fileInfo.find, fileInfo.replace);
        fs.writeFileSync(fileInfo.path, content, 'utf8');
        console.log(`✅ Successfully patched: ${path.basename(fileInfo.path)}`);
      } else if (content.includes(fileInfo.replace)) {
        console.log(`ℹ️ Already patched: ${path.basename(fileInfo.path)}`);
      } else {
        console.warn(`⚠️ Target pattern not found in: ${path.basename(fileInfo.path)}`);
      }
    } catch (err) {
      console.error(`❌ Failed to patch: ${fileInfo.path}`, err);
    }
  } else {
    console.warn(`⚠️ File not found, skipping: ${fileInfo.path}`);
  }
}

console.log('🌿 Patch process complete.');
