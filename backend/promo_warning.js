// backend/promo_warning.js
const cron = require('node-cron');
const db = require('./db');
const axios = require('axios');

const WARNING_DATE = '2025-12-25';
const EVENT_ID = 1;

// WhatsApp sender
async function sendWhatsApp(phone, message) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    console.error('[promo-warning] WhatsApp env missing');
    return;
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'text',
    text: { body: message }
  };

  await axios.post(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

/**
 * Runs once per day at 09:00 UTC
 */
cron.schedule('0 9 * * *', async () => {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== WARNING_DATE) return;

  console.log('[promo-warning] Running promo expiry warning job');

  const sql = `
    SELECT DISTINCT
      t.phone_number,
      c.name,
      e.event_name
    FROM tickets t
    JOIN customers c ON c.phone_number = t.phone_number
    JOIN event e ON e.event_id = t.event_id
    WHERE t.ticket_type = 'promo'
      AND t.status = 'reserved'
      AND t.promo_warning_sent = 0
      AND t.event_id = ?
  `;

  db.query(sql, [EVENT_ID], async (err, rows) => {
    if (err) {
      console.error('[promo-warning] DB error:', err.sqlMessage);
      return;
    }

    if (!rows.length) {
      console.log('[promo-warning] No promo tickets to warn');
      return;
    }

    for (const r of rows) {
      const message = `
⚠️ Promo Ticket Expiry Notice

Dear ${r.name},

Your promo ticket reservation for *${r.event_name}* will expire on *December 27*.

If payment is not completed before this date, your ticket will automatically be converted to a *regular ticket* with a higher price.

Please complete your payment before Dec 27 to keep the promo price.

Thank you.
`.trim();

      try {
        await sendWhatsApp(r.phone_number, message);

        // Mark as warned
        db.query(
          `UPDATE tickets SET promo_warning_sent = 1 WHERE phone_number = ? AND ticket_type = 'promo' AND status = 'reserved'`,
          [r.phone_number]
        );

        console.log('[promo-warning] Sent warning to', r.phone_number);
      } catch (e) {
        console.error('[promo-warning] WhatsApp send failed:', e.message);
      }
    }
  });
}, { timezone: 'UTC' });
