require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL;

app.use(cors());
app.use(express.json());

app.get("/admin/products", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const category = req.query.category;
    const material = req.query.materials;

    // Build URL for fetching all filtered items (to get total count and slicing)
    let queryParams = [];
    if (category) queryParams.push(`category=${encodeURIComponent(category)}`);
    if (material) queryParams.push(`materials=${encodeURIComponent(material)}`);
    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

    console.log(queryParams);

    const allProductsResp = await axios.get(`${API_BASE_URL}${queryString}`);
    const allProducts = allProductsResp.data;

    const totalCount = allProducts.length;
    const totalPages = Math.ceil(totalCount / limit);

    // Pagination slicing
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const items = allProducts.slice(startIndex, endIndex);

    res.json({
      page,
      limit,
      totalCount,
      totalPages,
      items,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single product by id
app.get("/admin/products/:id", async (req, res) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new product
app.post("/admin/products", async (req, res) => {
  try {
    const response = await axios.post(API_BASE_URL, req.body);
    res.status(201).json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product by id
app.put("/admin/products/:id", async (req, res) => {
  try {
    const response = await axios.put(
      `${API_BASE_URL}/${req.params.id}`,
      req.body
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product by id
app.delete("/admin/products/:id", async (req, res) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/${req.params.id}`);
    res.json({ message: "Product deleted", data: response.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
