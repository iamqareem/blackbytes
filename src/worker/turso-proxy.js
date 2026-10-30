// src/worker/turso-proxy.js — Cloudflare Worker proxy for Turso
// Keeps TURSO_AUTH_TOKEN server-side, never exposes it to the frontend
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Health check
        if (path === '/api/health') {
            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Proxy POST /api/posts to Turso pipeline
        if (path === '/api/posts' && request.method === 'POST') {
            try {
                const body = await request.json();
                const tursoRes = await fetch(`${env.TURSO_URL}/v1/pipeline`, {
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
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                const data = await tursoRes.json();
                return new Response(JSON.stringify(data), {
                    headers: { 'Content-Type': 'application/json' },
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }

        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    },
};
