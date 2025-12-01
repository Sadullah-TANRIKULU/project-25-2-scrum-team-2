// hero.js
const express = require("express");
const router = express.Router();
const axios = require("axios");

require("dotenv").config();

const API_HERO_URL = process.env.API_HERO_URL;
const getHeroEndpoint = (id = "") => `${API_HERO_URL}${id ? `/${id}` : ""}`;

// GET /admin/hero - Fetch all heroes
router.get("/admin/hero", express.json(), async (req, res) => {
  try {
    const response = await axios.get(getHeroEndpoint());
    res.json({
      success: true,
      data: response.data,
      count: response.data.length,
    });
  } catch (error) {
    console.error("GET heroes error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch heroes",
      error: error.response?.data?.message || error.message,
    });
  }
});

// GET /admin/hero/:id - Fetch single hero by ID
router.get("/admin/hero/:id", express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.get(getHeroEndpoint(id));
    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: "Hero not found",
      });
    }
    console.error("GET hero error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch hero",
      error: error.response?.data?.message || error.message,
    });
  }
});

// POST /admin/hero - Create new hero
router.post("/admin/hero", express.json(), async (req, res) => {
  try {
    const heroData = req.body;

    // Validate required fields
    const requiredFields = [
      "heroImg",
      "heroHeader",
      "heroTitle1",
      "heroTitle2",
      "heroTitle3",
      "targetUrl",
    ];
    const missingFields = requiredFields.filter((field) => !heroData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Ensure heroImg is array
    if (!Array.isArray(heroData.heroImg)) {
      heroData.heroImg = [heroData.heroImg];
    }

    const response = await axios.post(getHeroEndpoint(), heroData);
    res.status(201).json({
      success: true,
      data: response.data,
      message: "Hero created successfully",
    });
  } catch (error) {
    console.error("POST hero error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to create hero",
      error: error.response?.data?.message || error.message,
    });
  }
});

// PUT /admin/hero/:id - Update existing hero
router.put("/admin/hero/:id", express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const heroData = req.body;

    // Ensure heroImg is array
    if (!Array.isArray(heroData.heroImg)) {
      heroData.heroImg = [heroData.heroImg];
    }

    const response = await axios.put(getHeroEndpoint(id), heroData);
    res.json({
      success: true,
      data: response.data,
      message: "Hero updated successfully",
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: "Hero not found",
      });
    }
    console.error("PUT hero error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update hero",
      error: error.response?.data?.message || error.message,
    });
  }
});

// DELETE /admin/hero/:id - Delete hero
router.delete("/admin/hero/:id", express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    await axios.delete(getHeroEndpoint(id));
    res.json({
      success: true,
      message: "Hero deleted successfully",
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: "Hero not found",
      });
    }
    console.error("DELETE hero error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete hero",
      error: error.response?.data?.message || error.message,
    });
  }
});

module.exports = router;
