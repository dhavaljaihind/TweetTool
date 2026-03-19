const crypto = require("crypto");
const XLSX = require("xlsx");

require("dotenv").config();

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");



const app = express();
const DEMO_MODE = String(process.env.DEMO_MODE || "false") === "true";
const IS_PROD = process.env.NODE_ENV === "production";

if (!process.env.SESSION_SECRET || String(process.env.SESSION_SECRET).trim().length < 32) {
  throw new Error("SESSION_SECRET must be set and at least 32 characters long");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: true, limit: "200kb" }));

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
      maxAge: 1000 * 60 * 30
    }
  })
);

// Public access only for post media, not all uploaded admin files
app.use(
  "/uploads/posts",
  express.static(path.join(__dirname, "uploads", "posts"), {
    fallthrough: false,
    index: false,
    redirect: false,
    dotfiles: "deny"
  })
);

/* ================= FILE INIT ================= */
function ensureFile(file, defaultContent) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, defaultContent);
}

ensureFile("tweets.json", "[]");
ensureFile("mentions.json", "[]");
ensureFile("users.json", "[]");
ensureFile("otp.json", "[]");
ensureFile("analytics.json", "[]");
ensureFile("admins.json", "[]");

/**
 * NEW HIERARCHY masters.json structure (CASE SENSITIVE NAMES):
 *  countries:     [{id,name}]
 *  states:        [{id,countryId,name}]
 *  cities:        [{id,stateId,name}]                  // City / District / Taluka
 *  loksabhas:     [{id,stateId,name}]
 *  vidhansabhas:  [{id,lokId,name}]
 *  wards:         [{id,cityId,vidhansabhaId,name}]    // Ward is based on City + Vidhan Sabha (OPTIONAL in profile)
 *  designations:  [{id,name}]
 *
 * Legacy keys are kept so older pages don't crash, but new UI should use hierarchy APIs.
 */
ensureFile(
  "masters.json",
  JSON.stringify(
    {
      countries: [],
      states: [],
      cities: [],
      loksabhas: [],
      vidhansabhas: [],
      wards: [],
      designations: [],

      // legacy keys (backward compatibility only)
      country: [],
      city: [],
      vidhansabha: [],
      ward: [],
      shaktikendra: [],
      booth: [],
      designation: [],
    },
    null,
    2
  )
);

/* ================= SAFE JSON READ/WRITE ================= */
function safeReadJson(file, fallbackContent) {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const cleaned = raw.replace(/^\uFEFF/, "").trim(); // remove BOM
    if (!cleaned) {
      fs.writeFileSync(file, fallbackContent);
      return JSON.parse(fallbackContent);
    }
    return JSON.parse(cleaned);
  } catch (e) {
    console.error(`[JSON] Corrupted file "${file}", resetting...`);
    fs.writeFileSync(file, fallbackContent);
    return JSON.parse(fallbackContent);
  }
}

function mastersFallback() {
  return JSON.stringify(
    {
      countries: [],
      states: [],
      cities: [],
      loksabhas: [],
      vidhansabhas: [],
      wards: [],
      designations: [],

      // legacy keys
      country: [],
      city: [],
      vidhansabha: [],
      ward: [],
      shaktikendra: [],
      booth: [],
      designation: [],
    },
    null,
    2
  );
}

function readJson(file) {
  if (file === "masters.json") return safeReadJson(file, mastersFallback());
  return safeReadJson(file, "[]");
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function sanitizeFilename(name) {
  const ext = path.extname(String(name || "")).toLowerCase();
  const safeExt = /^[a-z0-9.]+$/.test(ext) ? ext : "";
  return `${Date.now()}-${randomId(8)}${safeExt}`;
}

function requireSameOrigin(req, res, next) {
  const method = String(req.method || "").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return next();

  const origin = String(req.headers.origin || "");
  const host = String(req.headers.host || "");
  if (!origin) return next();

  try {
    const u = new URL(origin);
    if (u.host !== host) {
      return res.status(403).json({ success: false, message: "Cross-site request blocked" });
    }
  } catch {
    return res.status(403).json({ success: false, message: "Invalid origin" });
  }
  next();
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve) => {
    req.session.destroy(() => resolve());
  });
}

function normalizeMobile(mobile) {
  return String(mobile || "").replace(/\D/g, "");
}
function isValidMobile10(mobile) {
  return /^\d{10}$/.test(mobile);
}
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}
function detectIdentifierType(identifier) {
  const raw = String(identifier || "").trim();
  const mobile = normalizeMobile(raw);
  if (isValidMobile10(mobile)) return { type: "mobile", value: mobile };
  const email = normalizeEmail(raw);
  if (isValidEmail(email)) return { type: "email", value: email };
  return { type: "", value: "" };
}
function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}
function generateUserId() {
  return "U" + Date.now() + Math.floor(Math.random() * 100000);
}

/* ================= ADMINS HELPERS ================= */
function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}
function getAdminsList() {
  let admins = readJson("admins.json");
  if (!Array.isArray(admins)) admins = [];
  return admins;
}
function saveAdminsList(admins) {
  writeJson("admins.json", admins);
}
function countSuperAdmins(admins) {
  return admins.filter((a) => a.role === "super").length;
}

/* AUTO SEED SUPER ADMIN FROM .ENV IF admins.json EMPTY */
async function ensureSuperAdminSeeded() {
  let admins = getAdminsList();
  if (admins.length === 0) {
    const envUser = normalizeUsername(process.env.ADMIN_USER || "");
    const envPass = String(process.env.ADMIN_PASS || "").trim();

    if (envUser && envPass) {
      const passwordHash = await bcrypt.hash(envPass, 12);
      admins.push({ username: envUser, passwordHash, role: "super" });
      saveAdminsList(admins);
      console.log(`[ADMINS] Seeded super admin from .env: ${envUser}`);
    } else {
      console.log("[ADMINS] WARNING: ADMIN_USER/ADMIN_PASS missing in .env");
    }
  }
}

ensureSuperAdminSeeded().catch((err) => {
  console.error("[ADMINS] Seed failed:", err);
  process.exit(1);
});

/* ================= STORAGE (UPLOADS) ================= */
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync(path.join("uploads", "posts"))) {
  fs.mkdirSync(path.join("uploads", "posts"), { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join("uploads", "posts")),
  filename: (req, file, cb) => cb(null, sanitizeFilename(file.originalname)),
});

function mediaFileFilter(req, file, cb) {
  const mediaTypes = ["image/jpeg", "image/png", "video/mp4"];
  const textTypes = [
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];

  const name = (file.originalname || "").toLowerCase();

  const isTxt = name.endsWith(".txt");
  const isDoc = name.endsWith(".doc");
  const isDocx = name.endsWith(".docx");

  // Single media upload: add tweet / replace media
  if (file.fieldname === "media") {
    if (mediaTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error("Only JPEG, PNG and MP4 files are allowed."));
  }

  // Bulk text file
  if (file.fieldname === "batchFile") {
    if (textTypes.includes(file.mimetype) || isTxt || isDoc || isDocx) {
      return cb(null, true);
    }
    return cb(new Error("Bulk text file must be TXT, DOC, or DOCX."));
  }

  // Bulk media files
  if (file.fieldname === "mediaFiles") {
    if (mediaTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error("Only JPEG, PNG and MP4 files are allowed."));
  }

  return cb(new Error("Invalid upload field."));
}
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: mediaFileFilter
});

const bulkMediaUpload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024, files: 200 },
  fileFilter: mediaFileFilter
});

const batchUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, sanitizeFilename(file.originalname)),
  })
});

const excelUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, sanitizeFilename(file.originalname)),
  })
});
/* ================= AUTH MIDDLEWARE ================= */
function wantsJson(req) {
  const accept = String(req.headers.accept || "").toLowerCase();
  return (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/admin/get") ||
    req.path.startsWith("/admin/add") ||
    req.path.startsWith("/admin/update") ||
    req.path.startsWith("/admin/delete") ||
    req.path.startsWith("/admin/toggle") ||
    accept.includes("application/json")
  );
}

function isAdminAuth(req, res, next) {
  if (req.session.adminAuth) return next();

  if (wantsJson(req)) {
    return res.status(401).json({ success: false, message: "Admin login required" });
  }

  return res.redirect("/admin.html");
}

function isSuperAdmin(req, res, next) {
  if (req.session.adminRole !== "super") {
    return res.status(403).json({ success: false, message: "Super admin only" });
  }
  next();
}

function isUserAuth(req, res, next) {
  if (req.session.userAuth) return next();

  if (wantsJson(req)) {
    return res.status(401).json({ success: false, message: "User login required" });
  }

  return res.redirect("/login.html");
}

/* ================= MASTERS HELPERS (HIERARCHY) ================= */
function uid(prefix) {
  return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
}
function sameName(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}
function normalizeMasterName(v) {
  return String(v || "").trim();
}

function mastersSafe(m) {
  if (!m || typeof m !== "object") m = {};
  const keys = ["countries", "states", "cities", "loksabhas", "vidhansabhas", "wards", "designations"];
  for (const k of keys) if (!Array.isArray(m[k])) m[k] = [];

  // keep legacy keys (older pages)
  const legacy = ["country", "city", "vidhansabha", "ward", "shaktikendra", "booth", "designation"];
  for (const k of legacy) if (m[k] && !Array.isArray(m[k])) m[k] = [];

  return m;
}

/**
 * Best-effort legacy migration (only if new lists empty).
 * Old schema had no parent links; we migrate minimally.
 */
function ensureMastersMigrated() {
  const masters = mastersSafe(readJson("masters.json"));

  const newEmpty =
    masters.countries.length === 0 &&
    masters.states.length === 0 &&
    masters.cities.length === 0 &&
    masters.loksabhas.length === 0 &&
    masters.vidhansabhas.length === 0 &&
    masters.wards.length === 0 &&
    masters.designations.length === 0;

  const hasOld =
    Array.isArray(masters.country) ||
    Array.isArray(masters.states) ||
    Array.isArray(masters.city) ||
    Array.isArray(masters.vidhansabha) ||
    Array.isArray(masters.ward) ||
    Array.isArray(masters.designation);

  if (!newEmpty || !hasOld) return;

  try {
    const oldCountries = Array.isArray(masters.country) ? masters.country : [];
    for (const name of oldCountries) {
      const n = normalizeMasterName(name);
      if (!n) continue;
      if (!masters.countries.some((c) => sameName(c.name, n))) masters.countries.push({ id: uid("C"), name: n });
    }

    // states only if single country
    const oldStates = Array.isArray(masters.states) ? masters.states : [];
    const countryId = masters.countries.length === 1 ? masters.countries[0].id : null;
    if (countryId) {
      for (const name of oldStates) {
        const n = normalizeMasterName(name);
        if (!n) continue;
        if (!masters.states.some((s) => s.countryId === countryId && sameName(s.name, n))) {
          masters.states.push({ id: uid("S"), countryId, name: n });
        }
      }
    }

    // cities only if single state
    const stateId = masters.states.length === 1 ? masters.states[0].id : null;
    const oldCities = Array.isArray(masters.city) ? masters.city : [];
    if (stateId) {
      for (const name of oldCities) {
        const n = normalizeMasterName(name);
        if (!n) continue;
        if (!masters.cities.some((x) => x.stateId === stateId && sameName(x.name, n))) {
          masters.cities.push({ id: uid("CI"), stateId, name: n });
        }
      }
    }

    const oldDes = Array.isArray(masters.designation) ? masters.designation : [];
    for (const name of oldDes) {
      const n = normalizeMasterName(name);
      if (!n) continue;
      if (!masters.designations.some((d) => sameName(d.name, n))) masters.designations.push({ id: uid("D"), name: n });
    }

    writeJson("masters.json", masters);
    console.log("[MASTERS] Migrated legacy masters.json to hierarchy (best-effort).");
  } catch (e) {
    console.error("[MASTERS] Migration failed:", e);
  }
}
ensureMastersMigrated();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many OTP requests. Please try again later." }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests" }
});

app.use("/admin/", apiLimiter);
app.use("/api/", apiLimiter);
app.use("/user/", apiLimiter);
/* ================= ADMIN AUTH ================= */
app.post("/admin/login", authLimiter, async (req, res) => {
  try {
    const usernameRaw = req.body.username;
    const password = String(req.body.password || "");
    const username = normalizeUsername(usernameRaw);

    if (!username || password.length < 8) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    const admins = getAdminsList();
    const admin = admins.find((a) => normalizeUsername(a.username) === username);

    if (!admin || !admin.passwordHash) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    await regenerateSession(req);
    req.session.adminAuth = true;
    req.session.adminUser = admin.username;
    req.session.adminRole = admin.role === "super" ? "super" : "normal";

    return res.json({ success: true, role: req.session.adminRole });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Login failed" });
  }
});
app.post("/user/logout", requireSameOrigin, async (req, res) => {
  await destroySession(req);
  res.clearCookie("sid");
  return res.json({ success: true, next: "/login.html" });
});

app.post("/admin/logout", requireSameOrigin, async (req, res) => {
  await destroySession(req);
  res.clearCookie("sid");
  return res.json({ success: true, next: "/admin.html" });
});

app.get("/admin/myRole", isAdminAuth, (req, res) => {
  res.json({
    success: true,
    role: req.session.adminRole || "normal",
    username: req.session.adminUser || "",
  });
});

/* ================= ADMIN PAGES (PROTECTED) ================= */
app.get("/dashboard.html", isAdminAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "public/dashboard.html"))
);

app.get("/manage.html", isAdminAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "public/manage.html"))
);

app.get("/analytics.html", isAdminAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "public/analytics.html"))
);

/* SUPER ADMIN ONLY PAGES */
app.get("/users.html", isAdminAuth, (req, res) => {
  if (req.session.adminRole !== "super") return res.redirect("/dashboard.html");
  res.sendFile(path.join(__dirname, "public/users.html"));
});

app.get("/admins.html", isAdminAuth, (req, res) => {
  if (req.session.adminRole !== "super") return res.redirect("/dashboard.html");
  res.sendFile(path.join(__dirname, "public/admins.html"));
});

app.get("/masters.html", isAdminAuth, (req, res) => {
  if (req.session.adminRole !== "super") return res.redirect("/dashboard.html");
  res.sendFile(path.join(__dirname, "public/masters.html"));
});

/* ✅ NOW serve static AFTER protected pages, so masters.html cannot bypass auth */
app.use(express.static("public"));

/* ================= SUPER ADMIN: ADMIN MANAGEMENT APIs ================= */
app.get("/admin/getAdmins", isAdminAuth, isSuperAdmin, (req, res) => {
  const admins = getAdminsList().map((a) => ({
    username: a.username,
    role: a.role === "super" ? "super" : "normal",
  }));
  res.json({ success: true, admins });
});

app.post("/admin/addAdmin", requireSameOrigin, isAdminAuth, isSuperAdmin, async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");
  const role = String(req.body.role || "normal") === "super" ? "super" : "normal";

  if (!username) return res.status(400).json({ success: false, message: "Username required" });
  if (password.length < 4)
    return res.status(400).json({ success: false, message: "Password min 4 chars" });

  const admins = getAdminsList();
  if (admins.find((a) => normalizeUsername(a.username) === username)) {
    return res.status(409).json({ success: false, message: "Admin already exists" });
  }

 const passwordHash = await bcrypt.hash(password, 12);
admins.push({ username, passwordHash, role });
  saveAdminsList(admins);
  res.json({ success: true });
});

app.delete("/admin/deleteAdmin/:username", requireSameOrigin, isAdminAuth, isSuperAdmin, (req, res) => {
  const username = normalizeUsername(req.params.username);

  let admins = getAdminsList();
  const target = admins.find((a) => normalizeUsername(a.username) === username);
  if (!target) return res.status(404).json({ success: false, message: "Admin not found" });

  if (normalizeUsername(req.session.adminUser) === username) {
    return res
      .status(400)
      .json({ success: false, message: "You cannot delete your own admin account" });
  }

  if (target.role === "super" && countSuperAdmins(admins) <= 1) {
    return res.status(400).json({ success: false, message: "Cannot delete last super admin" });
  }

  admins = admins.filter((a) => normalizeUsername(a.username) !== username);
  saveAdminsList(admins);
  res.json({ success: true });
});

/* ================= MASTERS (SUPER ADMIN) - NEW HIERARCHY APIs ================= */
const LEVELS = ["countries", "states", "cities", "loksabhas", "vidhansabhas", "wards", "designations"];

const NEED_PARENT = {
  states: true,       // parentId = countryId
  cities: true,       // parentId = stateId
  loksabhas: true,    // parentId = stateId
  vidhansabhas: true, // parentId = lokId
  wards: true,        // handled by special /admin/addWard route
};

function getParentField(level) {
  if (level === "states") return "countryId";
  if (level === "cities") return "stateId";
  if (level === "loksabhas") return "stateId";
  if (level === "vidhansabhas") return "lokId";
  if (level === "wards") return "cityId";
  return null;
}

app.get("/admin/getMasters", isAdminAuth, (req, res) => {
  if (req.session.adminRole !== "super") return res.status(403).json({ success: false });
  const masters = mastersSafe(readJson("masters.json"));
  return res.json({ success: true, masters });
});

app.post("/admin/addMaster", requireSameOrigin, isAdminAuth, isSuperAdmin, (req, res) => {
  const level = String(req.body.level || "").trim();
  const name = normalizeMasterName(req.body.name);
  const parentId = String(req.body.parentId || "").trim();

  if (!LEVELS.includes(level)) {
    return res.status(400).json({ success: false, message: "Invalid level" });
  }

  if (level === "wards") {
    return res.status(400).json({
      success: false,
      message: "Use /admin/addWard for ward creation"
    });
  }

  if (!name) {
    return res.status(400).json({ success: false, message: "Name required" });
  }

  if (NEED_PARENT[level] && !parentId) {
    return res.status(400).json({ success: false, message: "parentId required" });
  }

  const masters = mastersSafe(readJson("masters.json"));
  const list = masters[level];

  const pf = getParentField(level);
  const exists = list.some((x) => {
    if (pf) return String(x[pf]) === String(parentId) && sameName(x.name, name);
    return sameName(x.name, name);
  });

  if (exists) {
    return res.status(409).json({ success: false, message: "Already exists" });
  }

  const item = { id: uid(level[0].toUpperCase()), name };
  if (pf) item[pf] = parentId;

  masters[level].push(item);
  writeJson("masters.json", masters);

  return res.json({ success: true, item });
});


const uploadCsv = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, sanitizeFilename(file.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") return cb(null, true);
    return cb(new Error("Only .xlsx or .xls files are allowed."));
  }
});

function emptyMastersStructure() {
  return {
    countries: [],
    states: [],
    cities: [],
    loksabhas: [],
    vidhansabhas: [],
    wards: [],
    designations: [],

    // legacy keys so old pages do not break
    country: [],
    city: [],
    vidhansabha: [],
    ward: [],
    shaktikendra: [],
    booth: [],
    designation: []
  };
}

function sheetRowsCountries(masters) {
  return (masters.countries || []).map((x) => ({
    id: x.id || "",
    name: x.name || ""
  }));
}

function sheetRowsStates(masters) {
  return (masters.states || []).map((x) => {
    const country = (masters.countries || []).find((c) => String(c.id) === String(x.countryId));
    return {
      id: x.id || "",
      name: x.name || "",
      countryId: x.countryId || "",
      countryName: country?.name || ""
    };
  });
}

function sheetRowsCities(masters) {
  return (masters.cities || []).map((x) => {
    const state = (masters.states || []).find((s) => String(s.id) === String(x.stateId));
    const country = state
      ? (masters.countries || []).find((c) => String(c.id) === String(state.countryId))
      : null;

    return {
      id: x.id || "",
      name: x.name || "",
      stateId: x.stateId || "",
      stateName: state?.name || "",
      countryId: state?.countryId || "",
      countryName: country?.name || ""
    };
  });
}

function sheetRowsLoksabhas(masters) {
  return (masters.loksabhas || []).map((x) => {
    const state = (masters.states || []).find((s) => String(s.id) === String(x.stateId));
    const country = state
      ? (masters.countries || []).find((c) => String(c.id) === String(state.countryId))
      : null;

    return {
      id: x.id || "",
      name: x.name || "",
      stateId: x.stateId || "",
      stateName: state?.name || "",
      countryId: state?.countryId || "",
      countryName: country?.name || ""
    };
  });
}

function sheetRowsVidhansabhas(masters) {
  return (masters.vidhansabhas || []).map((x) => {
    const lok = (masters.loksabhas || []).find((l) => String(l.id) === String(x.lokId));
    const state = lok
      ? (masters.states || []).find((s) => String(s.id) === String(lok.stateId))
      : null;
    const country = state
      ? (masters.countries || []).find((c) => String(c.id) === String(state.countryId))
      : null;

    return {
      id: x.id || "",
      name: x.name || "",
      lokId: x.lokId || "",
      lokName: lok?.name || "",
      stateId: lok?.stateId || "",
      stateName: state?.name || "",
      countryId: state?.countryId || "",
      countryName: country?.name || ""
    };
  });
}

function sheetRowsWards(masters) {
  return (masters.wards || []).map((x) => {
    const city = (masters.cities || []).find((c) => String(c.id) === String(x.cityId));
    const state = city
      ? (masters.states || []).find((s) => String(s.id) === String(city.stateId))
      : null;
    const country = state
      ? (masters.countries || []).find((c) => String(c.id) === String(state.countryId))
      : null;

    const vid = (masters.vidhansabhas || []).find(
      (v) => String(v.id) === String(x.vidhansabhaId)
    );
    const lok = vid
      ? (masters.loksabhas || []).find((l) => String(l.id) === String(vid.lokId))
      : null;

    return {
      id: x.id || "",
      name: x.name || "",
      cityId: x.cityId || "",
      cityName: city?.name || "",
      vidhansabhaId: x.vidhansabhaId || "",
      vidhansabhaName: vid?.name || "",
      lokId: vid?.lokId || "",
      lokName: lok?.name || "",
      stateId: city?.stateId || "",
      stateName: state?.name || "",
      countryId: state?.countryId || "",
      countryName: country?.name || ""
    };
  });
}

function sheetRowsDesignations(masters) {
  return (masters.designations || []).map((x) => ({
    id: x.id || "",
    name: x.name || ""
  }));
}

function readSheetRows(wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

/* ================= EXPORT MASTERS WORKBOOK ================= */

app.get("/admin/exportMastersWorkbook", isAdminAuth, isSuperAdmin, (req, res) => {
  try {
    const masters = mastersSafe(readJson("masters.json"));
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheetRowsCountries(masters)),
      "countries"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheetRowsStates(masters)),
      "states"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheetRowsCities(masters)),
      "cities"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheetRowsLoksabhas(masters)),
      "loksabhas"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheetRowsVidhansabhas(masters)),
      "vidhansabhas"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheetRowsWards(masters)),
      "wards"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheetRowsDesignations(masters)),
      "designations"
    );

    const fileBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=masters-workbook.xlsx");

    return res.send(fileBuffer);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Failed to export masters workbook");
  }
});

/* ================= IMPORT MASTERS WORKBOOK ================= */

app.post("/admin/importMastersWorkbook", requireSameOrigin, isAdminAuth, isSuperAdmin, uploadCsv.single("file"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Excel file required" });
      }

      const ext = path.extname(req.file.originalname || "").toLowerCase();
      if (![".xlsx", ".xls"].includes(ext)) {
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).json({
          success: false,
          message: "Only .xlsx or .xls file is allowed"
        });
      }

      const wb = XLSX.readFile(req.file.path);

      const countriesRows = readSheetRows(wb, "countries");
      const statesRows = readSheetRows(wb, "states");
      const citiesRows = readSheetRows(wb, "cities");
      const loksabhasRows = readSheetRows(wb, "loksabhas");
      const vidhansabhasRows = readSheetRows(wb, "vidhansabhas");
      const wardsRows = readSheetRows(wb, "wards");
      const designationsRows = readSheetRows(wb, "designations");

      const masters = emptyMastersStructure();

      const countryMap = new Map();
      const stateMap = new Map();
      const cityMap = new Map();
      const lokMap = new Map();
      const vidMap = new Map();

      for (const row of countriesRows) {
        const id = String(row.id || "").trim() || uid("C");
        const name = normalizeMasterName(row.name);
        if (!name) continue;

        const item = { id, name };
        masters.countries.push(item);
        countryMap.set(id, item);
      }

      for (const row of statesRows) {
        const id = String(row.id || "").trim() || uid("S");
        const name = normalizeMasterName(row.name);
        const countryId = String(row.countryId || "").trim();

        if (!name || !countryId || !countryMap.has(countryId)) continue;

        const item = { id, name, countryId };
        masters.states.push(item);
        stateMap.set(id, item);
      }

      for (const row of citiesRows) {
        const id = String(row.id || "").trim() || uid("CI");
        const name = normalizeMasterName(row.name);
        const stateId = String(row.stateId || "").trim();

        if (!name || !stateId || !stateMap.has(stateId)) continue;

        const item = { id, name, stateId };
        masters.cities.push(item);
        cityMap.set(id, item);
      }

      for (const row of loksabhasRows) {
        const id = String(row.id || "").trim() || uid("L");
        const name = normalizeMasterName(row.name);
        const stateId = String(row.stateId || "").trim();

        if (!name || !stateId || !stateMap.has(stateId)) continue;

        const item = { id, name, stateId };
        masters.loksabhas.push(item);
        lokMap.set(id, item);
      }

      for (const row of vidhansabhasRows) {
        const id = String(row.id || "").trim() || uid("V");
        const name = normalizeMasterName(row.name);
        const lokId = String(row.lokId || "").trim();

        if (!name || !lokId || !lokMap.has(lokId)) continue;

        const item = { id, name, lokId };
        masters.vidhansabhas.push(item);
        vidMap.set(id, item);
      }

      for (const row of wardsRows) {
        const id = String(row.id || "").trim() || uid("W");
        const name = normalizeMasterName(row.name);
        const cityId = String(row.cityId || "").trim();
        const vidhansabhaId = String(row.vidhansabhaId || "").trim();

        if (!name || !cityId || !vidhansabhaId) continue;
        if (!cityMap.has(cityId) || !vidMap.has(vidhansabhaId)) continue;

        masters.wards.push({
          id,
          name,
          cityId,
          vidhansabhaId
        });
      }

      for (const row of designationsRows) {
        const id = String(row.id || "").trim() || uid("D");
        const name = normalizeMasterName(row.name);
        if (!name) continue;

        masters.designations.push({ id, name });
      }

      writeJson("masters.json", masters);

      try { fs.unlinkSync(req.file.path); } catch {}

      return res.json({
        success: true,
        message: "Masters workbook imported successfully"
      });
    } catch (e) {
      console.error(e);
      try {
        if (req.file?.path) fs.unlinkSync(req.file.path);
      } catch {}
      return res.status(500).json({
        success: false,
        message: "Workbook import failed"
      });
    }
  }
);
app.post("/admin/addWard", requireSameOrigin, isAdminAuth, isSuperAdmin, (req, res) => {
  try {
    const cityId = String(req.body.cityId || "").trim();
    const vidhansabhaId = String(req.body.vidhansabhaId || "").trim();
    const name = normalizeMasterName(req.body.name);

    if (!cityId || !vidhansabhaId || !name) {
      return res.status(400).json({
        success: false,
        message: "City, Vidhan Sabha and ward name are required"
      });
    }

    const masters = mastersSafe(readJson("masters.json"));

    const city = masters.cities.find((x) => String(x.id) === String(cityId));
    if (!city) {
      return res.status(400).json({ success: false, message: "Invalid city" });
    }

    const vid = masters.vidhansabhas.find((x) => String(x.id) === String(vidhansabhaId));
    if (!vid) {
      return res.status(400).json({ success: false, message: "Invalid Vidhan Sabha" });
    }

    const exists = masters.wards.some(
      (x) =>
        String(x.cityId) === String(cityId) &&
        String(x.vidhansabhaId) === String(vidhansabhaId) &&
        sameName(x.name, name)
    );

    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Ward already exists for this City + Vidhan Sabha"
      });
    }

    const item = {
      id: uid("W"),
      name,
      cityId,
      vidhansabhaId
    };

    masters.wards.push(item);
    writeJson("masters.json", masters);

    return res.json({ success: true, item });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Failed to add ward" });
  }
});

/* cascade delete children */
app.delete("/admin/deleteMaster/:level/:id", requireSameOrigin, isAdminAuth, isSuperAdmin, (req, res) => {
  const level = String(req.params.level || "").trim();
  const id = String(req.params.id || "").trim();
  if (!LEVELS.includes(level)) return res.status(400).json({ success: false, message: "Invalid level" });
  if (!id) return res.status(400).json({ success: false, message: "Invalid id" });

  const masters = mastersSafe(readJson("masters.json"));

  function removeById(arr, _id) {
    return arr.filter((x) => String(x.id) !== String(_id));
  }

  if (level === "countries") {
    // remove states under country
    const stateIds = masters.states.filter((s) => String(s.countryId) === String(id)).map((s) => s.id);
    masters.states = masters.states.filter((s) => String(s.countryId) !== String(id));

    // remove cities under those states + wards under those cities
    const cityIds = masters.cities.filter((c) => stateIds.includes(c.stateId)).map((c) => c.id);
    masters.cities = masters.cities.filter((c) => !stateIds.includes(c.stateId));
    masters.wards = masters.wards.filter((w) => !cityIds.includes(w.cityId));

    // remove loksabhas under those states
    const lokIds = masters.loksabhas.filter((l) => stateIds.includes(l.stateId)).map((l) => l.id);
    masters.loksabhas = masters.loksabhas.filter((l) => !stateIds.includes(l.stateId));

    // remove vidhansabhas under those loksabhas
    masters.vidhansabhas = masters.vidhansabhas.filter((v) => !lokIds.includes(v.lokId));

    // finally remove country
    masters.countries = removeById(masters.countries, id);
    writeJson("masters.json", masters);
    return res.json({ success: true });
  }

  if (level === "states") {
    // cities + wards
    const cityIds = masters.cities.filter((c) => String(c.stateId) === String(id)).map((c) => c.id);
    masters.cities = masters.cities.filter((c) => String(c.stateId) !== String(id));
    masters.wards = masters.wards.filter((w) => !cityIds.includes(w.cityId));

    // loksabhas + vidhansabhas
    const lokIds = masters.loksabhas.filter((l) => String(l.stateId) === String(id)).map((l) => l.id);
    masters.loksabhas = masters.loksabhas.filter((l) => String(l.stateId) !== String(id));
    masters.vidhansabhas = masters.vidhansabhas.filter((v) => !lokIds.includes(v.lokId));

    masters.states = removeById(masters.states, id);
    writeJson("masters.json", masters);
    return res.json({ success: true });
  }

  if (level === "cities") {
    masters.wards = masters.wards.filter((w) => String(w.cityId) !== String(id));
    masters.cities = removeById(masters.cities, id);
    writeJson("masters.json", masters);
    return res.json({ success: true });
  }

  if (level === "loksabhas") {
    masters.vidhansabhas = masters.vidhansabhas.filter((v) => String(v.lokId) !== String(id));
    masters.loksabhas = removeById(masters.loksabhas, id);
    writeJson("masters.json", masters);
    return res.json({ success: true });
  }

  if (level === "vidhansabhas") {
    masters.wards = masters.wards.filter((w) => String(w.vidhansabhaId) !== String(id));
    masters.vidhansabhas = removeById(masters.vidhansabhas, id);
    writeJson("masters.json", masters);
    return res.json({ success: true });
  }

  if (level === "wards") {
    masters.wards = removeById(masters.wards, id);
    writeJson("masters.json", masters);
    return res.json({ success: true });
  }

  if (level === "designations") {
    masters.designations = removeById(masters.designations, id);
    writeJson("masters.json", masters);
    return res.json({ success: true });
  }

  masters[level] = removeById(masters[level], id);
  writeJson("masters.json", masters);
  return res.json({ success: true });
});

app.post("/admin/updateMaster", requireSameOrigin, isAdminAuth, isSuperAdmin, (req, res) => {
  try {
    const level = String(req.body.level || "").trim();
    const id = String(req.body.id || "").trim();
    const name = normalizeMasterName(req.body.name);

    if (!LEVELS.includes(level)) {
      return res.status(400).json({ success: false, message: "Invalid level" });
    }

    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    if (!name) {
      return res.status(400).json({ success: false, message: "Name required" });
    }

    const masters = mastersSafe(readJson("masters.json"));
    const arr = Array.isArray(masters[level]) ? masters[level] : [];
    const item = arr.find((x) => String(x.id) === String(id));

    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    if (level === "wards") {
      const exists = arr.some(
        (x) =>
          String(x.id) !== String(id) &&
          String(x.cityId) === String(item.cityId) &&
          String(x.vidhansabhaId) === String(item.vidhansabhaId) &&
          sameName(x.name, name)
      );

      if (exists) {
        return res.status(409).json({
          success: false,
          message: "Ward already exists for this City + Vidhan Sabha"
        });
      }
    } else {
      const parentField = getParentField(level);
      const exists = arr.some((x) => {
        if (String(x.id) === String(id)) return false;
        if (parentField && String(x[parentField]) !== String(item[parentField])) return false;
        return sameName(x.name, name);
      });

      if (exists) {
        return res.status(409).json({
          success: false,
          message: `${level} already exists`
        });
      }
    }

    item.name = name;
    writeJson("masters.json", masters);

    return res.json({ success: true, item });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Failed to update master" });
  }
});

/**
 * Excel bulk upload per level
 * Sheet name should match selected level if present.
 *
 * Standard headers:
 *  - countries:      name
 *  - states:         name, parentName
 *  - cities:         name, parentName
 *  - loksabhas:      name, parentName
 *  - vidhansabhas:   name, parentName
 *  - wards:          name, cityName, vidhansabhaName
 *  - designations:   name
 */
// NEW ROUTE (paste this)
app.get("/admin/downloadMastersTemplate/:level", isAdminAuth, isSuperAdmin, (req, res) => {
  const level = String(req.params.level || "").trim();

  if (!LEVELS.includes(level)) {
    return res.status(400).send("Invalid level");
  }

  if (!XLSX) {
    return res.status(500).send("xlsx not installed. Run: npm i xlsx");
  }

  const wb = XLSX.utils.book_new();

  const instructions = [
    ["Bulk Master Upload Guide"],
    [""],
    ["Selected Level", level],
    [""],
    ["How to use"],
    ["1. Keep header names exactly the same"],
    ["2. Parent names must already exist"],
    ["3. Upload the same file from Masters page"],
    ["4. Wards need cityName + vidhansabhaName"]
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, ws1, "Instructions");

  let rows = [];

  if (level === "countries") {
    rows = [{ name: "India" }];
  }

  if (level === "states") {
    rows = [{ name: "Gujarat", parentName: "India" }];
  }

  if (level === "cities") {
    rows = [{ name: "Surat", parentName: "Gujarat" }];
  }

  if (level === "loksabhas") {
    rows = [{ name: "Surat Lok Sabha", parentName: "Gujarat" }];
  }

  if (level === "vidhansabhas") {
    rows = [{ name: "Varachha Road", parentName: "Surat Lok Sabha" }];
  }

  if (level === "wards") {
    rows = [
      { name: "Ward 12", cityName: "Surat", vidhansabhaName: "Varachha Road" },
      { name: "Ward 12", cityName: "Surat", vidhansabhaName: "Karanj" }
    ];
  }

  if (level === "designations") {
    rows = [{ name: "Volunteer" }];
  }

  const ws2 = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws2, level);

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="masters-template-${level}.xlsx"`
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  res.send(buf);
});
app.post(
  "/admin/uploadMastersExcel/:level",
  requireSameOrigin,
  isAdminAuth,
  isSuperAdmin,
  excelUpload.single("file"),
  (req, res) => {
    const level = String(req.params.level || "").trim();
    if (!LEVELS.includes(level)) {
      return res.status(400).json({ success: false, message: "Invalid level" });
    }

    if (!XLSX) {
      return res.status(500).json({ success: false, message: "xlsx not installed. Run: npm i xlsx" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "File required" });
    }

    try {
      const wb = XLSX.readFile(req.file.path);
      const sheetName = wb.SheetNames.includes(level) ? level : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const masters = mastersSafe(readJson("masters.json"));

      function findIdByName(list, name) {
        const n = String(name || "").trim().toLowerCase();
        const item = list.find((x) => String(x.name || "").trim().toLowerCase() === n);
        return item ? item.id : null;
      }

      let added = 0;

      for (const r of rows) {
        const name = normalizeMasterName(r.name);
        if (!name) continue;

        if (level === "countries") {
          const exists = masters.countries.some((x) => sameName(x.name, name));
          if (exists) continue;

          masters.countries.push({ id: uid("C"), name });
          added++;
          continue;
        }

        if (level === "states") {
          const parentId = findIdByName(masters.countries, r.parentName);
          if (!parentId) continue;

          const exists = masters.states.some(
            (x) => String(x.countryId) === String(parentId) && sameName(x.name, name)
          );
          if (exists) continue;

          masters.states.push({ id: uid("S"), name, countryId: parentId });
          added++;
          continue;
        }

        if (level === "cities") {
          const parentId = findIdByName(masters.states, r.parentName);
          if (!parentId) continue;

          const exists = masters.cities.some(
            (x) => String(x.stateId) === String(parentId) && sameName(x.name, name)
          );
          if (exists) continue;

          masters.cities.push({ id: uid("CI"), name, stateId: parentId });
          added++;
          continue;
        }

        if (level === "loksabhas") {
          const parentId = findIdByName(masters.states, r.parentName);
          if (!parentId) continue;

          const exists = masters.loksabhas.some(
            (x) => String(x.stateId) === String(parentId) && sameName(x.name, name)
          );
          if (exists) continue;

          masters.loksabhas.push({ id: uid("L"), name, stateId: parentId });
          added++;
          continue;
        }

        if (level === "vidhansabhas") {
          const parentId = findIdByName(masters.loksabhas, r.parentName);
          if (!parentId) continue;

          const exists = masters.vidhansabhas.some(
            (x) => String(x.lokId) === String(parentId) && sameName(x.name, name)
          );
          if (exists) continue;

          masters.vidhansabhas.push({ id: uid("V"), name, lokId: parentId });
          added++;
          continue;
        }

        if (level === "wards") {
          const cityId = findIdByName(masters.cities, r.cityName);
          const vidhansabhaId = findIdByName(masters.vidhansabhas, r.vidhansabhaName);

          if (!cityId || !vidhansabhaId) continue;

          const exists = masters.wards.some(
            (x) =>
              String(x.cityId) === String(cityId) &&
              String(x.vidhansabhaId) === String(vidhansabhaId) &&
              sameName(x.name, name)
          );
          if (exists) continue;

          masters.wards.push({
            id: uid("W"),
            name,
            cityId,
            vidhansabhaId
          });
          added++;
          continue;
        }

        if (level === "designations") {
          const exists = masters.designations.some((x) => sameName(x.name, name));
          if (exists) continue;

          masters.designations.push({ id: uid("D"), name });
          added++;
          continue;
        }
      }

      writeJson("masters.json", masters);

      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}

      return res.json({ success: true, added });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "Excel upload failed" });
    }
  }
);

/* ================= USER: MASTER FETCH (CASCADING) ================= */
/**
 * GET /api/masters?level=states&parentId=...
 * levels:
 *  - countries (no parent)
 *  - states (parent=countryId)
 *  - cities (parent=stateId)
 *  - loksabhas (parent=stateId)
 *  - vidhansabhas (parent=lokId)
 *  - wards (parent=cityId)                 // UI filters ward by city + vidhansabha from full master data
 *  - designations (no parent)
 */
app.get("/api/masters", isUserAuth, (req, res) => {
  const level = String(req.query.level || "").trim();
  const parentId = String(req.query.parentId || "").trim();
  const masters = mastersSafe(readJson("masters.json"));

  if (!LEVELS.includes(level)) return res.status(400).json({ success: false, message: "Invalid level" });

  if (level === "countries") return res.json({ success: true, items: masters.countries });
  if (level === "designations") return res.json({ success: true, items: masters.designations });

  const pf = getParentField(level);
  if (!pf) return res.status(400).json({ success: false, message: "Invalid level parent mapping" });
  if (!parentId) return res.status(400).json({ success: false, message: "parentId required" });

  const items = masters[level].filter((x) => String(x[pf]) === String(parentId));
  return res.json({ success: true, items });
});

/* ================= BACKWARD COMPAT: FULL MASTER DATA ================= */
app.get("/api/masterData", isUserAuth, (req, res) => {
  const masters = mastersSafe(readJson("masters.json"));
  return res.json({ success: true, masters });
});

/* ================= LEGACY MASTER APIs (kept so older pages don't crash) ================= */
const MASTER_KEYS_LEGACY = [
  "country",
  "states",
  "city",
  "vidhansabha",
  "ward",
  "shaktikendra",
  "booth",
  "designation",
];

app.post("/admin/addMasterItem", requireSameOrigin, isAdminAuth, isSuperAdmin, (req, res) => {
  const key = String(req.body.key || "").trim();
  const value = normalizeMasterName(req.body.value);

  if (!MASTER_KEYS_LEGACY.includes(key))
    return res.status(400).json({ success: false, message: "Invalid master key" });
  if (!value) return res.status(400).json({ success: false, message: "Value required" });

  const masters = mastersSafe(readJson("masters.json"));
  const arr = Array.isArray(masters[key]) ? masters[key] : [];
  if (arr.includes(value)) return res.status(409).json({ success: false, message: "Already exists" });

  arr.push(value);
  masters[key] = arr;
  writeJson("masters.json", masters);

  res.json({ success: true });
});

app.delete("/admin/deleteMasterItem", requireSameOrigin, isAdminAuth, isSuperAdmin, (req, res) => {
  const key = String(req.body.key || "").trim();
  const value = normalizeMasterName(req.body.value);

  if (!MASTER_KEYS_LEGACY.includes(key))
    return res.status(400).json({ success: false, message: "Invalid master key" });
  if (!value) return res.status(400).json({ success: false, message: "Value required" });

  const masters = mastersSafe(readJson("masters.json"));
  const arr = Array.isArray(masters[key]) ? masters[key] : [];
  masters[key] = arr.filter((x) => x !== value);
  writeJson("masters.json", masters);

  res.json({ success: true });
});

app.post("/admin/uploadMastersExcel", requireSameOrigin, isAdminAuth, isSuperAdmin, excelUpload.single("file"), (req, res) => {
    if (!XLSX) {
      return res
        .status(500)
        .json({ success: false, message: "xlsx not installed. Run: npm i xlsx" });
    }
    if (!req.file) return res.status(400).json({ success: false, message: "File required" });

    try {
      const wb = XLSX.readFile(req.file.path);
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const masters = mastersSafe(readJson("masters.json"));
      for (const key of MASTER_KEYS_LEGACY) {
        if (!Array.isArray(masters[key])) masters[key] = [];
      }

      rows.forEach((r) => {
        MASTER_KEYS_LEGACY.forEach((key) => {
          const v = normalizeMasterName(r[key]);
          if (v && !masters[key].includes(v)) masters[key].push(v);
        });
      });

      writeJson("masters.json", masters);
      return res.json({ success: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "Failed to parse excel" });
    } finally {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
  }
);

/* ================= USER SIGNUP ================= */
/* ================= USER SIGNUP ================= */
app.post("/user/request-signup-otp", otpLimiter, (req, res) => {
  try {
    const type = String(req.body.type || "").trim().toLowerCase();
    const rawValue = String(req.body.value || "").trim();

    let value = "";

    if (type === "mobile") {
      value = normalizeMobile(rawValue);
      if (!isValidMobile10(value)) {
        return res.status(400).json({
          success: false,
          message: "Enter valid 10 digit mobile number"
        });
      }
    } else if (type === "email") {
      value = normalizeEmail(rawValue);
      if (!isValidEmail(value)) {
        return res.status(400).json({
          success: false,
          message: "Enter valid email address"
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP type"
      });
    }

    const users = readJson("users.json");

    const alreadyExists =
      type === "mobile"
        ? users.some((u) => String(u.mobile || "") === value)
        : users.some((u) => normalizeEmail(u.email || "") === value);

    if (alreadyExists) {
      return res.status(409).json({
        success: false,
        message: type === "mobile"
          ? "Mobile already registered"
          : "Email already registered"
      });
    }

    if (DEMO_MODE) {
      return res.json({
        success: true,
        message: `Demo: any ${type} OTP works`
      });
    }

    const otp = generateOtpCode();
    const now = Date.now();
    const expiresAt = now + 5 * 60 * 1000;

    let otps = readJson("otp.json");
    otps = otps.filter(
      (o) => !(o.purpose === "signup" && o.type === type && o.value === value)
    );

    otps.push({
      purpose: "signup",
      type,
      value,
      otp,
      attempts: 0,
      createdAt: now,
      expiresAt
    });

    writeJson("otp.json", otps);

    if (!IS_PROD) {
      console.log(`[OTP][SIGNUP] ${type}: ${value} OTP generated`);
    }

    return res.json({
      success: true,
      message: `${type === "email" ? "Email" : "Mobile"} OTP sent`
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false });
  }
});

app.post("/user/verify-signup-otp", otpLimiter, (req, res) => {
  try {
    const type = String(req.body.type || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();
    const rawValue = String(req.body.value || "").trim();

    let value = "";
    if (type === "mobile") {
      value = normalizeMobile(rawValue);
      if (!isValidMobile10(value)) {
        return res.status(400).json({ success: false, message: "Enter valid 10 digit mobile number" });
      }
    } else if (type === "email") {
      value = normalizeEmail(rawValue);
      if (!isValidEmail(value)) {
        return res.status(400).json({ success: false, message: "Enter valid email address" });
      }
    } else {
      return res.status(400).json({ success: false, message: "Invalid OTP type" });
    }

if (!otp) {
  return res.status(400).json({ success: false, message: "OTP required" });
}

const users = readJson("users.json");

if (type === "mobile") {
  const exists = users.some((u) => String(u.mobile || "") === value);
  if (exists) {
    return res.status(409).json({
      success: false,
      message: "Mobile number already exists"
    });
  }
}

if (type === "email") {
  const exists = users.some((u) => normalizeEmail(u.email || "") === value);
  if (exists) {
    return res.status(409).json({
      success: false,
      message: "Email already exists"
    });
  }
}

if (DEMO_MODE) {
  return res.json({ success: true, message: `${type === "email" ? "Email" : "Mobile"} verified` });
}

    let otps = readJson("otp.json");
    const recIndex = otps.findIndex((o) =>
      o.purpose === "signup" &&
      o.type === type &&
      o.value === value
    );

    if (recIndex === -1) {
      return res.status(401).json({ success: false, message: "OTP not found. Please send OTP again" });
    }

    const rec = otps[recIndex];

    if (Date.now() > rec.expiresAt) {
      otps = otps.filter((o) => !(o.purpose === "signup" && o.type === type && o.value === value));
      writeJson("otp.json", otps);
      return res.status(401).json({ success: false, message: "OTP expired" });
    }

    rec.attempts = Number(rec.attempts || 0);

    if (rec.attempts >= 5) {
      otps = otps.filter((o) => !(o.purpose === "signup" && o.type === type && o.value === value));
      writeJson("otp.json", otps);
      return res.status(429).json({ success: false, message: "Too many wrong attempts. Please send OTP again" });
    }

    if (rec.otp !== otp) {
      rec.attempts += 1;
      otps[recIndex] = rec;
      writeJson("otp.json", otps);

      const left = Math.max(0, 5 - rec.attempts);
      if (left === 0) {
        return res.status(429).json({ success: false, message: "Too many wrong attempts. Please send OTP again" });
      }

      return res.status(401).json({
        success: false,
        message: `Wrong OTP. ${left} attempt${left === 1 ? "" : "s"} left`
      });
    }

    return res.json({ success: true, message: `${type === "email" ? "Email" : "Mobile"} verified` });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false });
  }
});

app.post("/user/signup", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const mobile = normalizeMobile(req.body.mobile);
    const password = String(req.body.password || "");
    const mobileVerified = !!req.body.mobileVerified;
    const emailVerified = !!req.body.emailVerified;

    if (!name) return res.status(400).json({ success: false, message: "Name required" });
    if (!isValidEmail(email))
      return res.status(400).json({ success: false, message: "Enter valid email address" });
    if (!isValidMobile10(mobile))
      return res.status(400).json({ success: false, message: "Enter valid 10 digit mobile number" });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    if (!mobileVerified)
      return res.status(400).json({ success: false, message: "Mobile verification required" });
    if (!emailVerified)
      return res.status(400).json({ success: false, message: "Email verification required" });

    const users = readJson("users.json");

    if (users.find((u) => u.mobile === mobile)) {
      return res.status(409).json({ success: false, message: "Mobile already registered" });
    }
    if (users.find((u) => normalizeEmail(u.email) === email)) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    if (!DEMO_MODE) {
      const otps = readJson("otp.json");

      const mobileRec = otps.find((o) =>
        o.purpose === "signup" &&
        o.type === "mobile" &&
        o.value === mobile
      );
      const emailRec = otps.find((o) =>
        o.purpose === "signup" &&
        o.type === "email" &&
        o.value === email
      );

      if (!mobileRec) {
        return res.status(400).json({ success: false, message: "Mobile verification required" });
      }
      if (!emailRec) {
        return res.status(400).json({ success: false, message: "Email verification required" });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = Date.now();

    const newUser = {
      userid: generateUserId(),
      name,
      email,
      mobile,
      passwordHash,
      isBlocked: false,
      profileCompleted: false,
      profile: null,
      createdAt: now,
      updatedAt: now,
    };

    users.push(newUser);
    writeJson("users.json", users);

    let otps = readJson("otp.json");
    otps = otps.filter((o) => !(
      o.purpose === "signup" &&
      (
        (o.type === "mobile" && o.value === mobile) ||
        (o.type === "email" && o.value === email)
      )
    ));
    writeJson("otp.json", otps);

await regenerateSession(req);
req.session.userAuth = true;
req.session.userId = newUser.userid;

    return res.json({
      success: true,
      next: "/profile-setup.html"
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false });
  }
});

/* ================= USER LOGIN ================= */
app.post("/user/login", authLimiter, async (req, res) => {
  try {
    const loginId = String(req.body.loginId || "").trim();
    const password = String(req.body.password || "");

    if (!loginId) {
      return res.status(400).json({ success: false, message: "Email or mobile required" });
    }

    const parsed = detectIdentifierType(loginId);
    if (!parsed.type) {
      return res.status(400).json({ success: false, message: "Enter valid email or 10 digit mobile number" });
    }

    const users = readJson("users.json");
    const user = parsed.type === "mobile"
      ? users.find((u) => u.mobile === parsed.value)
      : users.find((u) => normalizeEmail(u.email) === parsed.value);

    if (!user) return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: "Your account is blocked. Contact admin." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, message: "Invalid credentials" });

await regenerateSession(req);
req.session.userAuth = true;
req.session.userId = user.userid;

    const next = user.profileCompleted ? "/app.html" : "/profile-setup.html";
    return res.json({ success: true, next });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false });
  }
});

/* ================= FORGOT PASSWORD ================= */
app.post("/user/request-otp", otpLimiter, (req, res) => {
  try {
    const parsed = detectIdentifierType(req.body.identifier);

    if (!parsed.type) {
      return res.status(400).json({ success: false, message: "Enter valid email or 10 digit mobile number" });
    }

    if (DEMO_MODE) {
      return res.json({ success: true, message: "Demo: any OTP works" });
    }

    const otp = generateOtpCode();
    const now = Date.now();
    const expiresAt = now + 5 * 60 * 1000;

    let otps = readJson("otp.json");
    otps = otps.filter((o) => !(o.purpose === "reset" && o.type === parsed.type && o.value === parsed.value));
otps.push({
  purpose: "reset",
  type: parsed.type,
  value: parsed.value,
  otp,
  attempts: 0,
  createdAt: now,
  expiresAt
});
    writeJson("otp.json", otps);

    if (!IS_PROD) {
  console.log(`[OTP][RESET] ${parsed.type}: ${parsed.value} OTP generated`);
}
    return res.json({ success: true, message: "OTP sent" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false });
  }
});

app.post("/user/reset-password", otpLimiter, async (req, res) => {
  try {
    const parsed = detectIdentifierType(req.body.identifier);
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!parsed.type) {
      return res.status(400).json({ success: false, message: "Enter valid email or 10 digit mobile number" });
    }
    if (!otp) return res.status(400).json({ success: false, message: "OTP required" });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });

    let users = readJson("users.json");
    const now = Date.now();
    const passwordHash = await bcrypt.hash(newPassword, 10);

    let idx = -1;
    if (parsed.type === "mobile") {
      idx = users.findIndex((u) => u.mobile === parsed.value);
    } else {
      idx = users.findIndex((u) => normalizeEmail(u.email) === parsed.value);
    }

    if (DEMO_MODE) {
      if (idx === -1) {
        users.push({
          userid: generateUserId(),
          name: "Demo User",
          email: parsed.type === "email" ? parsed.value : "",
          mobile: parsed.type === "mobile" ? parsed.value : "",
          passwordHash,
          isBlocked: false,
          profileCompleted: false,
          profile: null,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        users[idx].passwordHash = passwordHash;
        users[idx].updatedAt = now;
      }
      writeJson("users.json", users);
      return res.json({ success: true, message: "Password reset successfully" });
    }

let otps = readJson("otp.json");
const recIndex = otps.findIndex((o) =>
  o.purpose === "reset" &&
  o.type === parsed.type &&
  o.value === parsed.value
);

if (recIndex === -1) {
  return res.status(401).json({ success: false, message: "OTP not found. Please request again" });
}

const rec = otps[recIndex];
rec.attempts = Number(rec.attempts || 0);

if (Date.now() > rec.expiresAt) {
  otps = otps.filter((o) => !(o.purpose === "reset" && o.type === parsed.type && o.value === parsed.value));
  writeJson("otp.json", otps);
  return res.status(401).json({ success: false, message: "OTP expired" });
}

if (rec.attempts >= 5) {
  otps = otps.filter((o) => !(o.purpose === "reset" && o.type === parsed.type && o.value === parsed.value));
  writeJson("otp.json", otps);
  return res.status(429).json({ success: false, message: "Too many wrong attempts. Request OTP again" });
}

if (rec.otp !== otp) {
  rec.attempts += 1;
  otps[recIndex] = rec;
  writeJson("otp.json", otps);
  return res.status(401).json({ success: false, message: "Wrong OTP" });
}

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: `${parsed.type === "email" ? "Email" : "Mobile"} not registered`
      });
    }

    users[idx].passwordHash = passwordHash;
    users[idx].updatedAt = now;
    writeJson("users.json", users);

    writeJson("otp.json", otps.filter((o) => !(
      o.purpose === "reset" &&
      o.type === parsed.type &&
      o.value === parsed.value
    )));

    return res.json({ success: true, message: "Password reset successfully" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false });
  }
});

/* ================= USER FIRST TIME PROFILE SETUP ================= */
app.get("/profile-setup.html", isUserAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "public/profile-setup.html"))
);

/* Twitter verify demo */
app.post("/api/verifyTwitter", isUserAuth, (req, res) => {
  const usernameRaw = String(req.body.username || "").trim();
  const username = usernameRaw.startsWith("@") ? usernameRaw : "@" + usernameRaw;

  if (!/^@[A-Za-z0-9_]{1,15}$/.test(username)) {
    return res.status(400).json({
      success: false,
      verified: false,
      message: "Invalid Twitter username format",
    });
  }

  if (DEMO_MODE) {
    return res.json({ success: true, verified: true, username });
  }

  return res.status(501).json({
    success: false,
    verified: false,
    message: "Twitter verification not configured on server",
  });
});

/**
 * Save profile
 * Recommended payload:
 *  countryId,stateId,cityId,loksabhaId,vidhansabhaId,wardId(optional),designationId,shaktikendraNo,boothNo,twitter,twitterVerified
 */
app.post("/user/saveProfile", isUserAuth, (req, res) => {
  try {
    const masters = mastersSafe(readJson("masters.json"));

    const countryId = String(req.body.countryId || "").trim();
    const stateId = String(req.body.stateId || "").trim();
    const cityId = String(req.body.cityId || "").trim();
    const loksabhaId = String(req.body.loksabhaId || "").trim();
    const vidhansabhaId = String(req.body.vidhansabhaId || "").trim();
    const wardId = String(req.body.wardId || "").trim(); // OPTIONAL
    const designationId = String(req.body.designationId || "").trim();

const boothNo = String(req.body.boothNo || "").trim();
const primaryMemberNo = String(req.body.primaryMemberNo || "").trim();
const sakriyaSabhyaNo = String(req.body.sakriyaSabhyaNo || "").trim();

let twitter = String(req.body.twitter || "").trim();
let instagram = String(req.body.instagram || "").trim();
let facebook = String(req.body.facebook || "").trim();

const twitterVerified = !!req.body.twitterVerified;
const instagramVerified = !!req.body.instagramVerified;
const facebookVerified = !!req.body.facebookVerified;

    // Required selection IDs (wardId is optional)
    if (!countryId || !stateId || !cityId || !loksabhaId || !vidhansabhaId || !designationId) {
      return res.status(400).json({ success: false, message: "Missing required selection" });
    }

    const country = masters.countries.find((x) => x.id === countryId);
    const state = masters.states.find((x) => x.id === stateId && x.countryId === countryId);
    const city = masters.cities.find((x) => x.id === cityId && x.stateId === stateId);
    const lok = masters.loksabhas.find((x) => x.id === loksabhaId && x.stateId === stateId);
    const vid = masters.vidhansabhas.find((x) => x.id === vidhansabhaId && x.lokId === loksabhaId);
    const des = masters.designations.find((x) => x.id === designationId);

    if (!country || !state || !city || !lok || !vid || !des) {
      return res.status(400).json({ success: false, message: "Invalid selection path" });
    }

  
 // ward optional (based on city + vidhansabha)
let ward = null;
if (wardId) {
  ward = masters.wards.find(
    (x) =>
      x.id === wardId &&
      String(x.cityId) === String(cityId) &&
      String(x.vidhansabhaId) === String(vidhansabhaId)
  );
  if (!ward) return res.status(400).json({ success: false, message: "Invalid ward" });
}

if (twitter) {
  if (!twitter.startsWith("@")) twitter = "@" + twitter;
  if (!/^@[A-Za-z0-9_]{1,15}$/.test(twitter)) {
    return res.status(400).json({ success: false, message: "Invalid Twitter username format" });
  }
  if (!twitterVerified) {
    return res.status(400).json({ success: false, message: "Twitter not verified" });
  }
}

if (instagram) {
  if (!instagram.startsWith("@")) instagram = "@" + instagram;
  if (!/^@[A-Za-z0-9._]{1,30}$/.test(instagram)) {
    return res.status(400).json({ success: false, message: "Invalid Instagram username format" });
  }
  if (!instagramVerified) {
    return res.status(400).json({ success: false, message: "Instagram not verified" });
  }
}

if (facebook) {
  facebook = String(facebook || "").trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9.]{3,50}$/.test(facebook)) {
    return res.status(400).json({ success: false, message: "Invalid Facebook username format" });
  }
  if (!facebookVerified) {
    return res.status(400).json({ success: false, message: "Facebook not verified" });
  }
}
   // Booth No is optional now

const profile = {
  countryId,
  stateId,
  cityId,
  loksabhaId,
  vidhansabhaId,
  wardId: wardId || "",
  designationId,

  country: country.name,
  states: state.name,
  city: city.name,
  loksabha: lok.name,
  vidhansabha: vid.name,
  ward: ward ? ward.name : "",
  designation: des.name,

  booth: boothNo,
  primaryMemberNo,
  sakriyaSabhyaNo,

  twitter,
  twitterVerified: !!twitterVerified,

  instagram,
  instagramVerified: !!instagramVerified,

  facebook,
  facebookVerified: !!facebookVerified,

  savedAt: Date.now(),
};

    const users = readJson("users.json");
    const idx = users.findIndex((u) => u.userid === req.session.userId);
    if (idx === -1) return res.status(401).json({ success: false, message: "User session invalid" });

    users[idx].profile = profile;
    users[idx].profileCompleted = true;
    users[idx].updatedAt = Date.now();
    writeJson("users.json", users);

    return res.json({ success: true, next: "/app.html" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false });
  }
});

/* ================= USER APP PAGE ================= */
app.get("/app.html", isUserAuth, (req, res) => {
  const users = readJson("users.json");
  const u = users.find((x) => x.userid === req.session.userId);
  if (u && !u.profileCompleted) return res.redirect("/profile-setup.html");

  return res.sendFile(path.join(__dirname, "public/app.html"));
});

/* ================= ANALYTICS TRACKING (USER) ================= */
app.post("/api/trackTweet", isUserAuth, (req, res) => {
  try {
    const tweetId = Number(req.body.tweetId);
    const textLen = Number(req.body.textLen || 0);

    if (!tweetId) return res.status(400).json({ success: false, message: "tweetId required" });

    const users = readJson("users.json");
    const user = users.find((u) => u.userid === req.session.userId);

    const userId = req.session.userId || "UNKNOWN";
    const mobile = user?.mobile || "";
    const name = user?.name || "";

    const analytics = readJson("analytics.json");
    analytics.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      tweetId,
      userId,
      name,
      mobile,
      textLen,
      at: Date.now(),
    });

    writeJson("analytics.json", analytics);

    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false });
  }
});

/* ================= ANALYTICS DATA (ADMIN) ================= */
app.get("/admin/getAnalytics", isAdminAuth, (req, res) => {
  try {
    const analytics = readJson("analytics.json");
    const tweets = readJson("tweets.json");
    const users = readJson("users.json");

    const tweetMap = new Map(tweets.map((t) => [Number(t.id), t]));
    const userMap = new Map(users.map((u) => [u.userid, u]));

    const total = analytics.length;

    const byTweetCount = {};
    for (const a of analytics) {
      const tid = Number(a.tweetId);
      byTweetCount[tid] = (byTweetCount[tid] || 0) + 1;
    }

    const byTweet = Object.keys(byTweetCount)
      .map((k) => {
        const tid = Number(k);
        const t = tweetMap.get(tid);
        const content = t?.content || "(deleted tweet)";
        return { tweetId: tid, count: byTweetCount[tid], preview: String(content).slice(0, 80) };
      })
      .sort((a, b) => b.count - a.count);

    const byUserCount = {};
    for (const a of analytics) {
      const uid = String(a.userId || "");
      byUserCount[uid] = (byUserCount[uid] || 0) + 1;
    }

    const byUser = Object.keys(byUserCount)
      .map((uid) => {
        const u = userMap.get(uid);
        return {
          userId: uid,
          count: byUserCount[uid],
          name: u?.name || "",
          mobile: u?.mobile || "",
          isBlocked: !!u?.isBlocked,
          profile: u?.profile || null,
        };
      })
      .sort((a, b) => b.count - a.count);

    const recent = [...analytics]
      .sort((a, b) => Number(b.at) - Number(a.at))
      .slice(0, 300)
      .map((a) => {
        const t = tweetMap.get(Number(a.tweetId));
        const u = userMap.get(String(a.userId));
        return {
          at: a.at,
          tweetId: a.tweetId,
          tweetPreview: String(t?.content || "(deleted tweet)").slice(0, 120),
          userId: a.userId,
          name: u?.name || a.name || "",
          mobile: u?.mobile || a.mobile || "",
          textLen: a.textLen || 0,
        };
      });

    return res.json({ success: true, summary: { total, byTweet, byUser }, recent });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false });
  }
});

/* ================= TWEETS ================= */
/* =========================
   Trend Settings Helpers
========================= */

function getDefaultTrendSettings() {
  return {
    enabled: true,
    title: "Trending Now",
    message: "Currently no trends available. We will inform you when trend is available."
  };
}

function readTrendSettings() {
  const raw = readJson("trendSettings.json");
  const base = getDefaultTrendSettings();

  if (!raw || typeof raw !== "object") {
    return base;
  }

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
    title: String(raw.title || base.title).trim(),
    message: String(raw.message || base.message).trim()
  };
}

function writeTrendSettings(data) {
  const base = getDefaultTrendSettings();

  writeJson("trendSettings.json", {
    enabled: typeof data.enabled === "boolean" ? data.enabled : base.enabled,
    title: String(data.title || base.title).trim(),
    message: String(data.message || base.message).trim()
  });
}
/* =========================
   Trend Settings APIs
========================= */

app.get("/trendSettings", (req, res) => {
  try {
    const settings = readTrendSettings();
    res.json({ success: true, settings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

app.get("/admin/getTrendSettings", isAdminAuth, (req, res) => {
  try {
    const settings = readTrendSettings();
    res.json({ success: true, settings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

app.post("/admin/saveTrendSettings", requireSameOrigin, isAdminAuth, (req, res) => {
  try {
    writeTrendSettings({
      enabled: !!req.body.enabled,
      title: req.body.title,
      message: req.body.message
    });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});
app.post("/admin/addTweet", isAdminAuth, (req, res, next) => {
  upload.single("media")(req, res, function (err) {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Upload failed" });
    }

    const content = String(req.body.content || "").trim();
    if (!content) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(400).json({ success: false, message: "Content required" });
    }

    const tweets = readJson("tweets.json");
    const mediaPath = req.file ? "/" + req.file.path.replace(/\\/g, "/") : null;

    tweets.push({
      id: Date.now(),
      content,
      media: mediaPath
    });

    writeJson("tweets.json", tweets);
    return res.json({ success: true });
  });
});
function parsePostsText(rawText) {
  return String(rawText || "")
    .split(/\r?\n|,,,/)
    .map(t => t.trim())
    .filter(Boolean);
}

function sortFilesNaturally(files) {
  return [...files].sort((a, b) =>
    a.originalname.localeCompare(b.originalname, undefined, {
      numeric: true,
      sensitivity: "base"
    })
  );
}
app.post("/admin/batchUpload", isAdminAuth, batchUpload.single("batchFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "File required" });

  try {
    const buffer = fs.readFileSync(req.file.path);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    const tweetsArray = text
      .split(",,,")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const tweets = readJson("tweets.json");
    tweetsArray.forEach((tContent) => {
      tweets.push({ id: Date.now() + Math.floor(Math.random() * 1000), content: tContent, media: null });
    });

    writeJson("tweets.json", tweets);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  } finally {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
  }
});
app.post("/admin/removeTweetMedia/:id", isAdminAuth, (req, res) => {
  try {
    const id = String(req.params.id || "");
    const tweets = readJson("tweets.json");
    const idx = tweets.findIndex((t) => String(t.id) === id);

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: "Tweet not found"
      });
    }

    const oldMedia = tweets[idx].media;

    if (!oldMedia) {
      return res.json({
        success: true,
        message: "No media to remove"
      });
    }

    const oldPath = String(oldMedia).replace(/^\//, "");
    if (fs.existsSync(oldPath)) {
      try { fs.unlinkSync(oldPath); } catch {}
    }

    tweets[idx].media = null;
    writeJson("tweets.json", tweets);

    return res.json({
      success: true,
      message: "Media removed successfully"
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to remove media"
    });
  }
});
app.get("/getTweets", (req, res) => {
  res.json(readJson("tweets.json"));
});
app.post("/admin/batchUploadWithMedia", isAdminAuth, (req, res) => {
  bulkMediaUpload.fields([
    { name: "batchFile", maxCount: 1 },
    { name: "mediaFiles", maxCount: 200 }
  ])(req, res, async function (err) {

    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Upload failed" });
    }

    const textFile = req.files?.batchFile?.[0];
    const mediaFiles = sortFilesNaturally(req.files?.mediaFiles || []);

    if (!textFile) {
      return res.status(400).json({ success: false, message: "Bulk text file required" });
    }

    try {

      let postsText = "";
      const ext = path.extname(textFile.originalname || "").toLowerCase();

      if (ext === ".txt") {
        postsText = fs.readFileSync(textFile.path, "utf8");
      }
      else if (ext === ".docx" || ext === ".doc") {
        const buffer = fs.readFileSync(textFile.path);
        const result = await mammoth.extractRawText({ buffer });
        postsText = result.value;
      }
      else {
        return res.status(400).json({
          success: false,
          message: "Only TXT, DOC, DOCX allowed"
        });
      }

      const postsArray = parsePostsText(postsText);

      if (!postsArray.length) {
        return res.status(400).json({
          success: false,
          message: "No posts found"
        });
      }

      const tweets = readJson("tweets.json");

      postsArray.forEach((content, index) => {

        const mediaFile = mediaFiles[index] || null;
        const mediaPath = mediaFile
          ? "/" + mediaFile.path.replace(/\\/g, "/")
          : null;

        tweets.push({
          id: Date.now() + Math.floor(Math.random() * 100000) + index,
          content,
          media: mediaPath
        });

      });

      writeJson("tweets.json", tweets);

      return res.json({
        success: true,
        total: postsArray.length,
        attachedMedia: Math.min(postsArray.length, mediaFiles.length)
      });

    }
    catch (e) {
      console.error(e);
      return res.status(500).json({
        success: false,
        message: "Bulk upload failed"
      });
    }

    finally {
      try {
        if (textFile?.path && fs.existsSync(textFile.path)) {
          fs.unlinkSync(textFile.path);
        }
      } catch {}
    }

  });
});
app.post("/admin/updateTweet/:id", isAdminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const content = String(req.body.content || "").trim();

  if (!id) return res.status(400).json({ success: false });
  if (!content) return res.status(400).json({ success: false, message: "Content required" });

  const tweets = readJson("tweets.json");
  const idx = tweets.findIndex((t) => Number(t.id) === id);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Tweet not found" });
  }

  tweets[idx].content = content;
  writeJson("tweets.json", tweets);
  return res.json({ success: true });
});

app.post("/admin/uploadTweetMedia/:id", isAdminAuth, (req, res) => {
  upload.single("media")(req, res, function (err) {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Upload failed" });
    }

    const id = parseInt(req.params.id, 10);
    if (!id) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(400).json({ success: false, message: "Invalid tweet id" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Media file required" });
    }

    const tweets = readJson("tweets.json");
    const idx = tweets.findIndex((t) => Number(t.id) === id);

    if (idx === -1) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ success: false, message: "Tweet not found" });
    }

    if (tweets[idx].media) {
      const oldPath = String(tweets[idx].media).replace(/^\//, "");
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch {}
      }
    }

    tweets[idx].media = "/" + req.file.path.replace(/\\/g, "/");
    writeJson("tweets.json", tweets);

    return res.json({ success: true, media: tweets[idx].media });
  });
});

app.delete("/admin/deleteTweet/:id", isAdminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tweets = readJson("tweets.json");
  const idx = tweets.findIndex((t) => Number(t.id) === id);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Tweet not found" });
  }

  const removed = tweets[idx];

  if (removed.media) {
    const oldPath = String(removed.media).replace(/^\//, "");
    if (fs.existsSync(oldPath)) {
      try { fs.unlinkSync(oldPath); } catch {}
    }
  }

  tweets.splice(idx, 1);
  writeJson("tweets.json", tweets);

  return res.json({ success: true });
});

app.delete("/admin/deleteAllTweets", isAdminAuth, (req, res) => {
  const tweets = readJson("tweets.json");

  tweets.forEach((t) => {
    if (t.media) {
      const oldPath = String(t.media).replace(/^\//, "");
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch {}
      }
    }
  });

  writeJson("tweets.json", []);
  return res.json({ success: true });
});
app.post("/admin/uploadTweetMedia/:id", isAdminAuth, (req, res) => {
  upload.single("media")(req, res, function (err) {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Upload failed"
      });
    }

    const id = String(req.params.id || "");
    const tweets = readJson("tweets.json");
    const tweetIndex = tweets.findIndex(t => String(t.id) === id);

    if (tweetIndex === -1) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(404).json({
        success: false,
        message: "Tweet not found"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Media file required"
      });
    }

    const newMediaPath = "/" + req.file.path.replace(/\\/g, "/");

    const oldMedia = tweets[tweetIndex].media;
    if (oldMedia) {
      const oldFilePath = oldMedia.replace(/^\/+/, "");
      if (fs.existsSync(oldFilePath)) {
        try { fs.unlinkSync(oldFilePath); } catch {}
      }
    }

    tweets[tweetIndex].media = newMediaPath;
    writeJson("tweets.json", tweets);

    return res.json({
      success: true,
      media: newMediaPath
    });
  });
});
/* ================= MENTIONS ================= */
app.get("/getMentions", (req, res) => {
  res.json(readJson("mentions.json"));
});

app.post("/admin/addMention", isAdminAuth, (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ success: false });

  const mentions = readJson("mentions.json");
  mentions.push(name);
  writeJson("mentions.json", mentions);
  res.json({ success: true });
});

app.delete("/admin/deleteMention/:index", isAdminAuth, (req, res) => {
  const index = parseInt(req.params.index, 10);
  const mentions = readJson("mentions.json");
  if (index < 0 || index >= mentions.length) return res.status(400).json({ success: false });

  mentions.splice(index, 1);
  writeJson("mentions.json", mentions);
  res.json({ success: true });
});

/* ================= ADMIN USERS MANAGEMENT (SUPER ONLY) ================= */
function safeUserView(u) {
  return {
    userid: u.userid,
    name: u.name,
    email: u.email || "",
    mobile: u.mobile || "",
    isBlocked: !!u.isBlocked,
    profileCompleted: !!u.profileCompleted,
    profile: u.profile || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

app.get("/admin/getUsers", isAdminAuth, (req, res) => {
  if (req.session.adminRole !== "super")
    return res.status(403).json({ success: false, message: "Super admin only" });

  const users = readJson("users.json")
    .filter((u) => !!u.profileCompleted)
    .map(safeUserView);

  res.json({ success: true, users });
});

app.post("/admin/updateUser/:userid", isAdminAuth, (req, res) => {
  if (req.session.adminRole !== "super") return res.status(403).json({ success: false });

  const userid = String(req.params.userid || "");
  const name = String(req.body.name || "").trim();
  const email = normalizeEmail(req.body.email);
  const mobile = normalizeMobile(req.body.mobile);

  if (!userid) return res.status(400).json({ success: false });
  if (!name) return res.status(400).json({ success: false, message: "Name required" });
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: "Valid email required" });
  }
  if (!isValidMobile10(mobile)) {
    return res.status(400).json({ success: false, message: "Valid mobile required" });
  }

  const users = readJson("users.json");
  const idx = users.findIndex((u) => u.userid === userid);
  if (idx === -1) return res.status(404).json({ success: false });

  const emailExists = users.some((u, i) => i !== idx && normalizeEmail(u.email) === email);
  if (emailExists) {
    return res.status(409).json({ success: false, message: "Email already registered" });
  }

  const mobileExists = users.some((u, i) => i !== idx && u.mobile === mobile);
  if (mobileExists) {
    return res.status(409).json({ success: false, message: "Mobile already registered" });
  }

  users[idx].name = name;
  users[idx].email = email;
  users[idx].mobile = mobile;
  users[idx].updatedAt = Date.now();

  writeJson("users.json", users);
  res.json({ success: true });
});

app.delete("/admin/deleteUser/:userid", requireSameOrigin, isAdminAuth, (req, res) => {
  if (req.session.adminRole !== "super") return res.status(403).json({ success: false });

  const userid = String(req.params.userid || "");
  if (!userid) return res.status(400).json({ success: false });

  let users = readJson("users.json");
  const before = users.length;
  users = users.filter((u) => u.userid !== userid);

  if (users.length === before) return res.status(404).json({ success: false });

  writeJson("users.json", users);
  res.json({ success: true });
});

app.post("/admin/toggleBlock/:userid", requireSameOrigin, isAdminAuth, (req, res) => {
  if (req.session.adminRole !== "super") return res.status(403).json({ success: false });

  const userid = String(req.params.userid || "");
  if (!userid) return res.status(400).json({ success: false });

  const users = readJson("users.json");
  const idx = users.findIndex((u) => u.userid === userid);
  if (idx === -1) return res.status(404).json({ success: false });

  users[idx].isBlocked = !users[idx].isBlocked;
  users[idx].updatedAt = Date.now();
  writeJson("users.json", users);

  res.json({ success: true, isBlocked: users[idx].isBlocked });
});

function escapeCsvValue(v) {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

app.get("/admin/exportUsersCsv", isAdminAuth, (req, res) => {
  if (req.session.adminRole !== "super") return res.status(403).json({ success: false });

  const users = readJson("users.json")
  .filter((u) => !!u.profileCompleted)
  .map(safeUserView);

  const header = [
    "userid",
    "name",
    "email",
    "mobile",
    "isBlocked",
    "profileCompleted",
    "country",
    "states",
    "city",
    "loksabha",
    "vidhansabha",
    "ward",
    "booth",
    "primaryMemberNo",
    "sakriyaSabhyaNo",
    "designation",
    "twitter",
    "twitterVerified",
    "instagram",
    "instagramVerified",
    "facebook",
    "facebookVerified",
    "createdAt",
    "updatedAt",
  ];

  const rows = users.map((u) => [
    u.userid,
    u.name,
    u.email || "",
    u.mobile || "",
    u.isBlocked ? "blocked" : "active",
    u.profileCompleted ? "yes" : "no",
    u.profile?.country || "",
    u.profile?.states || "",
    u.profile?.city || "",
    u.profile?.loksabha || u.profile?.loksabhaName || "",
    u.profile?.vidhansabha || "",
    u.profile?.ward || "",
    u.profile?.booth || "",
    u.profile?.primaryMemberNo || "",
    u.profile?.sakriyaSabhyaNo || "",
    u.profile?.designation || "",
    u.profile?.twitter || "",
    u.profile?.twitterVerified ? "yes" : "no",
    u.profile?.instagram || "",
    u.profile?.instagramVerified ? "yes" : "no",
    u.profile?.facebook || "",
    u.profile?.facebookVerified ? "yes" : "no",
    u.createdAt ? new Date(u.createdAt).toISOString() : "",
    u.updatedAt ? new Date(u.updatedAt).toISOString() : "",
  ]);

  const csv = header.join(",") + "\n" + rows.map((r) => r.map(escapeCsvValue).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="users.csv"');
  res.send(csv);
});

/* ================= SOCIAL VERIFY ================= */
async function checkPublicProfileExists(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    return res.ok;
  } catch (err) {
    return false;
  }
}

function cleanSocialUsername(platform, value) {
  let s = String(value || "").trim();
  if (!s) return "";

  s = s.replace(/^https?:\/\/(www\.)?/i, "");
  s = s.replace(/^(mobile\.)/i, "");

  if (platform === "twitter") {
    s = s.replace(/^x\.com\//i, "");
    s = s.replace(/^twitter\.com\//i, "");
  }

  if (platform === "instagram") {
    s = s.replace(/^instagram\.com\//i, "");
  }

  if (platform === "facebook") {
    s = s.replace(/^facebook\.com\//i, "");
    s = s.replace(/^fb\.com\//i, "");
  }

  s = s.split("?")[0];
  s = s.split("#")[0];
  s = s.replace(/^@+/, "");
  s = s.replace(/^\/+|\/+$/g, "");
  s = s.trim();

  return s;
}

app.post("/user/verify-social", isUserAuth, async (req, res) => {
  try {
    const platform = String(req.body.platform || "").trim().toLowerCase();
    let username = String(req.body.username || "").trim();

    if (!["twitter", "instagram", "facebook"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Invalid platform"
      });
    }

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Username required"
      });
    }

    username = username
      .replace(/^https?:\/\/(www\.)?/i, "")
      .replace(/^(mobile\.)/i, "")
      .replace(/^x\.com\//i, "")
      .replace(/^twitter\.com\//i, "")
      .replace(/^instagram\.com\//i, "")
      .replace(/^facebook\.com\//i, "")
      .replace(/^fb\.com\//i, "")
      .split("?")[0]
      .split("#")[0]
      .replace(/^@+/, "")
      .replace(/^\/+|\/+$/g, "")
      .trim();

    let valid = false;

    if (platform === "twitter") {
      valid = /^[A-Za-z0-9_]{1,15}$/.test(username);
    } else if (platform === "instagram") {
      valid = /^[A-Za-z0-9._]{1,30}$/.test(username);
    } else if (platform === "facebook") {
      valid = /^[A-Za-z0-9.]{3,50}$/.test(username);
    }

    if (!valid) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid username or profile link"
      });
    }

    return res.json({
      success: true,
      username: platform === "facebook" ? username : "@" + username
    });

  } catch (e) {
    console.error("verify-social error:", e);
    return res.status(500).json({
      success: false,
      message: "Verification failed. Please try again."
    });
  }
});

/* ================= PUBLIC STATIC ASSETS ================= */
app.post("/user/verify-social", async (req, res) => {
  try {
    const { platform, username } = req.body;

    if (!platform || !username) {
      return res.status(400).json({
        success: false,
        message: "Platform and username required"
      });
    }

    const clean = username.replace(/^@/, "").trim();

    let url = "";

    if (platform === "twitter") {
      url = `https://x.com/${clean}`;
    }

    if (platform === "instagram") {
      url = `https://www.instagram.com/${clean}/`;
    }

    if (platform === "facebook") {
      url = `https://www.facebook.com/${clean}`;
    }

    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (r.status === 200) {
      return res.json({ success: true });
    }

    return res.json({
      success: false,
      message: "User not available, check username"
    });

  } catch (err) {
    console.error("verify-social error", err);
    res.status(500).json({
      success: false,
      message: "Verification failed"
    });
  }
});
app.use(express.static(path.join(__dirname, "public")));
/* ================= DEFAULT ROUTES ================= */
app.get("/", (req, res) => res.redirect("/login.html"));

/* ================= START SERVER ================= */
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});