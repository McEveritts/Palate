<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Environment & Execution Rules
- **Never run Node.js locally:** Do not install or execute `node`, `npm`, `npx`, or dev servers locally on the Windows host machine.
- **Use Whatbox server for Node.js:** All Node.js commands (tests, builds, typechecking, script execution) must be run on the Whatbox server (`venus.whatbox.ca`).
- **Sandbox Isolation:** When running tests or builds on Whatbox during development, always use an isolated sandbox/temp directory to ensure production deployments and services on Whatbox remain untouched.
