// Cloudflare Pages Function for /api/data
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password, X-Admin-Pass-Hash',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const DEFAULT_PASS_HASH = "6df603a9397b0777cb35f07751e11b0f18dd2b864b348936f8e0b7a44bc60780";

  // If Cloudflare D1 database binding 'DB' exists
  if (env && env.DB) {
    if (request.method === 'GET') {
      try {
        const result = await env.DB.prepare("SELECT json_data FROM app_store WHERE key = 'site_data'").first();
        if (result && result.json_data) {
          return new Response(result.json_data, { headers: corsHeaders, status: 200 });
        }
      } catch (e) {
        // Fallback to fetching static data.json
      }
    } else if (request.method === 'POST') {
      try {
        const body = await request.json();
        const authHeader = request.headers.get('Authorization') || request.headers.get('X-Admin-Pass-Hash');
        let storedHash = DEFAULT_PASS_HASH;

        try {
          const stored = await env.DB.prepare("SELECT json_data FROM app_store WHERE key = 'site_data'").first();
          if (stored && stored.json_data) {
            const parsed = JSON.parse(stored.json_data);
            if (parsed.adminPassHash) storedHash = parsed.adminPassHash;
          }
        } catch (e) {}

        let providedHash = authHeader ? authHeader.replace('Bearer ', '').trim().toLowerCase() : null;
        if (!providedHash && body.adminPassHash) providedHash = body.adminPassHash.toLowerCase();

        if (providedHash !== storedHash) {
          return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Invalid admin password' }), { headers: corsHeaders, status: 401 });
        }

        const newData = body.data || body;
        delete newData.adminPassword;
        delete newData.isLocalAdminModified;

        await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_store (key TEXT PRIMARY KEY, json_data TEXT)").run();
        await env.DB.prepare("INSERT OR REPLACE INTO app_store (key, json_data) VALUES ('site_data', ?)").bind(JSON.stringify(newData)).run();

        return new Response(JSON.stringify({ success: true, message: 'Data published to Cloudflare D1 successfully' }), { headers: corsHeaders, status: 200 });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { headers: corsHeaders, status: 500 });
      }
    }
  }

  // Static fallback for Pages without D1 binding
  if (request.method === 'GET') {
    const dataUrl = new URL('/data.json', url.origin);
    const res = await fetch(dataUrl.toString(), { cache: 'no-store' });
    const content = await res.text();
    return new Response(content, { headers: corsHeaders, status: res.status });
  }

  return new Response(JSON.stringify({ success: false, error: 'Cloudflare D1 binding required for write access or Node server fallback' }), { headers: corsHeaders, status: 501 });
}
