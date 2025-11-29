require("dotenv").config();
const multer = require("multer");
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.static("public"));
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL;
const checkoutRoutes = require("./routes/checkout");
app.use("/api/checkout", checkoutRoutes);

app.get("/admin/products", express.json(), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const category = req.query.category;
    const material = req.query.materials;
    const stone = req.query.stone;
    const type = req.query.typeOfMessage;
    const name = req.query.name;
    const featured = req.query.featured;

    const sortBy = req.query.sortBy;
    const order = req.query.order || "asc";

    const availability = req.query.availability;

    // Build URL for fetching all filtered items (to get total count and slicing)
    let queryParams = [];
    if (category) queryParams.push(`category=${encodeURIComponent(category)}`);
    if (material) queryParams.push(`materials=${encodeURIComponent(material)}`);
    if (stone) queryParams.push(`stone=${encodeURIComponent(stone)}`);
    if (type) queryParams.push(`typeOfMessage=${encodeURIComponent(type)}`);
    if (name) queryParams.push(`name=${encodeURIComponent(name)}`);
    if (featured) queryParams.push(`featured=${encodeURIComponent(featured)}`);
    if (availability)
      queryParams.push(`availability=${encodeURIComponent(availability)}`);

    if (sortBy) {
      queryParams.push(`sortBy=${encodeURIComponent(sortBy)}`);
      queryParams.push(`order=${encodeURIComponent(order)}`);
    }

    const queryString =
      queryParams.length > 0 ? `?${queryParams.join("&")}` : "";

    const allProductsResp = await axios.get(`${API_BASE_URL}${queryString}`);
    const allProducts = allProductsResp.data;

    const enhancedProducts = allProducts.map((product) => {
      const availability = product.availability || "not available";

      return {
        ...product,
        availabilityStatus:
          availability === "in stock"
            ? "✅ In Stock"
            : availability === "on request"
            ? "⏳ On Request"
            : "❌ Not Available",
      };
    });

    const totalCount = enhancedProducts.length;
    const totalPages = Math.ceil(totalCount / limit);

    // Pagination slicing
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const items = enhancedProducts.slice(startIndex, endIndex);

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
app.get("/admin/products/:id", express.json(), async (req, res) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new product
app.post("/admin/products", express.json(), async (req, res) => {
  try {
    const response = await axios.post(API_BASE_URL, req.body);
    res.status(201).json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product by id
app.put("/admin/products/:id", express.json(), async (req, res) => {
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
app.delete("/admin/products/:id", express.json(), async (req, res) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/${req.params.id}`);
    res.json({ message: "Product deleted", data: response.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ADD THIS - Stripe Session Verification (right before app.listen)
app.get("/success", async (req, res) => {
  const sessionId = req.query.session_id;

  if (sessionId) {
    try {
      // Fetch session details from Stripe
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>✅ Payment Successful - Nima Schmuck</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .success { background: #d4edda; color: #155724; padding: 40px; border-radius: 12px; border: 3px solid #c3e6cb; }
            .icon { font-size: 64px; margin-bottom: 20px; }
            .order-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left; }
            button { background: #635bff; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="success">
            <div class="icon">✅</div>
            <h1>Thank You for Your Purchase!</h1>
            
            <div class="order-details">
              <h3>Order Details</h3>
              <p><strong>Session ID:</strong> ${session.id}</p>
              <p><strong>Total:</strong> €${(
                session.amount_total / 100
              ).toFixed(2)}</p>
              <p><strong>Payment Status:</strong> ${session.payment_status}</p>
              ${
                session.customer_details?.email
                  ? `<p><strong>Email:</strong> ${session.customer_details.email}</p>`
                  : ""
              }
            </div>
            
            <p>Order confirmation sent to your email.</p>
            <button onclick="window.location.href='/checkout-test.html'">🛒 Continue Shopping</button>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("Stripe session fetch error:", error);
      res.sendFile(__dirname + "/public/success.html"); // Fallback to static
    }
  } else {
    res.sendFile(__dirname + "/public/success.html"); // Fallback to static
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
