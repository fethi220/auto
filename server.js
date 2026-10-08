const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Port & Admin Secret
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2025';

// Initialize SQLite database
const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'classement.db');
const db = new DatabaseSync(DB_PATH);

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    moyenne REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Official roster of 3rd Year Automatique - ESG2E Oran
const OFFICIAL_ROSTER = [
  { nom: "Haddoud", prenom: "Meriem" },
  { nom: "Bourzak", prenom: "Oumaima" },
  { nom: "Bourzak", prenom: "Khadidja" },
  { nom: "Guezzoul", prenom: "Kawther" },
  { nom: "Bendib", prenom: "Imen" },
  { nom: "Benmebarek", prenom: "Meriem" },
  { nom: "Nair", prenom: "Ghizlene" },
  { nom: "Medjdoub", prenom: "El Mehdi" },
  { nom: "Ben abd allah benarmas", prenom: "Imene" },
  { nom: "Benazzouz", prenom: "Youssouf" },
  { nom: "Ziouane", prenom: "Fethi" },
  { nom: "Khelil", prenom: "Abdelmalek Yassine" },
  { nom: "Kechar", prenom: "Tarek" },
  { nom: "Tidjani", prenom: "Salah Eddine" },
  { nom: "Lamri", prenom: "Nada Erraihenne" },
  { nom: "Benlekhal", prenom: "Aymen" },
  { nom: "Arbaoui", prenom: "Mohamed El Hadi" },
  { nom: "Belarbi", prenom: "Aymen Karim" },
  { nom: "Sadi", prenom: "Abdelaziz" },
  { nom: "Bessedik", prenom: "Fatima Zohra" },
  { nom: "Abdi", prenom: "Wided" },
  { nom: "Touhami", prenom: "Tahar" },
  { nom: "Mendas", prenom: "Mohammed Abdennour" },
  { nom: "Sahraoui", prenom: "Mohammed Elamin" },
  { nom: "Touil", prenom: "Mohamed Zakaria" },
  { nom: "Djelil", prenom: "Rayane Mohammed Anis" },
  { nom: "Mersali", prenom: "Houcine" },
  { nom: "Yahiaoui", prenom: "Mohammed Amine" },
  { nom: "Bennaoum", prenom: "Sidahmed" },
  { nom: "Cherbal", prenom: "Taki Eddine" }
];

// Simple in-memory session tokens for admin
const adminTokens = new Set();

// Helper to compute ranking
// In standard competition ranking: if two students tie for rank 1, both get 1, next is rank 3.
function getRankedStudents(includeMoyenne = false) {
  const query = `
    SELECT id, nom, prenom, moyenne, created_at
    FROM students
    ORDER BY moyenne DESC, nom ASC, prenom ASC, created_at ASC
  `;
  const rows = db.prepare(query).all();

  const result = [];

  for (let i = 0; i < rows.length; i++) {
    const student = rows[i];
    if (i > 0) {
      if (Math.abs(student.moyenne - rows[i - 1].moyenne) < 0.0001) {
        student.rank = rows[i - 1].rank;
        student.isExAequo = true;
        result[i - 1].isExAequo = true;
      } else {
        student.rank = i + 1;
        student.isExAequo = false;
      }
    } else {
      student.rank = 1;
      student.isExAequo = false;
    }

    if (includeMoyenne) {
      result.push({
        id: student.id,
        nom: student.nom,
        prenom: student.prenom,
        moyenne: Number(student.moyenne),
        rank: student.rank,
        isExAequo: !!student.isExAequo,
        created_at: student.created_at
      });
    } else {
      // STRICT PRIVACY: moyenne is NEVER sent in public view
      result.push({
        id: student.id,
        nom: student.nom,
        prenom: student.prenom,
        rank: student.rank,
        isExAequo: !!student.isExAequo
      });
    }
  }

  return result;
}

// Request helpers
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function checkAdminAuth(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/, '').trim();
  return adminTokens.has(token);
}

// Static file server helper
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }

  try {
    // API: GET /api/roster (Returns official class roster with registration status)
    if (pathname === '/api/roster' && method === 'GET') {
      const registered = db.prepare('SELECT LOWER(TRIM(nom)) as nom, LOWER(TRIM(prenom)) as prenom FROM students').all();
      const registeredSet = new Set(registered.map(r => `${r.nom}|${r.prenom}`));

      const roster = OFFICIAL_ROSTER.map(student => {
        const key = `${student.nom.toLowerCase().trim()}|${student.prenom.toLowerCase().trim()}`;
        return {
          nom: student.nom,
          prenom: student.prenom,
          isRegistered: registeredSet.has(key)
        };
      });

      return sendJSON(res, 200, {
        totalOfficial: OFFICIAL_ROSTER.length,
        roster
      });
    }

    // API: GET /api/students (Public ranking without moyenne)
    if (pathname === '/api/students' && method === 'GET') {
      const students = getRankedStudents(false);
      return sendJSON(res, 200, {
        success: true,
        total: students.length,
        totalOfficial: OFFICIAL_ROSTER.length,
        students
      });
    }

    // API: POST /api/students (Add new student)
    if (pathname === '/api/students' && method === 'POST') {
      const body = await parseBody(req);
      const nom = (body.nom || '').trim();
      const prenom = (body.prenom || '').trim();
      const moyenneRaw = body.moyenne;

      // Validations
      if (!nom || nom.length < 2) {
        return sendJSON(res, 400, { success: false, message: 'يرجى إدخال اللقب بشكل صحيح.' });
      }
      if (!prenom || prenom.length < 2) {
        return sendJSON(res, 400, { success: false, message: 'يرجى إدخال الاسم بشكل صحيح.' });
      }

      const moyenne = parseFloat(moyenneRaw);
      if (isNaN(moyenne) || moyenne < 0 || moyenne > 20) {
        return sendJSON(res, 400, { success: false, message: 'المعدل يجب أن يكون رقماً صحيحاً بين 0.00 و 20.00.' });
      }

      // Check duplicate (case insensitive)
      const existing = db.prepare(`
        SELECT id FROM students 
        WHERE LOWER(TRIM(nom)) = LOWER(?) AND LOWER(TRIM(prenom)) = LOWER(?)
      `).get(nom, prenom);

      if (existing) {
        return sendJSON(res, 409, {
          success: false,
          message: `الطالب "${prenom} ${nom}" مسجل بالفعل في القائمة. إذا أردت تعديل معدلك يرجى التواصل مع المشرف (Admin).`
        });
      }

      // Insert student
      const insertStmt = db.prepare('INSERT INTO students (nom, prenom, moyenne) VALUES (?, ?, ?)');
      insertStmt.run(nom, prenom, moyenne);

      // Recompute rank to give student their rank immediately
      const allRanked = getRankedStudents(false);
      const myRecord = allRanked.find(s => s.nom.toLowerCase() === nom.toLowerCase() && s.prenom.toLowerCase() === prenom.toLowerCase());

      return sendJSON(res, 201, {
        success: true,
        message: 'تم تسجيلك بنجاح في الترتيب !',
        student: {
          nom,
          prenom,
          rank: myRecord ? myRecord.rank : null,
          total: allRanked.length,
          totalOfficial: OFFICIAL_ROSTER.length
        }
      });
    }

    // API: POST /api/admin/login
    if (pathname === '/api/admin/login' && method === 'POST') {
      const body = await parseBody(req);
      const password = (body.password || '').trim();

      if (password === ADMIN_PASSWORD) {
        const token = crypto.randomBytes(32).toString('hex');
        adminTokens.add(token);
        return sendJSON(res, 200, { success: true, token, message: 'تم تسجيل دخول المشرف بنجاح.' });
      } else {
        return sendJSON(res, 401, { success: false, message: 'كلمة المرور غير صحيحة.' });
      }
    }

    // API: GET /api/admin/students (Admin view WITH moyenne)
    if (pathname === '/api/admin/students' && method === 'GET') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 403, { success: false, message: 'غير مصرح لك بالوصول.' });
      }
      const students = getRankedStudents(true);
      return sendJSON(res, 200, { success: true, total: students.length, totalOfficial: OFFICIAL_ROSTER.length, students });
    }

    // API: PUT /api/admin/students/:id (Admin edit student)
    if (pathname.startsWith('/api/admin/students/') && method === 'PUT') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 403, { success: false, message: 'غير مصرح لك بالوصول.' });
      }
      const id = parseInt(pathname.split('/').pop(), 10);
      if (isNaN(id)) return sendJSON(res, 400, { success: false, message: 'معرف غير صالح.' });

      const body = await parseBody(req);
      const nom = (body.nom || '').trim();
      const prenom = (body.prenom || '').trim();
      const moyenne = parseFloat(body.moyenne);

      if (!nom || !prenom || isNaN(moyenne) || moyenne < 0 || moyenne > 20) {
        return sendJSON(res, 400, { success: false, message: 'بيانات غير صالحة.' });
      }

      const updateStmt = db.prepare('UPDATE students SET nom = ?, prenom = ?, moyenne = ? WHERE id = ?');
      updateStmt.run(nom, prenom, moyenne, id);

      return sendJSON(res, 200, { success: true, message: 'تم تعديل بيانات الطالب بنجاح.' });
    }

    // API: POST /api/admin/clear (Admin clear all test students)
    if (pathname === '/api/admin/clear' && method === 'POST') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 403, { success: false, message: 'غير مصرح لك بالوصول.' });
      }
      db.exec('DELETE FROM students;');
      return sendJSON(res, 200, { success: true, message: 'تم إفراغ قائمة الطلبة بنجاح.' });
    }

    // API: DELETE /api/admin/students/:id (Admin delete student)
    if (pathname.startsWith('/api/admin/students/') && method === 'DELETE') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 403, { success: false, message: 'غير مصرح لك بالوصول.' });
      }
      const id = parseInt(pathname.split('/').pop(), 10);
      if (isNaN(id)) return sendJSON(res, 400, { success: false, message: 'معرف غير صالح.' });

      const deleteStmt = db.prepare('DELETE FROM students WHERE id = ?');
      deleteStmt.run(id);

      return sendJSON(res, 200, { success: true, message: 'تم حذف الطالب بنجاح.' });
    }

    // API: GET /api/admin/export (Admin export CSV)
    if (pathname === '/api/admin/export' && method === 'GET') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 403, { success: false, message: 'غير مصرح لك بالوصول.' });
      }
      const students = getRankedStudents(true);
      let csv = '\uFEFFRang,Nom,Prénom,Moyenne,Date d\'inscription\n';
      for (const s of students) {
        csv += `"${s.rank}","${s.nom.replace(/"/g, '""')}","${s.prenom.replace(/"/g, '""')}","${s.moyenne.toFixed(2)}","${s.created_at}"\n`;
      }
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="classement_pfe_automatique_esg2e.csv"'
      });
      return res.end(csv);
    }

    // Serve Static Frontend files
    let staticFilePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(staticFilePath) && fs.statSync(staticFilePath).isFile()) {
      return serveStatic(req, res, staticFilePath);
    }

    // Fallback to index.html for root
    if (pathname === '/') {
      return serveStatic(req, res, path.join(__dirname, 'public', 'index.html'));
    }

    return sendJSON(res, 404, { success: false, message: 'الصفحة غير موجودة.' });

  } catch (error) {
    console.error('Server error:', error);
    return sendJSON(res, 500, { success: false, message: 'خطأ داخلي في الخادم.' });
  }
});

server.listen(PORT, () => {
  console.log(`Serveur Classement PFE ESG2E démarré sur http://localhost:${PORT}`);
});
