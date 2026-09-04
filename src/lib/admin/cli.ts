#!/usr/bin/env node

// Handle server-only gracefully when run in administrative CLI context
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require("module");
  const origRequire = Module.prototype.require;
  Module.prototype.require = function (id: string, ...args: unknown[]) {
    if (id === "server-only") {
      return {};
    }
    return origRequire.apply(this, [id, ...args]);
  };
} catch {}

try {
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as unknown as NodeModule;
} catch {}

// Load Next.js environment configuration before dynamically loading dependencies
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(process.cwd());
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config({ path: ".env.local" });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config({ path: ".env" });
  } catch {}
}

async function getDeps() {
  const [enc, tokens, link, db] = await Promise.all([
    import("./migrateEncryption"),
    import("./migrateGoogleTokens"),
    import("./linkIdentity"),
    import("../db"),
  ]);
  return {
    inspectEncryptionMigration: enc.inspectEncryptionMigration,
    migrateUserConfigEncryption: enc.migrateUserConfigEncryption,
    inspectGoogleTokenMigration: tokens.inspectGoogleTokenMigration,
    migrateGoogleTokens: tokens.migrateGoogleTokens,
    countGoogleUsers: link.countGoogleUsers,
    reportIdentityCollisions: link.reportIdentityCollisions,
    linkPalateUserToJellyfin: link.linkPalateUserToJellyfin,
    prisma: db.prisma,
  };
}

function parseArgs(args: string[]) {
  const flags: Record<string, string | boolean> = {};
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        flags[key] = val;
      } else {
        flags[arg.slice(2)] = true;
      }
    }
  }
  return flags;
}

async function main() {
  const args = process.argv.slice(2);
  const command = (args[0] || "").replace(/\r/g, "").trim();
  const flags = parseArgs(args.slice(1));

  if (!command || command === "--help" || command === "help") {
    console.log(`Palate Administration CLI

Usage: tsx src/lib/admin/cli.ts <command> [options]

Commands:
  userconfig:inspect             Inspect UserConfig Gemini API key encryption status
  userconfig:dry-run             Dry-run migration of UserConfig keys to PALATE_ENCRYPTION_SECRET
  userconfig:migrate             Execute live migration of UserConfig keys (requires --confirmed)
  tokens:inspect                 Inspect Google OAuth token encryption status
  tokens:dry-run                 Dry-run encryption of plaintext Google OAuth tokens
  tokens:migrate                 Execute live encryption of Google OAuth tokens (requires --confirmed)
  users:count-google             Count total Google accounts and unlinked users
  users:collision-report         Aggregate report of Google vs Jellyfin identity collisions
  users:pre-link                 Pre-link a Google-era user to Jellyfin (requires --confirmed, --palate-user-id, --jellyfin-user-id, --jellyfin-username, --jellyfin-server-id)
`);
    process.exit(0);
  }

  try {
    const deps = await getDeps();
    switch (command) {
      case "userconfig:inspect": {
        const result = await deps.inspectEncryptionMigration();
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "userconfig:dry-run": {
        const result = await deps.migrateUserConfigEncryption({ dryRun: true });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "userconfig:migrate": {
        if (!flags.confirmed) {
          console.error(JSON.stringify({ error: "Live migration requires --confirmed flag." }));
          process.exit(1);
        }
        const result = await deps.migrateUserConfigEncryption({ dryRun: false, confirmed: true });
        console.log(JSON.stringify(result, null, 2));
        if (result.errors > 0 || result.casSkipped > 0) {
          console.error(JSON.stringify({ error: "Migration completed with unresolved records." }));
          process.exit(1);
        }
        break;
      }

      case "tokens:inspect": {
        const result = await deps.inspectGoogleTokenMigration();
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "tokens:dry-run": {
        const result = await deps.migrateGoogleTokens({ dryRun: true });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "tokens:migrate": {
        if (!flags.confirmed) {
          console.error(JSON.stringify({ error: "Live migration requires --confirmed flag." }));
          process.exit(1);
        }
        const result = await deps.migrateGoogleTokens({ dryRun: false, confirmed: true });
        console.log(JSON.stringify(result, null, 2));
        if (
          result.unreadableSkipped > 0 ||
          result.malformedSkipped > 0 ||
          result.casSkipped > 0
        ) {
          console.error(JSON.stringify({ error: "Migration completed with unresolved records." }));
          process.exit(1);
        }
        break;
      }

      case "users:count-google": {
        const result = await deps.countGoogleUsers();
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "users:collision-report": {
        const result = await deps.reportIdentityCollisions();
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "users:pre-link": {
        if (!flags.confirmed) {
          console.error(JSON.stringify({ error: "Pre-linking requires explicit --confirmed flag." }));
          process.exit(1);
        }

        const palateUserId = typeof flags["palate-user-id"] === "string" ? flags["palate-user-id"].trim() : undefined;
        const jellyfinUserId = typeof flags["jellyfin-user-id"] === "string" ? flags["jellyfin-user-id"].trim() : undefined;
        const jellyfinUsername = typeof flags["jellyfin-username"] === "string" ? flags["jellyfin-username"].trim() : undefined;
        const jellyfinServerId = typeof flags["jellyfin-server-id"] === "string" ? flags["jellyfin-server-id"].trim() : undefined;

        if (!palateUserId || !jellyfinUserId || !jellyfinUsername || !jellyfinServerId) {
          console.error(
            JSON.stringify({
              error: "Missing required parameters: --palate-user-id, --jellyfin-user-id, --jellyfin-username, --jellyfin-server-id are mandatory.",
            })
          );
          process.exit(1);
        }

        const result = await deps.linkPalateUserToJellyfin({
          palateUserId,
          jellyfinServerId,
          jellyfinUserId,
          jellyfinUsername,
        });

        console.log(JSON.stringify(result, null, 2));
        break;
      }

      default: {
        console.error(JSON.stringify({ error: `Unknown command: ${command}` }));
        process.exit(1);
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ error: errorMsg }));
    process.exit(1);
  } finally {
    try {
      const db = await import("../db");
      await db.prisma.$disconnect();
    } catch {}
  }
}

main();
