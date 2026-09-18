# MarkWise

AI examiner that grades Edexcel IGCSE-style answers against mark scheme logic.

## Structure — IMPORTANT

These files must sit at the **root of your repo/project**, not inside a subfolder:

```
index.html is inside  public/
mark.js    is inside  api/
package.json
vercel.json
```

If your GitHub repo looks like `markwise-vercel/api/mark.js`, Vercel will NOT
find the API route and `/api/mark` returns 404. Either:
- move the files up so `api/` is at the repo root, OR
- in Vercel: Settings -> General -> **Root Directory** -> set to `markwise-vercel`

## Deploy

1. Get an API key: console.anthropic.com -> API Keys -> Create Key (`sk-ant-...`)
2. Push these files to GitHub (with `api/` at the root), or run `vercel` in this folder
3. Vercel -> Settings -> **Environment Variables**
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key
4. **Redeploy** — env vars only apply to deployments made after saving them

## Checking it works

Open `https://YOUR-SITE.vercel.app/api/mark` directly in a browser.

- `{"error":"Method not allowed"}`  -> the function deployed correctly (GET isn't allowed, that's expected)
- A styled **404 NOT_FOUND** page     -> the function did NOT deploy; see the Structure note above

## Notes

- `"type": "module"` in package.json is required — `api/mark.js` uses ESM syntax.
- Rate limiter in `api/mark.js` is in-memory (resets on cold start). Fine for
  personal/small-group use; swap for Vercel KV or Upstash for heavy traffic.
- Questions are original, in Edexcel style — not copied past papers.
- Not affiliated with Pearson Edexcel.
