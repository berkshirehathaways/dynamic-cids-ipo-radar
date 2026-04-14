# agent.md

## How to Work in This Repository

### 1) Execution Style
- Make concrete progress every turn.
- Run commands and validate instead of guessing.
- When a step fails, identify root cause and retry with a different approach.

### 2) Deployment Model
- Frontend URL is public on Vercel.
- Backend URL is public on Vercel.
- Supabase is the source of truth for data.

### 3) Common Commands
```bash
# frontend production
cd frontend
npx vercel --prod --yes

# backend production
cd backend
npx vercel --prod --yes

# local backend run (example)
SUPABASE_URL="..." \
SUPABASE_SECRET_KEY="..." \
READ_ONLY=true \
ADMIN_KEY="..." \
npm run start -w backend
```

### 4) Debug Priority Order
1. Environment variables
2. CORS and API base URL
3. Database table existence and permissions
4. Runtime logs

### 5) Commit Hygiene
- Keep commits atomic and purpose-specific.
- Include verification-ready changes only.
- Do not include generated temporary files.
