// Vercel serverless function — proxies to Anthropic so the API key never
// reaches the browser. Includes basic per-IP rate limiting and safer
// JSON extraction from the model's response.

// NOTE on rate limiting: Vercel serverless functions are stateless between
// cold starts, so this in-memory limiter is a soft speed bump (resets when
// the function cold-starts), not a hard guarantee. It's enough to stop
// accidental double-clicks and casual abuse. For real production traffic
// (e.g. your whole year group using it daily) swap this for Vercel KV or
// Upstash Redis — same idea, just persisted.
const hits = new Map(); // ip -> [timestamps]
const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_WINDOW = 12; // ~1 mark every 5s sustained, bursts allowed

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

// The model is asked to return raw JSON, but sometimes wraps it in prose
// or fences anyway — pull out the first {...} block defensively.
function extractJSON(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model response");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (isRateLimited(ip)) {
    return res
      .status(429)
      .json({ error: "Too many requests — wait a moment before marking again." });
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing prompt" });
  }
  if (prompt.length > 8000) {
    return res.status(400).json({ error: "Prompt too long" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Server not configured: missing ANTHROPIC_API_KEY" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error("Anthropic API error:", data);
      const msg =
        upstream.status === 401
          ? "Server API key is invalid or missing."
          : upstream.status === 429
          ? "Anthropic rate limit hit — try again shortly."
          : "Upstream API error.";
      return res.status(upstream.status).json({ error: msg });
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Validate the JSON server-side too, so the frontend gets a clean
    // structured object instead of having to re-parse and guess.
    let parsed;
    try {
      parsed = extractJSON(text);
    } catch (e) {
      console.error("Failed to parse model JSON:", text);
      return res.status(502).json({ error: "Marker returned an unexpected format." });
    }

    return res.status(200).json({ result: parsed });
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
