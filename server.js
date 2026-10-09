const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Port & Admin Secret
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2025';

// ===================================================
// DATABASE LAYER (Supports both Cloud PostgreSQL & Local SQLite)
// ===================================================
let usePg = false;
let pgPool = null;
let sqliteDb = null;

if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    usePg = true;
    console.log('Connecté à la base de données PostgreSQL.');
  } catch (err) {
    console.log('Module pg non chargé, bascule sur SQLite locale.');
  }
}

if (!usePg) {
  const { DatabaseSync } = require('node:sqlite');
  const DB_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  const DB_PATH = path.join(DB_DIR, 'classement.db');
  sqliteDb = new DatabaseSync(DB_PATH);
  console.log('Connecté à la base de données SQLite locale.');
}

async function initDb() {
  if (usePg) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS pfe_groups (
        id SERIAL PRIMARY KEY,
        type VARCHAR(10) NOT NULL DEFAULT 'monome',
        nom1 TEXT NOT NULL,
        prenom1 TEXT NOT NULL,
        moyenne1 REAL NOT NULL,
        nom2 TEXT,
        prenom2 TEXT,
        moyenne2 REAL,
        moyenne_finale REAL NOT NULL,
        is_complete INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try {
      await pgPool.query(`ALTER TABLE pfe_groups ADD COLUMN IF NOT EXISTS is_complete INTEGER DEFAULT 1;`);
    } catch {}
  } else {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS pfe_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'monome',
        nom1 TEXT NOT NULL,
        prenom1 TEXT NOT NULL,
        moyenne1 REAL NOT NULL,
        nom2 TEXT,
        prenom2 TEXT,
        moyenne2 REAL,
        moyenne_finale REAL NOT NULL,
        is_complete INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try {
      sqliteDb.exec(`ALTER TABLE pfe_groups ADD COLUMN is_complete INTEGER DEFAULT 1;`);
    } catch {}
  }
}

// Universal query helpers
async function dbAll(sql, params = []) {
  if (usePg) {
    let pIdx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${pIdx++}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows;
  } else {
    return sqliteDb.prepare(sql).all(...params);
  }
}

async function dbGet(sql, params = []) {
  if (usePg) {
    let pIdx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${pIdx++}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows[0];
  } else {
    return sqliteDb.prepare(sql).get(...params);
  }
}

async function dbRun(sql, params = []) {
  if (usePg) {
    let pIdx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${pIdx++}`);
    await pgPool.query(pgSql, params);
    return { changes: 1 };
  } else {
    return sqliteDb.prepare(sql).run(...params);
  }
}

async function dbExec(sql) {
  if (usePg) {
    await pgPool.query(sql);
  } else {
    sqliteDb.exec(sql);
  }
}

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

// Helper to compute ranking (supports Monôme & Binôme)
async function getRankedStudents(includeMoyenne = false) {
  const query = `
    SELECT id, type, nom1, prenom1, moyenne1, nom2, prenom2, moyenne2, moyenne_finale, is_complete, created_at
    FROM pfe_groups
    ORDER BY moyenne_finale DESC, nom1 ASC, prenom1 ASC, created_at ASC
  `;
  const rows = await dbAll(query);

  const result = [];

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    if (i > 0) {
      if (Math.abs(item.moyenne_finale - rows[i - 1].moyenne_finale) < 0.0001) {
        item.rank = rows[i - 1].rank;
        item.isExAequo = true;
        result[i - 1].isExAequo = true;
      } else {
        item.rank = i + 1;
        item.isExAequo = false;
      }
    } else {
      item.rank = 1;
      item.isExAequo = false;
    }

    if (includeMoyenne) {
      result.push({
        id: item.id,
        type: item.type || 'monome',
        nom1: item.nom1,
        prenom1: item.prenom1,
        moyenne1: Number(item.moyenne1),
        nom2: item.nom2 || null,
        prenom2: item.prenom2 || null,
        moyenne2: item.moyenne2 !== null && item.moyenne2 !== undefined ? Number(item.moyenne2) : null,
        moyenne_finale: Number(item.moyenne_finale),
        isComplete: item.is_complete === 1 || item.is_complete === true,
        rank: item.rank,
        isExAequo: !!item.isExAequo,
        created_at: item.created_at
      });
    } else {
      // STRICT PRIVACY: no individual grades nor team average in public table!
      result.push({
        id: item.id,
        type: item.type || 'monome',
        nom1: item.nom1,
        prenom1: item.prenom1,
        nom2: item.nom2 || null,
        prenom2: item.prenom2 || null,
        isComplete: item.is_complete === 1 || item.is_complete === true,
        rank: item.rank,
        isExAequo: !!item.isExAequo
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
    // API: GET /api/roster (Returns official class roster with registration & partnership status)
    if (pathname === '/api/roster' && method === 'GET') {
      const allGroups = await dbAll('SELECT id, type, nom1, prenom1, moyenne1, nom2, prenom2, moyenne2, is_complete FROM pfe_groups');
      
      const roster = OFFICIAL_ROSTER.map(student => {
        const sNom = student.nom.toLowerCase().trim();
        const sPrenom = student.prenom.toLowerCase().trim();

        // Check if student is Student 1
        const asStudent1 = allGroups.find(g => 
          g.nom1.toLowerCase().trim() === sNom && 
          g.prenom1.toLowerCase().trim() === sPrenom
        );

        // Check if student is Student 2 (partner)
        const asStudent2 = allGroups.find(g => 
          g.nom2 && g.nom2.toLowerCase().trim() === sNom && 
          g.prenom2 && g.prenom2.toLowerCase().trim() === sPrenom
        );

        let isRegistered = false; // Has this student submitted their grade?
        let isInvitedPartner = false; // Was this student chosen as partner by someone else?
        let partnerData = null;

        if (asStudent1) {
          isRegistered = true;
          if (asStudent1.type === 'binome') {
            partnerData = {
              role: 'creator',
              partnerNom: asStudent1.nom2,
              partnerPrenom: asStudent1.prenom2,
              partnerFullName: `${asStudent1.nom2} ${asStudent1.prenom2}`,
              isComplete: asStudent1.is_complete === 1 || asStudent1.is_complete === true
            };
          }
        } else if (asStudent2) {
          isInvitedPartner = true;
          isRegistered = asStudent2.moyenne2 !== null && asStudent2.moyenne2 !== undefined;
          partnerData = {
            role: 'invited',
            groupId: asStudent2.id,
            partnerNom: asStudent2.nom1,
            partnerPrenom: asStudent2.prenom1,
            partnerFullName: `${asStudent2.nom1} ${asStudent2.prenom1}`,
            isComplete: asStudent2.is_complete === 1 || asStudent2.is_complete === true
          };
        }

        return {
          nom: student.nom,
          prenom: student.prenom,
          isRegistered,
          isInvitedPartner,
          partnerData
        };
      });

      const totalSubmitted = roster.filter(s => s.isRegistered).length;

      return sendJSON(res, 200, {
        totalOfficial: OFFICIAL_ROSTER.length,
        totalRegisteredStudents: totalSubmitted,
        roster
      });
    }

    // API: GET /api/check-partner (Checks if a student was invited as partner)
    if (pathname === '/api/check-partner' && method === 'GET') {
      const nom = (parsedUrl.searchParams.get('nom') || '').toLowerCase().trim();
      const prenom = (parsedUrl.searchParams.get('prenom') || '').toLowerCase().trim();

      if (!nom || !prenom) {
        return sendJSON(res, 400, { success: false, message: 'معطيات غير كافية.' });
      }

      // Check if student is Student 2 in an existing group
      const binome = await dbGet(`
        SELECT id, nom1, prenom1, moyenne1, nom2, prenom2, moyenne2, is_complete
        FROM pfe_groups
        WHERE LOWER(TRIM(nom2)) = LOWER(?) AND LOWER(TRIM(prenom2)) = LOWER(?)
      `, [nom, prenom]);

      if (binome) {
        const hasSubmitted = binome.moyenne2 !== null && binome.moyenne2 !== undefined;
        return sendJSON(res, 200, {
          isInvited: true,
          groupId: binome.id,
          partnerName: `${binome.nom1.toUpperCase()} ${binome.prenom1}`,
          hasSubmitted
        });
      }

      // Check if already registered as student 1
      const asStudent1 = await dbGet(`
        SELECT id, type, nom1, prenom1, nom2, prenom2
        FROM pfe_groups
        WHERE LOWER(TRIM(nom1)) = LOWER(?) AND LOWER(TRIM(prenom1)) = LOWER(?)
      `, [nom, prenom]);

      if (asStudent1) {
        return sendJSON(res, 200, {
          isAlreadyRegistered: true,
          type: asStudent1.type,
          partnerName: asStudent1.nom2 ? `${asStudent1.nom2.toUpperCase()} ${asStudent1.prenom2}` : null
        });
      }

      return sendJSON(res, 200, { isInvited: false, isAlreadyRegistered: false });
    }

    // API: GET /api/students (Public ranking without moyenne)
    if (pathname === '/api/students' && method === 'GET') {
      const groups = await getRankedStudents(false);

      const allGroups = await dbAll('SELECT id, type, nom1, prenom1, moyenne1, nom2, prenom2, moyenne2, is_complete FROM pfe_groups');
      let registeredCount = 0;
      allGroups.forEach(g => {
        if (g.moyenne1 !== null) registeredCount++;
        if (g.type === 'binome' && g.moyenne2 !== null) registeredCount++;
      });

      return sendJSON(res, 200, {
        success: true,
        totalGroups: groups.length,
        totalRegisteredStudents: registeredCount,
        totalOfficial: OFFICIAL_ROSTER.length,
        students: groups
      });
    }

    // API: POST /api/students (Add new Monôme, or new Binôme invitation, or complete partner grade)
    if (pathname === '/api/students' && method === 'POST') {
      const body = await parseBody(req);
      const action = body.action;

      // ==========================================
      // CASE 1: Student 2 completing their partnership
      // ==========================================
      if (action === 'complete_binome') {
        const groupId = parseInt(body.groupId, 10);
        const moyenneRaw = body.moyenne;
        const moyenne = parseFloat(moyenneRaw);

        if (isNaN(groupId)) {
          return sendJSON(res, 400, { success: false, message: 'معرف المجموعة غير صالح.' });
        }
        if (isNaN(moyenne) || moyenne < 0 || moyenne > 20) {
          return sendJSON(res, 400, { success: false, message: 'المعدل يجب أن يكون رقماً بين 0.00 و 20.00.' });
        }

        const group = await dbGet('SELECT * FROM pfe_groups WHERE id = ?', [groupId]);
        if (!group) {
          return sendJSON(res, 404, { success: false, message: 'لم يتم العثور على مجموعة الشريك.' });
        }
        if (group.moyenne2 !== null && group.moyenne2 !== undefined) {
          return sendJSON(res, 409, { success: false, message: 'لقد تم تسجيل معدل الشريك مسبقاً.' });
        }

        // Calculate final average = (moyenne1 + moyenne2) / 2
        const moyenne_finale = (Number(group.moyenne1) + moyenne) / 2;

        await dbRun(`
          UPDATE pfe_groups 
          SET moyenne2 = ?, moyenne_finale = ?, is_complete = 1 
          WHERE id = ?
        `, [moyenne, moyenne_finale, groupId]);

        // Recompute rank
        const allRanked = await getRankedStudents(false);
        const myRecord = allRanked.find(g => g.id === groupId);

        return sendJSON(res, 200, {
          success: true,
          message: `تم تسجيل معدلك بنجاح وتفعيل الشراكة مع زميلك ${group.prenom1} ${group.nom1} !`,
          group: {
            rank: myRecord ? myRecord.rank : null,
            totalGroups: allRanked.length
          }
        });
      }

      // ==========================================
      // CASE 2: New Registration (Monôme or Binôme creator)
      // ==========================================
      const type = (body.type || 'monome').toLowerCase(); // 'monome' or 'binome'
      const nom1 = (body.nom || body.nom1 || '').trim();
      const prenom1 = (body.prenom || body.prenom1 || '').trim();
      const moyenne1 = parseFloat(body.moyenne || body.moyenne1);

      if (!nom1 || nom1.length < 2) {
        return sendJSON(res, 400, { success: false, message: 'يرجى إدخال لقبك بشكل صحيح.' });
      }
      if (!prenom1 || prenom1.length < 2) {
        return sendJSON(res, 400, { success: false, message: 'يرجى إدخال اسمك بشكل صحيح.' });
      }
      if (isNaN(moyenne1) || moyenne1 < 0 || moyenne1 > 20) {
        return sendJSON(res, 400, { success: false, message: 'المعدل يجب أن يكون رقماً بين 0.00 و 20.00.' });
      }

      // Check if student 1 is already registered anywhere
      const existing1 = await dbGet(`
        SELECT id, type, nom1, prenom1, nom2, prenom2 FROM pfe_groups
        WHERE (LOWER(TRIM(nom1)) = LOWER(?) AND LOWER(TRIM(prenom1)) = LOWER(?))
           OR (LOWER(TRIM(nom2)) = LOWER(?) AND LOWER(TRIM(prenom2)) = LOWER(?))
      `, [nom1, prenom1, nom1, prenom1]);

      if (existing1) {
        return sendJSON(res, 409, {
          success: false,
          message: `الطالب "${prenom1} ${nom1}" مسجل بالفعل في مجموعة سابقة. يرجى التواصل مع الـ Admin للتعديل.`
        });
      }

      if (type === 'monome') {
        // Monôme: complete immediately
        await dbRun(`
          INSERT INTO pfe_groups (type, nom1, prenom1, moyenne1, nom2, prenom2, moyenne2, moyenne_finale, is_complete)
          VALUES ('monome', ?, ?, ?, NULL, NULL, NULL, ?, 1)
        `, [nom1, prenom1, moyenne1, moyenne1]);

        const allRanked = await getRankedStudents(false);
        const myRecord = allRanked.find(g => 
          g.nom1.toLowerCase() === nom1.toLowerCase() && 
          g.prenom1.toLowerCase() === prenom1.toLowerCase()
        );

        return sendJSON(res, 201, {
          success: true,
          message: 'تم تسجيلك بنجاح كمشروع فردي (Monôme) !',
          group: {
            type: 'monome',
            rank: myRecord ? myRecord.rank : null,
            totalGroups: allRanked.length
          }
        });

      } else {
        // Binôme creator: picks partner (Student 2) without needing their grade
        const nom2 = (body.nom2 || '').trim();
        const prenom2 = (body.prenom2 || '').trim();

        if (!nom2 || nom2.length < 2 || !prenom2 || prenom2.length < 2) {
          return sendJSON(res, 400, { success: false, message: 'يرجى اختيار الشريك (الزميل) بشكل صحيح.' });
        }

        // Cannot pair with oneself
        if (nom1.toLowerCase() === nom2.toLowerCase() && prenom1.toLowerCase() === prenom2.toLowerCase()) {
          return sendJSON(res, 400, { success: false, message: 'لا يمكنك اختيار نفسك كشريك لنفسك !' });
        }

        // Check if partner (Student 2) is already registered anywhere
        const existing2 = await dbGet(`
          SELECT id, type, nom1, prenom1, nom2, prenom2 FROM pfe_groups
          WHERE (LOWER(TRIM(nom1)) = LOWER(?) AND LOWER(TRIM(prenom1)) = LOWER(?))
             OR (LOWER(TRIM(nom2)) = LOWER(?) AND LOWER(TRIM(prenom2)) = LOWER(?))
        `, [nom2, prenom2, nom2, prenom2]);

        if (existing2) {
          return sendJSON(res, 409, {
            success: false,
            message: `الزميل "${prenom2} ${nom2}" مسجل بالفعل في مجموعة أخرى أو تم اختياره من قبل.`
          });
        }

        // Insert as Binôme waiting for Student 2
        // Provisional grade = moyenne1 until partner enters their grade
        await dbRun(`
          INSERT INTO pfe_groups (type, nom1, prenom1, moyenne1, nom2, prenom2, moyenne2, moyenne_finale, is_complete)
          VALUES ('binome', ?, ?, ?, ?, ?, NULL, ?, 0)
        `, [nom1, prenom1, moyenne1, nom2, prenom2, moyenne1]);

        const allRanked = await getRankedStudents(false);
        const myRecord = allRanked.find(g => 
          g.nom1.toLowerCase() === nom1.toLowerCase() && 
          g.prenom1.toLowerCase() === prenom1.toLowerCase()
        );

        return sendJSON(res, 201, {
          success: true,
          message: `تم اختيار زميلك (${prenom2} ${nom2}) كشريك بنجاح ! بمجرد دخوله وإدخال معدله سيتم احتساب معدل الفريق وترتيبكما المشترك.`,
          group: {
            type: 'binome',
            rank: myRecord ? myRecord.rank : null,
            totalGroups: allRanked.length
          }
        });
      }
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
      const groups = await getRankedStudents(true);
      return sendJSON(res, 200, { success: true, total: groups.length, students: groups });
    }

    // API: PUT /api/admin/students/:id (Admin edit group)
    if (pathname.startsWith('/api/admin/students/') && method === 'PUT') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 403, { success: false, message: 'غير مصرح لك بالوصول.' });
      }
      const id = parseInt(pathname.split('/').pop(), 10);
      if (isNaN(id)) return sendJSON(res, 400, { success: false, message: 'معرف غير صالح.' });

      const body = await parseBody(req);
      const type = (body.type || 'monome').toLowerCase();
      const nom1 = (body.nom1 || '').trim();
      const prenom1 = (body.prenom1 || '').trim();
      const moyenne1 = parseFloat(body.moyenne1);

      if (!nom1 || !prenom1 || isNaN(moyenne1) || moyenne1 < 0 || moyenne1 > 20) {
        return sendJSON(res, 400, { success: false, message: 'بيانات الطالب الأول غير صالحة.' });
      }

      let nom2 = null;
      let prenom2 = null;
      let moyenne2 = null;
      let moyenne_finale = moyenne1;
      let is_complete = 1;

      if (type === 'binome') {
        nom2 = (body.nom2 || '').trim();
        prenom2 = (body.prenom2 || '').trim();
        if (body.moyenne2 !== null && body.moyenne2 !== undefined && body.moyenne2 !== '') {
          moyenne2 = parseFloat(body.moyenne2);
          if (!isNaN(moyenne2)) {
            moyenne_finale = (moyenne1 + moyenne2) / 2;
            is_complete = 1;
          } else {
            is_complete = 0;
          }
        } else {
          is_complete = 0;
        }
      }

      await dbRun(`
        UPDATE pfe_groups 
        SET type = ?, nom1 = ?, prenom1 = ?, moyenne1 = ?, nom2 = ?, prenom2 = ?, moyenne2 = ?, moyenne_finale = ?, is_complete = ?
        WHERE id = ?
      `, [type, nom1, prenom1, moyenne1, nom2, prenom2, moyenne2, moyenne_finale, is_complete, id]);

      return sendJSON(res, 200, { success: true, message: 'تم تعديل المجموعة بنجاح.' });
    }

    // API: POST /api/admin/clear (Admin clear all groups)
    if (pathname === '/api/admin/clear' && method === 'POST') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 403, { success: false, message: 'غير مصرح لك بالوصول.' });
      }
      await dbExec('DELETE FROM pfe_groups;');
      return sendJSON(res, 200, { success: true, message: 'تم إفراغ القائمة بنجاح.' });
    }

    // API: DELETE /api/admin/students/:id (Admin delete group)
    if (pathname.startsWith('/api/admin/students/') && method === 'DELETE') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 403, { success: false, message: 'غير مصرح لك بالوصول.' });
      }
      const id = parseInt(pathname.split('/').pop(), 10);
      if (isNaN(id)) return sendJSON(res, 400, { success: false, message: 'معرف غير صالح.' });

      await dbRun('DELETE FROM pfe_groups WHERE id = ?', [id]);

      return sendJSON(res, 200, { success: true, message: 'تم حذف المجموعة بنجاح.' });
    }

    // API: GET /api/admin/export (Admin export CSV)
    if (pathname === '/api/admin/export' && method === 'GET') {
      if (!checkAdminAuth(req)) {
        return sendJSON(res, 403, { success: false, message: 'غير مصرح لك بالوصول.' });
      }
      const groups = await getRankedStudents(true);
      let csv = '\uFEFFRang,Type,Etudiant 1,Moyenne 1,Etudiant 2,Moyenne 2,Moyenne Equipe Finale,Statut,Date\n';
      for (const g of groups) {
        const et1 = `${g.nom1.replace(/"/g, '""')} ${g.prenom1.replace(/"/g, '""')}`;
        const m1 = g.moyenne1.toFixed(2);
        const et2 = g.type === 'binome' && g.nom2 ? `${g.nom2.replace(/"/g, '""')} ${g.prenom2.replace(/"/g, '""')}` : '-';
        const m2 = g.type === 'binome' && g.moyenne2 !== null ? g.moyenne2.toFixed(2) : '-';
        const mf = g.moyenne_finale.toFixed(2);
        const st = g.isComplete ? 'Complet' : 'En attente partenaire';
        csv += `"${g.rank}","${g.type.toUpperCase()}","${et1}","${m1}","${et2}","${m2}","${mf}","${st}","${g.created_at}"\n`;
      }
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="classement_pfe_automatique_esg2e.csv"'
      });
      return res.end(csv);
    }

    // Serve Static Frontend files (supports both public/ and root directory)
    const cleanPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const possiblePaths = [
      path.join(__dirname, 'public', cleanPath),
      path.join(__dirname, cleanPath),
      path.join(__dirname, 'public', path.basename(cleanPath)),
      path.join(__dirname, path.basename(cleanPath))
    ];

    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
        return serveStatic(req, res, testPath);
      }
    }

    // Fallback to index.html for root if not caught
    if (pathname === '/') {
      const fallbackPublic = path.join(__dirname, 'public', 'index.html');
      if (fs.existsSync(fallbackPublic)) return serveStatic(req, res, fallbackPublic);
      const fallbackRoot = path.join(__dirname, 'index.html');
      if (fs.existsSync(fallbackRoot)) return serveStatic(req, res, fallbackRoot);
    }

    return sendJSON(res, 404, { success: false, message: 'الصفحة غير موجودة.' });

  } catch (error) {
    console.error('Server error:', error);
    return sendJSON(res, 500, { success: false, message: 'خطأ داخلي في الخادم.' });
  }
});

// Initialize DB and start server
initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Serveur Classement PFE ESG2E démarré sur http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Erreur initialisation DB:', err);
});
