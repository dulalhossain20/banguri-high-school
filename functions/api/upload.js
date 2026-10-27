// Cloudflare Pages Function for /api/upload
export async function onRequest(context) {
  const { request, env } = context;

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

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), { headers: corsHeaders, status: 405 });
  }

  try {
    const body = await request.json();
    const { fileName, fileData, fileType } = body;

    // If Cloudflare R2 bucket binding 'UPLOADS_BUCKET' exists
    if (env && env.UPLOADS_BUCKET && fileData) {
      let base64Data = fileData;
      if (fileData.includes(',')) {
        base64Data = fileData.split(',')[1];
      }
      const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const safeName = `${Date.now()}_${Math.random().toString(36).substring(2)}${fileName ? '_' + fileName.replace(/[^a-zA-Z0-9._-]/g, '') : ''}`;

      await env.UPLOADS_BUCKET.put(safeName, buffer, {
        httpMetadata: { contentType: fileType || 'application/octet-stream' }
      });

      return new Response(JSON.stringify({
        success: true,
        url: `/cdn-cgi/r2/${safeName}`,
        message: 'Uploaded to Cloudflare R2'
      }), { headers: corsHeaders, status: 200 });
    }

    // Default: return inline data URL or confirm receipt
    return new Response(JSON.stringify({
      success: true,
      url: fileData,
      message: 'File preserved'
    }), { headers: corsHeaders, status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { headers: corsHeaders, status: 500 });
  }
}
