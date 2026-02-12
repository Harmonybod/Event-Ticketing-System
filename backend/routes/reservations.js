// backend/routes/reservations.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const PROMO_LIMIT = 250;
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const { route } = require('./qr');

const RESERVATION_DEADLINE = new Date('2025-12-27T23:59:59Z'); // cutoff (UTC)
const FIXED_EVENT_ID = 1; // as you requested

// ----------------------
// CREATE RESERVATION FUNCTION
// ----------------------
function createReservation({phone_number, name, ticketsCount, ticket_type, res}) {
  const insSql = `
  INSERT INTO reservation 
  (phone_number, customer_name, total_tickets, ticket_type, status, reservation_date)
  VALUES (?, ?, ?, ?, 'pending', NOW())
`;


  db.query(insSql, [phone_number, name, ticketsCount, ticket_type], (err2, info) => {
    if (err2) {
      console.error('Reservation insert failed: ', err2);
      return res.status(500).json({ success:false, message: err2.sqlMessage });
    }
    const reservationId = info.insertId;

    // 1) create unique ticket codes
    makeUniqueCodes(db, reservationId, ticketsCount)
      .then(codes => {
        // 2) Insert tickets
        const nowForSql = new Date().toISOString().slice(0,19).replace("T"," ");
        const ticketValues = [];

        for (let i = 0; i < ticketsCount; i++) {
          ticketValues.push([
            phone_number,
            FIXED_EVENT_ID,
            nowForSql,
            '',
            'reserved',
            reservationId,
            ticket_type
          ]);
        }

        const insertTicketsSql = `
            INSERT INTO tickets
            (phone_number, event_id, purchase_datetime, hashkey, status, reservation_id, ticket_type)
            VALUES ?
        `;

        db.query(insertTicketsSql, [ticketValues], (err3) => {
          if (err3) {
            db.query('DELETE FROM reservation WHERE reservation_id = ?', [reservationId], ()=>{});
            return res.status(500).json({ success:false, message: err3.sqlMessage });
          }

          return res.json({
            success:true,
            message:`Reservation created (${ticketsCount} ticket(s)).`,
            reservation_id: reservationId,
            codes
          });
        });

      })
      .catch(err3 => {
        db.query('DELETE FROM reservation WHERE reservation_id = ?', [reservationId], ()=>{});
        return res.status(500).json({
          success:false,
          message:'Failed creating ticket codes: ' + err3.message
        });
      });
  });
};

function generateCode() {
  const rnd = crypto.randomBytes(4).toString('base64').replace(/[^A-Za-z0-9]/g,'').slice(0,8).toUpperCase();
  return `RSV-${rnd}`;
}

async function makeUniqueCodes(connection, reservationId, count) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    function tryGenerate() {
      attempts++;
      const candidates = [];
      for (let i=0;i<count;i++) candidates.push(generateCode());
      const placeholders = candidates.map(()=>'?').join(',');
      const sql = `SELECT ticket_code FROM reservation_ticket WHERE ticket_code IN (${placeholders})`;
      connection.query(sql, candidates, (err, rows) => {
        if (err) return reject(err);
        const existing = new Set((rows||[]).map(r=>r.ticket_code));
        const unique = candidates.filter(c => !existing.has(c));
        if (unique.length === candidates.length) {
          const values = unique.map(c=>[reservationId, c]);
          const insertSql = `INSERT INTO reservation_ticket (reservation_id, ticket_code) VALUES ?`;
          connection.query(insertSql, [values], (err2) => {
            if (err2) return reject(err2);
            resolve(unique);
          });
        } else {
          if (attempts > 6) return reject(new Error('Could not generate unique codes, try again'));
          setImmediate(tryGenerate);
        }
      });
    }
    tryGenerate();
  });
}
function ensureCustomerExists(phone_number, name, callback) {
  const checkSql = "SELECT phone_number FROM customers WHERE phone_number = ? LIMIT 1";
  db.query(checkSql, [phone_number], (err, rows) => {
    if (err) return callback(err);

    if (rows.length > 0) {
      return callback(null); // already exists
    }

    const insertSql = "INSERT INTO customers (phone_number, name) VALUES (?, ?)";
    db.query(insertSql, [phone_number, name], callback);
  });
}

// POST /reservations/create
router.post('/create', (req, res) => {
  const { name, phone_number, count, ticket_type } = req.body;
    // ⛔ Block reservations after deadline
    if (new Date() > RESERVATION_DEADLINE && ticket_type === 'promo') {
      return res.status(403).json({
        success: false,
        message: "Promo tickets are no longer available."
      });
    }
      
  const ticketsCount = parseInt(count);

  if (!name || !phone_number || !ticket_type) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields"
    });
  }

  if (ticketsCount < 1 || ticketsCount > 5) {
    return res.status(400).json({
      success: false,
      message: "You can reserve 1 to 5 tickets only"
    });
  }

  // 🔒 GLOBAL PER-PHONE LIMIT (MAX 5 TOTAL)
  const sumSql = `
    SELECT COALESCE(SUM(total_tickets),0) AS total
    FROM reservation
    WHERE phone_number = ?
      AND status != 'rejected'
  `;

  db.query(sumSql, [phone_number], (err, rows) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: err.sqlMessage
      });
    }

    const already = rows[0].total;

    if (already + ticketsCount > 5) {
      return res.status(400).json({
        success: false,
        message: `Limit exceeded. This phone number already reserved ${already} ticket(s). Max 5 allowed.`
      });
    }

    // ==============================
    // PROMO TICKET LOGIC
    // ==============================
    if (ticket_type === 'promo') {
      const promoSql = `
        SELECT COUNT(*) AS promoTotal
        FROM tickets
        WHERE ticket_type = 'promo'
          AND status IN ('reserved', 'approved')
      `;

      db.query(promoSql, (err, rows) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: err.sqlMessage
          });
        }

        if (rows[0].promoTotal + ticketsCount > 250) {
          return res.status(400).json({
            success: false,
            message: "Promo tickets are SOLD OUT"
          });
        }

        ensureCustomerExists(phone_number, name, (err) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: err.sqlMessage || 'Failed to create customer'
            });
          }
        
          return createReservation({
            phone_number,
            name,
            ticketsCount,
            ticket_type,
            res
          });
        });
        
        
      });

    } else {
      // REGULAR TICKET — MUST ALSO ENSURE CUSTOMER EXISTS
      ensureCustomerExists(phone_number, name, (err) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: err.sqlMessage || 'Failed to create customer'
          });
        }
    
        return createReservation({
          phone_number,
          name,
          ticketsCount,
          ticket_type,
          res
        });
      });
    }
    

    // ==============================
    // CREATE RESERVATION (ONE PLACE)
    // ==============================
    

  });
});



// GET /reservations/customer?phone=...
router.get('/customer', (req, res) => {
  const phone = req.query.phone || '';
  if (!phone) return res.status(400).json({ success:false, message:'phone required' });

  const sql = `
    SELECT r.reservation_id, r.customer_name, r.total_tickets, r.ticket_type, r.reservation_date, r.status,
           (SELECT GROUP_CONCAT(rt.ticket_code SEPARATOR ',') FROM reservation_ticket rt WHERE rt.reservation_id = r.reservation_id) AS codes,
           r.phone_number
    FROM reservation r
    WHERE r.phone_number = ?
    ORDER BY r.reservation_date DESC
  `;
  db.query(sql, [phone], (err, rows) => {
    if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
    return res.json({ success:true, reservations: rows });
  });
});

// GET /reservations/all
router.get('/all', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page-1)*limit;
  const search = req.query.search ? `%${req.query.search}%` : '%%';

  const sql = `
    SELECT r.reservation_id, r.phone_number, r.customer_name, r.total_tickets, r.ticket_type, r.reservation_date, r.status,
           (SELECT COUNT(*) FROM reservation_ticket rt WHERE rt.reservation_id = r.reservation_id) AS codes_count
    FROM reservation r
    WHERE (r.phone_number LIKE ? OR r.customer_name LIKE ?)
    ORDER BY r.reservation_date DESC
    LIMIT ? OFFSET ?
  `;
  db.query(sql, [search, search, limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
    db.query('SELECT COUNT(*) AS total FROM reservation WHERE phone_number LIKE ? OR customer_name LIKE ?', [search, search], (err2, ct) => {
      if (err2) return res.status(500).json({ success:false, message: err2.sqlMessage });
      return res.json({ success:true, reservations: rows, total: ct[0].total, page, perPage: limit });
    });
  });
});

// GET /reservations/:id/tickets  -> list tickets (ticket_id, hashkey, status, file url if exists)
router.get('/:id/tickets', (req, res) => {
  const id = req.params.id;
  const sql = `SELECT ticket_id, phone_number, event_id, purchase_datetime, hashkey, status FROM tickets WHERE reservation_id = ? ORDER BY ticket_id`;
  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
    // add file url if exists in public_qr
    const qrBase = '/qr';
    const enhanced = rows.map(r => {
      if (r.hashkey) {
        const safe = r.hashkey.replace(/[^a-zA-Z0-9-_]/g, '_');
        const fname = `QR_${safe}.png`;
        const fullPath = path.join(__dirname, '..', 'public_qr', fname);
        if (fs.existsSync(fullPath)) {
          return { ...r, hashfile: path.posix.join(qrBase, fname) };
        }
        return { ...r, hashfile: null };
      }
      return { ...r, hashfile: null };
    });
    return res.json({ success:true, tickets: enhanced });
  });
});

// PUT /reservations/approve/:id  -> approve reservation, generate hashkeys and update tickets
router.put('/approve/:id', (req, res) => {
  const id = req.params.id;

  // 1) get reservation row
  db.query('SELECT * FROM reservation WHERE reservation_id = ? LIMIT 1', [id], (err, rrows) => {
    if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
    if (!rrows || rrows.length === 0) return res.status(404).json({ success:false, message: 'Reservation not found' });

    const reservation = rrows[0];
    const phone = reservation.phone_number;

    // 2) mark reservation approved
    db.query('UPDATE reservation SET status = ? WHERE reservation_id = ?', ['approved', id], (err2) => {
      if (err2) return res.status(500).json({ success:false, message: err2.sqlMessage });

      // 3) get event_date for event_id = FIXED_EVENT_ID
      db.query('SELECT event_date FROM event WHERE event_id = ? LIMIT 1', [FIXED_EVENT_ID], (err3, erows) => {
        if (err3) return res.status(500).json({ success:false, message: err3.sqlMessage });
        if (!erows || erows.length === 0) return res.status(400).json({ success:false, message: 'Event not found' });

        const eventDate = erows[0].event_date; // 'YYYY-MM-DD'
        const eventDateStr = String(eventDate).replace(/-/g, '');

        // 4) find tickets tied to this reservation and still reserved
        db.query('SELECT ticket_id FROM tickets WHERE reservation_id = ? AND status = ?', [id, 'reserved'], (err4, trows) => {
          if (err4) return res.status(500).json({ success:false, message: err4.sqlMessage });

          if (!trows || trows.length === 0) {
            return res.json({ success:true, message: 'Reservation approved but no reserved tickets found.' });
          }

          // 5) get current max sequence for this phone & event_date
          const likePattern = `%-${eventDateStr}-${phone}`;
          const seqQuery = `
            SELECT MAX(CAST(SUBSTRING_INDEX(hashkey, '-', 1) AS UNSIGNED)) AS max_seq
            FROM tickets
            WHERE hashkey LIKE ? AND event_id = ?
          `;
          db.query(seqQuery, [likePattern, FIXED_EVENT_ID], (err5, seqRows) => {
            if (err5) return res.status(500).json({ success:false, message: err5.sqlMessage });

            let startSeq = 1;
            if (seqRows && seqRows[0] && seqRows[0].max_seq) {
              startSeq = Number(seqRows[0].max_seq) + 1;
            }

            const nowForSql = new Date().toISOString().slice(0,19).replace("T"," ");
            // update each ticket row with generated hashkey
            const updates = [];
            for (let i=0;i<trows.length;i++) {
              const seqNum = startSeq + i;
              const seqStr = String(seqNum).padStart(3, '0');
              const hashkey = `${seqStr}-${eventDateStr}-${phone}`;
              updates.push({ ticket_id: trows[i].ticket_id, hashkey });
            }

            // perform updates sequentially
            let done = 0;
            for (const u of updates) {
              db.query('UPDATE tickets SET hashkey = ?, status = ?, purchase_datetime = ? WHERE ticket_id = ?',
                [u.hashkey, 'approved', nowForSql, u.ticket_id], (err6) => {
                  if (err6) {
                    return res.status(500).json({ success:false, message: err6.sqlMessage });
                  }
                  done++;
                  if (done === updates.length) {
                    return res.json({ success:true, message: `Reservation approved and ${updates.length} ticket(s) updated.` });
                  }
                });
            }

          });

        });

      });

    });
  });
});

router.put('/reject/:id', (req, res) => {
  const id = req.params.id;
  db.query('UPDATE reservation SET status = ? WHERE reservation_id = ?', ['rejected', id], (err) => {
    if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
    return res.json({ success:true, message: 'Rejected' });
  });
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.query('DELETE FROM reservation WHERE reservation_id = ?', [id], (err) => {
    if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
    // also delete related reservation_ticket and tickets
    db.query('DELETE FROM reservation_ticket WHERE reservation_id = ?', [id], ()=>{});
    db.query('DELETE FROM tickets WHERE reservation_id = ?', [id], ()=>{});
    return res.json({ success:true, message: 'Deleted' });
  });
});

// ------------------------
// Generate QR images for reservation tickets (approved tickets only)
// POST /reservations/:id/generate_qr
// returns list of { ticket_id, filename, url }
// ------------------------
router.post('/:id/generate_qr', async (req, res) => {
  const id = req.params.id;
  try {
    // fetch tickets for this reservation that are approved and have hashkey
    const sql = 'SELECT ticket_id, hashkey FROM tickets WHERE reservation_id = ? AND status = ?';
    db.query(sql, [id, 'approved'], async (err, rows) => {
      if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
      if (!rows || rows.length === 0) {
        return res.status(400).json({ success:false, message: 'No approved tickets with hashkeys for this reservation.' });
      }

      const qrFolder = path.join(__dirname, '..', 'public_qr');
      if (!fs.existsSync(qrFolder)) fs.mkdirSync(qrFolder, { recursive: true });

      const results = [];
      for (const r of rows) {
        if (!r.hashkey) continue;
        const safe = r.hashkey.replace(/[^a-zA-Z0-9-_]/g, '_');
        const fileName = `QR_${safe}.png`;
        const filePath = path.join(qrFolder, fileName);
        // generate file (overwrite if exists)
        await QRCode.toFile(filePath, r.hashkey, { width: 400, errorCorrectionLevel: 'H' });
        results.push({ ticket_id: r.ticket_id, filename: fileName, url: `/qr/${fileName}` });
      }

      return res.json({ success:true, qrcodes: results });
    });
  } catch (err) {
    console.error('generate_qr error', err);
    return res.status(500).json({ success:false, message: err.message });
  }
});

// ------------------------
// Upload QR images to Cloudinary and send to reservation phone via WhatsApp
// POST /reservations/:id/send_qrs
// ------------------------
router.post('/:id/send_qrs', async (req, res) => {
  const id = req.params.id;
  try {
    // get reservation phone
    db.query('SELECT phone_number FROM reservation WHERE reservation_id = ? LIMIT 1', [id], async (err, rrows) => {
      if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
      if (!rrows || rrows.length === 0) return res.status(404).json({ success:false, message:'Reservation not found' });

      const phone = rrows[0].phone_number;
      // fetch approved tickets with hashkeys
      db.query('SELECT ticket_id, hashkey FROM tickets WHERE reservation_id = ? AND status = ?', [id, 'approved'], async (err2, rows) => {
        if (err2) return res.status(500).json({ success:false, message: err2.sqlMessage });
        if (!rows || rows.length === 0) return res.status(400).json({ success:false, message: 'No approved tickets found' });

        const qrFolder = path.join(__dirname, '..', 'public_qr');
        const sendResults = [];
        let sentCount = 0;

        for (const r of rows) {
          if (!r.hashkey) continue;
          const safe = r.hashkey.replace(/[^a-zA-Z0-9-_]/g, '_');
          const fileName = `QR_${safe}.png`;
          const filePath = path.join(qrFolder, fileName);
          if (!fs.existsSync(filePath)) {
            // generate if missing
            await QRCode.toFile(filePath, r.hashkey, { width: 400, errorCorrectionLevel: 'H' });
          }

          // upload to Cloudinary
          const upload = await cloudinary.uploader.upload(filePath, {
            folder: 'event_qrs',
            use_filename: true,
            unique_filename: false,
            overwrite: true
          });

          const publicUrl = upload.secure_url;

          // send via WhatsApp Cloud API
          const token = process.env.WHATSAPP_TOKEN;
          const phoneId = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;
          if (!token || !phoneId) {
            return res.status(500).json({ success:false, message: 'WHATSAPP_TOKEN or WHATSAPP_PHONE_ID missing in env' });
          }

          // NOTE: prepend country code if your phones are stored without it. Here we assume stored phone already correct.
          const payload = {
            messaging_product: "whatsapp",
            to: phone,
            type: "image",
            image: { link: publicUrl }
          };

          const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
          const rresp = await axios.post(url, payload, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
          });

          sentCount++;
          sendResults.push({ ticket_id: r.ticket_id, cloudinary: publicUrl, whatsappResult: rresp.data });
        }

        return res.json({ success:true, sent_count: sentCount, results: sendResults });
      });
    });
  } catch (err) {
    console.error('send_qrs error', err);
    return res.status(500).json({ success:false, message: err.message });
  }
});


// GET /reservations/availability
router.get('/availability', (req, res) => {
  const sql = `
    SELECT COUNT(*) AS used
    FROM tickets
    WHERE ticket_type = 'promo'
      AND status IN ('reserved', 'approved')
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false });
    }

    const used = rows[0].used;
    const remaining = Math.max(0, PROMO_LIMIT - used);

    return res.json({
      success: true,
      promo_remaining: remaining,
      promo_sold_out: remaining === 0
    });
  });
});

module.exports = router;
