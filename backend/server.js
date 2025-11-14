require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL;

app.use(cors());
app.use(express.json());

// Get all products
app.get('/products', async (req, res) => {
  try {
    const response = await axios.get(API_BASE_URL);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single product by id
app.get('/products/:id', async (req, res) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new product
app.post('/products', async (req, res) => {
  try {
    const response = await axios.post(API_BASE_URL, req.body);
    res.status(201).json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product by id
app.put('/products/:id', async (req, res) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/${req.params.id}`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product by id
app.delete('/products/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/${req.params.id}`);
    res.json({ message: 'Product deleted', data: response.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
