const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); // ✅ Add Stripe

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendOrderConfirmation(customerEmail, session) {
  const total = (session.amount_total / 100).toFixed(2) + " CHF"; // ✅ CHF

  await transporter.sendMail({
    from: `"Nima Schmuck" <${process.env.EMAIL_USER}>`,
    to: customerEmail,
    subject: "✅ Bestellung bestätigt - Nima Schmuck",
    html: `
      <h2>🎉 Vielen Dank für Ihre Bestellung!</h2>
      <p><strong>Bestellnummer:</strong> ${session.id}</p>
      <p><strong>Betrag:</strong> ${total}</p>
      <p><strong>Status:</strong> Bezahlt</p>
      <hr>
      <p>Wir versenden in 1-2 Werktagen. Tracking per E-Mail.</p>
    `,
  });
}

async function sendAdminNotification(session) {
  console.log(
    "🔍 Admin email session:",
    session.id,
    "amount:",
    session.amount_total
  ); // ✅ DEBUG

  // ✅ SAFETY CHECK - log what we receive
  if (!session || !session.id) {
    console.error("❌ Invalid session object:", session);
    return;
  }

  try {
    // ✅ FETCH FRESH SESSION using ID
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items"],
    });

    console.log("✅ Full session fetched:", fullSession.id); // ✅ DEBUG

    const total = (fullSession.amount_total / 100).toFixed(2) + " CHF";
    const items = fullSession.line_items?.data || [];
    const itemsHtml =
      items
        .map(
          (item) =>
            `<li>${item.quantity}x ${
              item.description || item.price_data.product_data.name
            } - ${(item.amount_total / 100).toFixed(2)} CHF</li>`
        )
        .join("") || "Keine Artikel";

    await transporter.sendMail({
      from: `"Nima Schmuck" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `🔔 NEUER VERKAUF: ${total}`,
      html: `
        <h2>Neuer Verkauf eingegangen!</h2>
        <p><strong>Session ID:</strong> ${fullSession.id}</p>
        <p><strong>Kunde:</strong> ${fullSession.customer_details.email}</p>
        <p><strong>Betrag:</strong> ${total}</p>
        <hr>
        <h3>🛒 Bestellung:</h3>
        <ul>${itemsHtml}</ul>
        <hr>
        <p><small>Zeit: ${new Date(fullSession.created * 1000).toLocaleString(
          "de-CH"
        )}</small></p>
      `,
    });

    console.log("✅ Admin email sent:", session.id);
  } catch (error) {
    console.error("❌ Admin email Stripe error:", error.message);
    console.error("❌ Session ID was:", session.id);
  }
}

module.exports = { sendOrderConfirmation, sendAdminNotification }; // ✅ Export
