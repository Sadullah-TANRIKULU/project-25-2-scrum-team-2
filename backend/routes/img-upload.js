const multer = require("multer");
const { Pool } = require("pg");
const express = require("express");

// Neon Postgres (add ssl for safety)
const connectionString = process.env.PG_CONNECTION_STRING;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

const router = express.Router();
// Multer config: memory, 8MB, image filter
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type, only images are allowed!"), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter,
});

const uploadFields = upload.fields([
  { name: "avatar", maxCount: 1 },
  { name: "gallery", maxCount: 8 },
]);

router.post("/admin/gallery", uploadFields, async (req, res, next) => {
  try {
    const { name } = req.body;
    const avatarBuffer = req.files?.avatar?.[0]?.buffer || null;
    const galleryBuffers = req.files?.gallery?.map((f) => f.buffer) || [];

    const query = `
      INSERT INTO gallery (name, avatar, gallery) VALUES ($1, $2, $3)
      RETURNING id, name, created_at
    `;
    const values = [name || "Unnamed", avatarBuffer, galleryBuffers];
    const result = await pool.query(query, values);
    res.json({ success: true, product: result.rows[0] });
  } catch (error) {
    console.error(error);
    if (error.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ error: "File >8MB" });
    res.status(400).json({ error: error.message });
  }
});

// POST /heroimg (unchanged, perfect with defaults)
router.post("/admin/heroimg/:id", upload.array("heroImg", 3), async (req, res) => {
  const client = await pool.connect();
  try {
    const heroId = req.params.id;
    if (!heroId) {
      return res.status(400).json({ error: "heroId is required" });
    }

    const heroimg = (req.files || []).map((f) => f.buffer);
    const query = `
      UPDATE hero
      SET heroimg = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, heroHeader, heroTitle1, heroTitle2, heroTitle3, targetUrl, array_length(heroimg, 1) as heroimg_count, updated_at
    `;
    const result = await client.query(query, [heroimg, heroId]);
    res.json({ success: true, hero: result.rows[0] });
  } catch (error) {
    console.error(error);
    if (error.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ error: "File >8MB" });
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// GET /api/heroimg/:id/:idx (fixed)
router.get("/api/heroimg/:id/:idx", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, idx } = req.params;
    const idxNum = parseInt(idx);
    if (isNaN(idxNum) || idxNum < 0) {
      return res.status(400).json({ error: "Invalid idx (0-based)" });
    }
    const result = await client.query(
      `SELECT img FROM (
        SELECT unnest(heroimg) AS img FROM hero WHERE id = $1
      ) t OFFSET $2 LIMIT 1`,
      [id, idxNum]
    );
    if (!result.rows[0]?.img) {
      return res.status(404).json({ error: "No image at index" });
    }
    // Dynamic MIME (from first file, or hardcoded)
    res.set("Content-Type", "image/jpeg").send(result.rows[0].img);
  } catch (error) {
    console.error("Heroimg serve error:", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Bonus: GET products (sizes only)
router.get("/api/gallery", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, octet_length(avatar) as avatar_size, array_length(gallery,1) as gallery_count FROM gallery ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// New: Serve avatar image
router.get("/api/gallery/:id/avatar", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT avatar FROM gallery WHERE id = $1",
      [req.params.id]
    );
    if (!rows[0]?.avatar) return res.status(404).json({ error: "No avatar" });
    res.type("image/jpeg").send(rows[0].avatar);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New: Serve gallery image by index
router.get("/api/gallery/:id/gallery/:idx", async (req, res) => {
  try {
    const idx = parseInt(req.params.idx);
    if (isNaN(idx) || idx < 0)
      return res.status(404).json({ error: "Invalid index" });
    const { rows } = await pool.query(
      `SELECT img FROM (SELECT unnest(gallery) AS img FROM gallery WHERE id = $1) t OFFSET $2 LIMIT 1`,
      [req.params.id, idx]
    );
    if (!rows[0]?.img)
      return res.status(404).json({ error: "No gallery image" });
    res.type("image/jpeg").send(rows[0].img);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
