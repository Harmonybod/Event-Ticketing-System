    // backend/routes/confirmation.js
    const express = require("express");
    const router = express.Router();
    const db = require("../db");
    const path = require("path");
    const fs = require("fs");
    const QRCode = require("qrcode");
    const cloudinary = require("cloudinary").v2;
    const axios = require("axios");

    /* -----------------------------
    PHONE NORMALIZATION (GLOBAL)
    ------------------------------*/
    function normalizePhone(phone) {
    if (!phone) return null;
    phone = phone.trim().replace(/[\s()-]/g, "");
    if (!phone.startsWith("+")) return null;
    if (!/^\+[0-9]{6,15}$/.test(phone)) return null;
    return phone;
    }

    /* -----------------------------
    SEARCH CUSTOMER
    GET /confirmation/search
    ------------------------------*/
    router.get("/search", (req, res) => {
    const q = (req.query.query || "").trim();
    if (!q) return res.json({ success: true, customers: [] });

    const sql = `
        SELECT phone_number, name
        FROM customers
        WHERE phone_number LIKE ? OR name LIKE ?
        LIMIT 5
    `;
    db.query(sql, [`%${q}%`, `%${q}%`], (err, rows) => {
        if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
        return res.json({ success:true, customers: rows });
    });
    });

    /* -----------------------------
    ADD CUSTOMER
    POST /confirmation/add_customer
    ------------------------------*/
    router.post("/add_customer", (req, res) => {
    const phone = normalizePhone(req.body.phone_number);
    const name = (req.body.name || "").trim();

    if (!phone || !name) {
        return res.status(400).json({
        success: false,
        message: "Invalid phone or name"
        });
    }

    const sql = `
        INSERT INTO customers (phone_number, name)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name)
    `;
    db.query(sql, [phone, name], (err) => {
        if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
        return res.json({ success:true, message:"Customer saved successfully" });
    });
    });

    /* -----------------------------
    SAVE PAYMENT CONFIRMATION
    POST /confirmation/save
    ------------------------------*/
    router.post("/save", (req, res) => {
        const confirmation_id = (req.body.confirmation_id || "").trim();
        const phone = normalizePhone(req.body.phone_number);
        const event_id = req.body.event_id;
        const amount = req.body.amount;
        const ticket_type = req.body.ticket_type;
      
        if (!confirmation_id || !phone || !event_id || !amount || !ticket_type) {
          return res.status(400).json({
            success: false,
            message: "Missing fields"
          });
        }
      
        // Ensure customer exists
        db.query(
          "SELECT phone_number FROM customers WHERE phone_number = ?",
          [phone],
          (err, rows) => {
            if (err)
              return res.status(500).json({ success:false, message: err.sqlMessage });
      
            if (!rows.length) {
              return res.status(400).json({
                success:false,
                message:"Customer not found"
              });
            }
      
            // Try approving reserved tickets (if any)
            const approveSql = `
              UPDATE tickets
              SET status = 'approved', amount = ?, ticket_type = ?
              WHERE phone_number = ?
                AND event_id = ?
                AND (status = 'reserved' OR status IS NULL)
            `;
      
            db.query(approveSql, [amount, ticket_type, phone, event_id], (err2, info) => {
              if (err2)
                return res.status(500).json({ success:false, message: err2.sqlMessage });
      
              // ✅ IMPORTANT CHANGE HERE
              if (info.affectedRows === 0) {
                // No reserved tickets → walk-in flow
                return res.json({
                  success: true,
                  message: "Payment confirmed. Tickets will be created as approved."
                });
              }
      
              return res.json({
                success: true,
                message: `Payment confirmed. ${info.affectedRows} reserved ticket(s) approved.`
              });
            });
          }
        );
      });
      

    /* -----------------------------
    CREATE TICKETS (INSTANT)
    POST /confirmation/create_tickets
    ------------------------------*/
    router.post("/create_tickets", (req, res) => {
    const phone = normalizePhone(req.body.phone_number);
    const event_id = req.body.event_id;
    const count = parseInt(req.body.count, 10);

    const amount = req.body.amount;
    const ticket_type = req.body.ticket_type;
    
    if (ticket_type === 'promo') {
      const limitSql = `
        SELECT COUNT(*) AS used
        FROM tickets
        WHERE ticket_type = 'promo'
          AND status IN ('reserved','approved')
      `;
    
      db.query(limitSql, (err, rows) => {
        if (err) {
          return res.json({
            success: false,
            message: err.sqlMessage
          });
        }
    
        if (rows[0].used + count > 250) {
          return res.json({
            success: false,
            message: "Promo tickets are SOLD OUT"
          });
        }
    
        // ✅ SAFE TO CONTINUE CREATING TICKETS
        createTicketsNow();
      });
    
      return; // ⛔ IMPORTANT: stop here
    }

    function createTicketsNow(){
      if (!phone || !event_id || !count || count < 1 || !amount || !ticket_type) {
        return res.status(400).json({
          success: false,
          message: "Missing or invalid input"
        });
      }
  
      db.query(
          "SELECT event_date FROM event WHERE event_id = ? LIMIT 1",
          [event_id],
          (err, rows) => {
          if (err) return res.status(500).json({ success:false, message: err.sqlMessage });
          if (!rows.length) return res.status(400).json({ success:false, message:"Event not found" });
  
          const eventDateStr = String(rows[0].event_date).replace(/-/g, "");
          const likePattern = `%-${eventDateStr}-${phone}`;
  
          const seqSql = `
              SELECT MAX(CAST(SUBSTRING_INDEX(hashkey,'-',1) AS UNSIGNED)) AS max_seq
              FROM tickets
              WHERE hashkey LIKE ? AND event_id = ?
          `;
  
          db.query(seqSql, [likePattern, event_id], (err2, seqRows) => {
              if (err2) return res.status(500).json({ success:false, message: err2.sqlMessage });
  
              let startSeq = seqRows[0]?.max_seq ? Number(seqRows[0].max_seq) + 1 : 1;
              const now = new Date().toISOString().slice(0,19).replace("T"," ");
              const values = [];
              const created = [];
  
              for (let i = 0; i < count; i++) {
              const seq = String(startSeq + i).padStart(3,"0");
              const hashkey = `${seq}-${eventDateStr}-${phone}`;
              values.push([phone, event_id, now, hashkey, "approved", null, amount, ticket_type]);
              created.push({ hashkey });
              }
  
              const insSql = `
              INSERT INTO tickets
              (phone_number, event_id, purchase_datetime, hashkey, status, reservation_id, amount, ticket_type)
              VALUES ?
              `;
              db.query(insSql, [values], (err3) => {
              if (err3) return res.status(500).json({ success:false, message: err3.sqlMessage });
              return res.json({
                  success:true,
                  message:`${count} ticket(s) created`,
                  tickets: created
              });
              });
          });
          }
      );
    }});
    
    /* -----------------------------
    GENERATE QR CODES
    POST /confirmation/generate_qr
    ------------------------------*/
    router.post("/generate_qr", async (req, res) => {
    const { hashkeys } = req.body;
    if (!Array.isArray(hashkeys) || hashkeys.length === 0)
        return res.status(400).json({ success:false, message:"Hashkeys required" });

    try {
        const qrDir = path.join(__dirname, "..", "public_qr");
        if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

        const qrs = [];
        for (const hash of hashkeys) {
        const safe = hash.replace(/[^a-zA-Z0-9-_]/g,"_");
        const filename = `QR_${safe}.png`;
        const filePath = path.join(qrDir, filename);
        await QRCode.toFile(filePath, hash, { width:400, errorCorrectionLevel:"H" });
        qrs.push({ filename, url:`/qr/${filename}` });
        }

        return res.json({ success:true, qrcodes:qrs });

    } catch (err) {
        return res.status(500).json({ success:false, message: err.message });
    }
    });

    /* -----------------------------
    SEND VIA WHATSAPP
    ------------------------------*/
    router.post("/send_whatsapp", async (req, res) => {
    const phone = normalizePhone(req.body.phone_number);
    const image_url = req.body.image_url;

    if (!phone || !image_url)
        return res.status(400).json({ success:false, message:"Missing fields" });

    try {
        const payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: { link: image_url }
        };

        await axios.post(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
        payload,
        { headers:{ Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}` } }
        );

        return res.json({ success:true, message:"Sent via WhatsApp" });

    } catch (err) {
        return res.status(500).json({ success:false, message: err.message });
    }
    });
    router.get("/test", (req, res) => {
        res.send("CONFIRMATION ROUTE WORKS");
    });
    
    module.exports = router;
