// src/worker/turso-proxy.js — Cloudflare Worker proxy for Turso
// Keeps TURSO_AUTH_TOKEN server-side, never exposes it to the frontend
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const origin = request.headers.get('Origin') || '*';

        // CORS headers for all responses
        const corsHeaders = {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Health check
        if (path === '/api/health') {
            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }

        // Proxy POST /api/posts to Turso pipeline
        if (path === '/api/posts' && request.method === 'POST') {
            try {
                const body = await request.json();
                const tursoRes = await fetch(`${env.TURSO_URL}/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${env.TURSO_AUTH_TOKEN}`,
                    },
                    body: JSON.stringify(body),
                });

                if (!tursoRes.ok) {
                    return new Response(JSON.stringify({ error: `Turso error: ${tursoRes.status}` }), {
                        status: tursoRes.status,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    });
                }

                const data = await tursoRes.json();
                return new Response(JSON.stringify(data), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                });
            }
        }

        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    },
};
