// routes/checkout.js
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

router.post("/create-session", express.json(), async (req, res) => {
  try {
    const {
      line_items,
      success_url = "http://localhost:3000/success",
      cancel_url = "http://localhost:3000/checkout-test.html",
    } = req.body;
    console.log(req.body);
    console.log(line_items);

    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: line_items.map((item) => ({
        price_data: {
          currency: "chf",
          product_data: {
            name: item.name,
            description: item.description || undefined,
            images: item.images ? [item.images[0]] : undefined,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity || 1,
      })),
      success_url,
      cancel_url,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ error: "Payment session creation failed" });
  }
});

// POST /api/checkout/webhook (Stripe sends events here)
router.post(
  "/webhook",
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => {
      return buf;
    },
  }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle successful payment
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log(
        "✅ Payment succeeded:",
        session.id,
        session.amount_total / 100,
        "€"
      );

      // TODO: Update your PostgreSQL order as PAID
      // TODO: Send confirmation email
      // TODO: Clear Redis cart
    }

    // Handle payment failures
    if (event.type === "checkout.session.expired") {
      console.log("❌ Checkout abandoned:", event.data.object.id);
      // TODO: Cleanup abandoned cart
    }

    res.json({ received: true });
  }
);

module.exports = router;
