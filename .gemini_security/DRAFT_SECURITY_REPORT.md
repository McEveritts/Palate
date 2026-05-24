# Draft Security Report — Palate v1.4.0

## Status: Audit Complete (2026-05-24)

### VULN-001: SSRF via Vault Import Path
- **Status:** MITIGATED — Path inputs are now sanitized and validated
- **Original Finding:** User-controlled paths in vault import could access arbitrary files

### VULN-002: Path Traversal in Recipe Slug
- **Status:** MITIGATED — Slugs are sanitized before filesystem access
- **Original Finding:** Recipe slugs could contain `../` sequences

### VULN-003: Format String in AI Prompt
- **Status:** MITIGATED — User input is now sanitized before prompt interpolation
- **Original Finding:** User ingredient queries were interpolated directly into AI prompts

### VULN-004: Guest Cookie Authentication Bypass
- **Status:** FIXED in v1.4.0 — Guest cookie now only grants access to page routes, not API routes
- **Original Finding:** Any user could set `palate_guest=true` cookie to bypass all authentication

### New Findings (v1.4.0 Audit)
- API key exclusion from sessionStorage persistence — FIXED
- Exercise route error handling — FIXED
- Request body validation on sage route — FIXED
- UPC input validation on food-search — FIXED
- ProfileOnboarding enum casing — FIXED
- Gender 'Other' BMR calculation — FIXED
- Diary page unauthenticated data leak — FIXED