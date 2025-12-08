// Updated hero.js - Now uses local PostgreSQL database instead of external API
const express = require("express");
const router = express.Router();
require("dotenv").config();
const { Pool } = require("pg");

const connectionString = process.env.PG_CONNECTION_STRING;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

// Test DB connection on startup
pool.on("connect", () => {
  console.log("✅ Connected to Neon Postgres (hero)");
});
pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle hero client", err);
});

// GET /api/hero - Fetch all heroes
router.get("/api/hero", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        id, 
        heroheader, 
        herotitle1, 
        herotitle2, 
        herotitle3, 
        targeturl, 
        created_at, 
        updated_at, 
        array_length(heroimg, 1) as heroimg_count
      FROM hero 
      ORDER BY created_at DESC
    `);
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("GET heroes error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch heroes",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// GET /api/hero/:id - Fetch single hero by ID
router.get("/api/hero/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const result = await client.query(
      `
      SELECT 
        id, 
        heroheader, 
        herotitle1, 
        herotitle2, 
        herotitle3, 
        targeturl, 
        created_at, 
        updated_at, 
        array_length(heroimg, 1) as heroimg_count
      FROM hero 
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Hero not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("GET hero error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch hero",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// POST /admin/hero - Create new hero
router.post("/admin/hero", express.json(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { heroHeader, heroTitle1, heroTitle2, heroTitle3, targetUrl } =
      req.body;

    // Validate required fields (heroImg optional)
    const requiredFields = [
      "heroHeader",
      "heroTitle1",
      "heroTitle2",
      "heroTitle3",
      "targetUrl",
    ];
    const missingFields = requiredFields.filter((field) => !req.body[field]);
    console.log(missingFields);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const insertQuery = `
      INSERT INTO hero (heroheader, herotitle1, herotitle2, herotitle3, targeturl)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, heroheader, herotitle1, herotitle2, herotitle3, targeturl, created_at, array_length(heroimg, 1) as heroimg_count
    `;

    const values = [heroHeader, heroTitle1, heroTitle2, heroTitle3, targetUrl];

    const result = await client.query(insertQuery, values);
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Hero created successfully",
    });
  } catch (error) {
    console.error("POST hero error:", error.message);
    res.status(400).json({
      success: false,
      message: "Failed to create hero",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// PUT /admin/hero/:id - Update existing hero
router.put("/admin/hero/:id", express.json(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { heroHeader, heroTitle1, heroTitle2, heroTitle3, targetUrl } =
      req.body;

    // Validate required fields
    const requiredFields = [
      "heroHeader",
      "heroTitle1",
      "heroTitle2",
      "heroTitle3",
      "targetUrl",
    ];
    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const updateQuery = `
      UPDATE hero
      SET 
        heroheader = $1,
        herotitle1 = $2,
        herotitle2 = $3,
        herotitle3 = $4,
        targeturl = $5
      WHERE id = $6
      RETURNING id, heroheader, herotitle1, herotitle2, herotitle3, targeturl, updated_at as heroimg_count
    `;

    const result = await client.query(updateQuery, [
      heroHeader,
      heroTitle1,
      heroTitle2,
      heroTitle3,
      targetUrl,
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Hero not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Hero updated successfully",
    });
  } catch (error) {
    console.error("PUT hero error:", error.message);
    res.status(400).json({
      success: false,
      message: "Failed to update hero",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// DELETE /admin/hero/:id - Delete hero
router.delete("/admin/hero/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const result = await client.query(
      "DELETE FROM hero WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Hero not found",
      });
    }

    res.json({
      success: true,
      message: "Hero deleted successfully",
    });
  } catch (error) {
    console.error("DELETE hero error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete hero",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

module.exports = router;
