require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");


const app = express();
app.use(cors());
// app.use(express.static("public"));
const PORT = process.env.PORT || 3000;

const connectionString = process.env.PG_CONNECTION_STRING;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

// Test DB connection on startup
pool.on("connect", () => {
  console.log("✅ Connected to Neon Postgres");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err);
});

const session = require("express-session");
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set to true if using HTTPS
  })
);

// --- ADMIN AUTH ROUTES ---

// POST /admin/login  { email, password }
app.post("/admin/login", express.json(), async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT id, email, password_hash, role FROM admins WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const admin = result.rows[0];

    const matches = await bcrypt.compare(password, admin.password_hash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Store minimal info in session
    req.session.admin = {
      id: admin.id,
      email: admin.email,
      role: admin.role || "admin",
    };

    res.json({
      message: "Logged in",
      admin: { id: admin.id, email: admin.email, role: admin.role },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Login failed" });
  } finally {
    client.release();
  }
});

// POST /admin/logout
app.post("/admin/logout", (req, res) => {
  req.session.admin = null;
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

// GET /admin/me  → check current session
app.get("/admin/me", (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, admin: req.session.admin });
});
// --- END ADMIN AUTH ROUTES ---

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.status(401).json({ error: "Admin login required" });
}

app.use("/admin", requireAdmin);

const imgUploadRoutes = require("./routes/img-upload");
app.use("/admin/img-upload", imgUploadRoutes);

const heroRoutes = require("./routes/hero");
app.use("/", heroRoutes);

const checkoutRoutes = require("./routes/checkout");
app.use("/api/checkout", checkoutRoutes);

app.use(express.json()); // For cart/product APIs
app.use(express.urlencoded({ extended: true }));

app.get("/api/products", express.json(), async (req, res) => {
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
app.get("/api/products/:id", async (req, res) => {
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
      featured,
      availability,
    } = req.body;

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
      req.params.id,
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
    const result = await client.query(
      "DELETE FROM products WHERE id = $1 RETURNING id",
      [req.params.id]
    );

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

app.get("/api/cart", (req, res) => {
  res.json(req.session.cart || []);
});

app.post("/api/cart/add", async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  console.log("productId", productId, "   ", "quantity", quantity);

  try {
    const client = await pool.connect();
    const product = await client.query(
      "SELECT * FROM products WHERE id = $1 AND availability != $2",
      [productId, "not available"]
    );
    client.release();

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not available" });
    }

    const item = product.rows[0];
    req.session.cart = req.session.cart || [];

    // Update or add item
    const existing = req.session.cart.find((i) => i.id == productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      req.session.cart.push({ ...item, quantity });
    }

    res.json({ cart: req.session.cart });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. POST /api/cart/checkout - Create Stripe session
app.post("/api/cart/checkout", async (req, res) => {
  const cart = req.session.cart || [];
  if (cart.length === 0) return res.status(400).json({ error: "Cart empty" });

  const line_items = cart.map((item) => ({
    name: item.name,
    description: item.description || "",
    price: parseFloat(item.price),
    images: item.image_url ? [item.image_url] : [],
    quantity: item.quantity,
  }));

  try {
    // SIMPLEST: Direct call to your checkout router's create-session
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: line_items.map((item) => ({
        price_data: {
          currency: "chf",
          product_data: {
            name: item.name,
            description: item.description,
            images: item.images,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),
      success_url: "https://nima-schmuck-test.vercel.app/",
      cancel_url: "http://localhost:3000/admin/products",
    });

    req.session.cart = [];
    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: "Checkout failed" });
  }
});

// DELETE item
app.delete("/api/cart/:productId", (req, res) => {
  const productId = req.params.productId;
  req.session.cart =
    req.session.cart?.filter((item) => item.id != productId) || [];
  res.json({ cart: req.session.cart });
});

// UPDATE quantity
app.put("/api/cart/:productId", (req, res) => {
  const { quantity } = req.body;
  if (quantity <= 0) return res.status(400).json({ error: "Invalid quantity" });

  const cart = req.session.cart || [];
  const itemIndex = cart.findIndex((i) => i.id == req.params.productId);
  if (itemIndex > -1) cart[itemIndex].quantity = quantity;

  req.session.cart = cart;
  res.json({ cart });
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
