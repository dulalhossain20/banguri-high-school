const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const DEFAULT_PASS_HASH = "6df603a9397b0777cb35f07751e11b0f18dd2b864b348936f8e0b7a44bc60780";

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function hashPassword(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function getStoredPassHash() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (data.adminPassHash) return data.adminPassHash;
    }
  } catch (e) {}
  return DEFAULT_PASS_HASH;
}

function sendJSON(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password, X-Admin-Pass-Hash',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(body));
}

function serveStatic(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Server Error');
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content);
    }
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 50 * 1024 * 1024) { // 50MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', err => reject(err));
  });
}

function verifyAuth(req, bodyPayload) {
  const authHeader = req.headers['authorization'];
  const passHashHeader = req.headers['x-admin-pass-hash'];
  const passHeader = req.headers['x-admin-password'];
  const storedHash = getStoredPassHash();

  let providedHash = null;
  if (passHashHeader) {
    providedHash = passHashHeader.toLowerCase();
  } else if (passHeader) {
    providedHash = hashPassword(passHeader);
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    providedHash = authHeader.substring(7).trim().toLowerCase();
  } else if (bodyPayload && bodyPayload.adminPassHash) {
    providedHash = bodyPayload.adminPassHash.toLowerCase();
  } else if (bodyPayload && bodyPayload.adminPassword) {
    providedHash = hashPassword(bodyPayload.adminPassword);
  }

  return providedHash === storedHash;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password, X-Admin-Pass-Hash',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }

  // API Endpoints
  if (pathname === '/api/data') {
    if (req.method === 'GET') {
      try {
        if (!fs.existsSync(DATA_FILE)) {
          return sendJSON(res, 404, { success: false, error: 'data.json not found' });
        }
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        return sendJSON(res, 200, data);
      } catch (e) {
        return sendJSON(res, 500, { success: false, error: 'Failed to read data' });
      }
    } else if (req.method === 'POST') {
      try {
        const body = await parseBody(req);
        if (!verifyAuth(req, body)) {
          return sendJSON(res, 401, { success: false, error: 'Unauthorized: Invalid admin password' });
        }

        const newData = body.data || body;
        // Keep or update adminPassHash
        if (!newData.adminPassHash && getStoredPassHash()) {
          newData.adminPassHash = getStoredPassHash();
        }

        // Clean internal flags if present
        delete newData.adminPassword;
        delete newData.isLocalAdminModified;

        fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2), 'utf8');
        return sendJSON(res, 200, { success: true, message: 'Data successfully published to server' });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: err.message || 'Failed to update data' });
      }
    } else {
      return sendJSON(res, 405, { success: false, error: 'Method Not Allowed' });
    }
  }

  if (pathname === '/api/upload') {
    if (req.method === 'POST') {
      try {
        const body = await parseBody(req);
        if (!verifyAuth(req, body)) {
          return sendJSON(res, 401, { success: false, error: 'Unauthorized: Invalid admin password' });
        }

        const { fileName, fileData, fileType } = body;
        if (!fileData) {
          return sendJSON(res, 400, { success: false, error: 'Missing fileData' });
        }

        let base64Data = fileData;
        if (fileData.includes(',')) {
          base64Data = fileData.split(',')[1];
        }

        const buffer = Buffer.from(base64Data, 'base64');
        const ext = path.extname(fileName || '') || (fileType === 'application/pdf' ? '.pdf' : '.jpg');
        const safeName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
        const filePath = path.join(UPLOADS_DIR, safeName);

        fs.writeFileSync(filePath, buffer);
        const publicUrl = `public/uploads/${safeName}`;

        return sendJSON(res, 200, {
          success: true,
          url: publicUrl,
          message: 'File uploaded successfully'
        });
      } catch (err) {
        return sendJSON(res, 500, { success: false, error: err.message || 'Upload failed' });
      }
    } else {
      return sendJSON(res, 405, { success: false, error: 'Method Not Allowed' });
    }
  }

  // Static File Serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  serveStatic(res, filePath, contentType);
});

server.listen(PORT, () => {
  console.log(`Banguri High School Server running on http://localhost:${PORT}`);
});
