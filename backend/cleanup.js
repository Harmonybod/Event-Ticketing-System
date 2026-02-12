const cron = require('node-cron');
const db = require('./db');

const DEADLINE = new Date('2025-12-27T23:59:59Z');

// Runs every day at 00:30 UTC
cron.schedule('30 0 * * *', () => {
  if (new Date() <= DEADLINE) return;

  console.log('[cleanup] Deadline passed. Running promo cleanup...');

  // 1️⃣ Expire ONLY pending promo reservations
  const expireSql = `
    UPDATE reservation
    SET status = 'expired'
    WHERE status = 'pending'
      AND ticket_type = 'promo'
  `;

  db.query(expireSql, (err, res1) => {
    if (err) {
      console.error('[cleanup] Expire error:', err);
      return;
    }

    // 2️⃣ Convert tickets of expired promo reservations to regular
    const convertSql = `
      UPDATE tickets
      SET ticket_type = 'regular'
      WHERE ticket_type = 'promo'
        AND reservation_id IN (
          SELECT reservation_id
          FROM reservation
          WHERE status = 'expired'
        )
    `;

    db.query(convertSql, (err2, res2) => {
      if (err2) {
        console.error('[cleanup] Convert error:', err2);
        return;
      }

      console.log(
        `[cleanup] Expired promo reservations: ${res1.affectedRows}, Converted tickets: ${res2.affectedRows}`
      );
    });
  });

}, { timezone: 'UTC' });
