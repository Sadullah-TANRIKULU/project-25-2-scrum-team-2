require("dotenv").config();
const multer = require("multer");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.static("public"));
const PORT = process.env.PORT || 3000;

// Neon Postgres (add ssl for safety)
const connectionString = process.env.PG_CONNECTION_STRING;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

// Test DB connection on startup
pool.on("connect", () => {
  console.log("✅ Connected to Neon Postgres");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err);
});

const imgUploadRoutes = require("./routes/img-upload");
app.use("/admin/img-upload", imgUploadRoutes);

const heroRoutes = require("./routes/hero");
app.use("/", heroRoutes);

const checkoutRoutes = require("./routes/checkout");
app.use("/api/checkout", checkoutRoutes);

// Get products with pagination, filtering, and sorting
app.get("/admin/products", express.json(), async (req, res) => {
  try {
    const client = await pool.connect();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const offset = (page - 1) * limit;

    const category = req.query.category;
    const material = req.query.materials;
    const stone = req.query.stone;
    const type = req.query.typeOfMessage;
    const name = req.query.name;
    const featured = req.query.featured;
    const availability = req.query.availability;
    const sortBy = req.query.sortBy;
    const order = req.query.order || "asc";

    // Build dynamic WHERE clause
    let whereClauses = [];
    let queryParams = [];
    let paramIndex = 1;

    if (category) {
      whereClauses.push(`category = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }
    if (material) {
      whereClauses.push(`materials = $${paramIndex}`);
      queryParams.push(material);
      paramIndex++;
    }
    if (stone) {
      whereClauses.push(`stone = $${paramIndex}`);
      queryParams.push(stone);
      paramIndex++;
    }
    if (type) {
      whereClauses.push(`typeOfMessage = $${paramIndex}`);
      queryParams.push(type);
      paramIndex++;
    }
    if (name) {
      whereClauses.push(`name ILIKE $${paramIndex}`);
      queryParams.push(`%${name}%`);
      paramIndex++;
    }
    if (featured) {
      whereClauses.push(`featured = $${paramIndex}`);
      queryParams.push(featured);
      paramIndex++;
    }
    if (availability) {
      whereClauses.push(`availability = $${paramIndex}`);
      queryParams.push(availability);
      paramIndex++;
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Default sorting field is 'price'. Update API docs if you change this default.
    const validSortFields = ["name", "price", "category"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "price";
    const sortOrder = order.toLowerCase() === "desc" ? "DESC" : "ASC";

    // Count total for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products
      ${whereClause}
    `;
    const countResult = await client.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    // Get paginated products
    const productsQuery = `
      SELECT *, 
        CASE 
          WHEN availability = 'in stock' THEN '✅ In Stock'
          WHEN availability = 'on request' THEN '⏳ On Request'
          ELSE '❌ Not Available'
        END as availabilityStatus
      FROM products
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(limit, offset);

    const productsResult = await client.query(productsQuery, queryParams);

    client.release();

    res.json({
      page,
      limit,
      totalCount,
      totalPages,
      items: productsResult.rows,
    });
  } catch (error) {
    console.error("Products query error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get single product by id
app.get("/admin/products/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT * FROM products WHERE id = $1", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Query error:", error);
    res.status(500).json({ error: "Database query failed" });
  } finally {
    client.release();
  }
});

// Create new product - CLEANED UP
app.post("/admin/products", express.json(), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name,
      description,
      price,
      discount,
      category,
      materials,
      stone,
      typeOfMessage,
      message,
      featured = false, // ✅ Default values
      availability = "on request",
    } = req.body;

    // ✅ Input validation for e-commerce essentials
    if (!name || !price || !category) {
      return res.status(400).json({
        error: "Missing required fields: name, price, category",
      });
    }

    if (typeof price !== "number" || price <= 0) {
      return res.status(400).json({
        error: "Price must be a positive number",
      });
    }

    const insertQuery = `
      INSERT INTO products 
      (name, description, price, discount, category, materials, stone, typeOfMessage, message, featured, availability)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, name, price, category  -- ✅ Selective return for performance
    `;

    const values = [
      name,
      description,
      price,
      discount,
      category,
      materials,
      stone,
      typeOfMessage,
      message,
      featured,
      availability,
    ];

    const result = await client.query(insertQuery, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Insert error:", error);

    res.status(500).json({ error: "Failed to create product" });
  } finally {
    client.release();
  }
});

// Update product by id
app.put("/admin/products/:id", express.json(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, description, price, discount, category, materials, stone, typeOfMessage, message, featured, availability } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({
        error: "Missing required fields: name, price, category",
      });
    }

    const updateQuery = `
      UPDATE products
      SET name = $1, description = $2, price = $3, discount = $4, category = $5, materials = $6, stone = $7, typeOfMessage = $8, message = $9, featured = $10, availability = $11
      WHERE id = $12
      RETURNING *
    `;

    const result = await client.query(updateQuery, [
      name, description, price, discount, category, materials, stone, typeOfMessage, message, featured, availability, req.params.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ error: "Failed to update product" });
  } finally {
    client.release();
  }
});

// Delete product by id
app.delete("/admin/products/:id", express.json(), async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query("DELETE FROM products WHERE id = $1 RETURNING id", [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ message: "Product deleted", data: result.rows[0] });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete product" });
  } finally {
    client.release();
  }
});

app.get("/success", async (req, res) => {
  const sessionId = req.query.session_id;

  if (sessionId) {
    try {
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
            <button onclick="window.location.href='https://nima-schmuck-test.vercel.app/'">🛒 Continue Shopping</button>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("Stripe session fetch error:", error);
      res.sendFile(__dirname + "/public/success.html");
    }
  } else {
    res.sendFile(__dirname + "/public/success.html");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
