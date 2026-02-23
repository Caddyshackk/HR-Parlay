/**
 * HR Parlay Builder — Cloudflare Worker API Proxy
 *
 * Keeps API keys secret on the server side.
 * Deploy this to Cloudflare Workers, then set these secrets
 * in your Worker's Settings → Variables → Environment Variables:
 *
 *   ODDS_API_KEY     = your key from the-odds-api.com
 *   BDL_API_KEY      = your key from balldontlie.io
 *   ALLOWED_ORIGIN   = https://yourusername.github.io  (your GitHub Pages URL)
 *
 * Routes handled:
 *   GET /odds        → proxies to The Odds API (MLB moneylines + totals)
 *   GET /bdl/*       → proxies to BallDontLie MLB API
 *   GET /health      → returns OK (useful for testing)
 */

export default {
    async fetch(request, env) {
        // ── CORS ────────────────────────────────────────────────────────────────
        const allowedOrigin = env.ALLOWED_ORIGIN || '*';

        const corsHeaders = {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        };

        // Handle preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Only allow GET
        if (request.method !== 'GET') {
            return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // ── HEALTH CHECK ────────────────────────────────────────────────────
            if (path === '/health') {
                return new Response(JSON.stringify({ status: 'ok', ts: Date.now() }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // ── ODDS API ────────────────────────────────────────────────────────
            if (path === '/odds') {
                if (!env.ODDS_API_KEY) {
                    return new Response(JSON.stringify({ error: 'ODDS_API_KEY not configured' }), {
                        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const oddsUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds` +
                    `?apiKey=${env.ODDS_API_KEY}` +
                    `&regions=us` +
                    `&markets=h2h,totals` +
                    `&oddsFormat=american` +
                    `&dateFormat=iso`;

                const oddsRes = await fetch(oddsUrl);
                const oddsData = await oddsRes.text();

                // Pass through the remaining-requests header so frontend can display it
                const remaining = oddsRes.headers.get('x-requests-remaining');

                const responseHeaders = {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=300', // 5-min edge cache
                };
                if (remaining) responseHeaders['x-requests-remaining'] = remaining;

                return new Response(oddsData, {
                    status: oddsRes.status,
                    headers: responseHeaders
                });
            }

            // ── BALLDONTLIE ─────────────────────────────────────────────────────
            if (path.startsWith('/bdl')) {
                if (!env.BDL_API_KEY) {
                    return new Response(JSON.stringify({ error: 'BDL_API_KEY not configured' }), {
                        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                // Strip the /bdl prefix to get the BDL path + query string
                // e.g. /bdl/games?dates[]=2025-04-01  →  /mlb/v1/games?dates[]=2025-04-01
                const bdlPath = path.replace(/^\/bdl/, '');
                const bdlQuery = url.search; // preserves all query params

                const bdlUrl = `https://api.balldontlie.io/mlb/v1${bdlPath}${bdlQuery}`;

                const bdlRes = await fetch(bdlUrl, {
                    headers: { 'Authorization': env.BDL_API_KEY }
                });
                const bdlData = await bdlRes.text();

                return new Response(bdlData, {
                    status: bdlRes.status,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'public, max-age=60', // 1-min edge cache for live data
                    }
                });
            }

            // ── 404 ─────────────────────────────────────────────────────────────
            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

        } catch (err) {
            return new Response(JSON.stringify({ error: 'Worker error', message: err.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};
