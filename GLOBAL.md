# GLOBAL.md

## Mission
Ship reliable, production-grade outcomes fast. Prefer executable results over discussion.

## Operating Rules
- Always verify with real commands after changes.
- Prefer safe defaults; avoid destructive actions.
- Keep changes modular and easy to revert.
- Surface blockers with exact cause and next action.

## Build and Runtime Baseline
- Frontend: Vercel
- Backend/API: Vercel Functions
- Data: Supabase
- Public mode: read-only by default, admin-protected write actions

## Required Verification
- API health endpoint returns success.
- Data endpoint returns non-empty rows when source is available.
- Frontend production build succeeds.

## Security Baseline
- Never expose secret keys in client code.
- Rotate leaked tokens immediately.
- Use environment variables for all secrets.
