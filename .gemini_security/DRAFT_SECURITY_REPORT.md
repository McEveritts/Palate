# Final Security Report

## Finding 1: Path Traversal / Arbitrary File Write in `saveParsedRecipe` Server Action
*   **ID:** VULN-001
*   **Vulnerability:** Path Traversal
*   **Vulnerability Type:** Security
*   **Severity:** High
*   **Source Location:** `src/app/actions.ts`, lines 49-52
*   **Description:** The `saveParsedRecipe` Next.js server action accepts a `category` parameter that is used directly in `path.join(process.cwd(), "vault", category)` to determine the directory for writing a file. Since server actions can be called directly by clients with arbitrary arguments (bypassing TypeScript types), an attacker can supply a path traversal payload (e.g., `../../public`) for the `category` argument. This allows writing `.md` files to arbitrary directories on the server.
*   **Recommendation:** Sanitize the `category` input at runtime by explicitly verifying it against an allowlist (e.g., `if (category !== 'mains' && category !== 'sides') throw new Error('Invalid category');`) before using it in `path.join`.

## Finding 2: Path Traversal / Arbitrary File Write in `saveRecipeToVault` Server Action
*   **ID:** VULN-002
*   **Vulnerability:** Path Traversal
*   **Vulnerability Type:** Security
*   **Severity:** High
*   **Source Location:** `src/app/actions.ts`, line 21
*   **Description:** The `saveRecipeToVault` Next.js server action accepts a `format` parameter that is concatenated directly to a sanitized slug to form a filename: `const filename = \`\${slug}.\${format}\`;`. Because there is no runtime validation on the `format` parameter, an attacker can provide a payload like `/../../../public/shell.md` to break out of the intended directory structure and write a file anywhere on the filesystem, provided the server process has permissions.
*   **Recommendation:** Strictly validate the `format` parameter at runtime to ensure it only contains safe characters or matches an allowlist (e.g., `if (format !== 'md' && format !== 'txt') throw new Error('Invalid format');`).

## Finding 3: Server-Side Request Forgery (SSRF) in Parse API
*   **ID:** VULN-003
*   **Vulnerability:** Server-Side Request Forgery (SSRF)
*   **Vulnerability Type:** Security
*   **Severity:** High
*   **Source Location:** `src/app/api/parse/route.ts`, line 20
*   **Description:** The `/api/parse` route accepts a user-provided `input` string. If this string starts with `http://` or `https://`, the server makes a GET request to the URL using `fetch()`. The response body is then processed by the LLM, and the extracted recipe is returned to the user. An attacker can supply a URL pointing to internal services (e.g., `http://localhost:...` or Cloud metadata endpoints like `http://169.254.169.254/`), potentially exposing internal network architecture or sensitive metadata if the LLM includes it in the generated response.
*   **Recommendation:** Implement an allowlist for domains that are permitted to be fetched. If an allowlist is not feasible, ensure the URL does not resolve to private/internal IP ranges (e.g., `127.0.0.0/8`, `169.254.169.254`, `10.0.0.0/8`) before making the `fetch` request.

## Finding 4: Path Traversal in `saveCuratedToVault` Server Action
*   **ID:** VULN-004
*   **Vulnerability:** Path Traversal
*   **Vulnerability Type:** Security
*   **Severity:** Medium
*   **Source Location:** `src/app/actions.ts`, line 77
*   **Description:** The `saveCuratedToVault` server action splits an untrusted `id` string by hyphens to extract a `type` and a `filename`. The `type` variable is then used in `path.join(process.cwd(), 'vault', 'curated', type, filename)`. An attacker can submit an `id` like `curated-../../../public-shell` which parses `type` as `../../../public` and `filename` as `shell.md`. This allows reading files outside the intended curated directory. While the file content is not returned directly to the user (it's moved), the error message returned on failure might leak path existence.
*   **Recommendation:** Validate the extracted `type` to ensure it only matches expected values like `'current'` or `'archive'`.