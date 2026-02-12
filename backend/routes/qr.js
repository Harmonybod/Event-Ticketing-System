const express = require("express");
const router = express.Router();
const db = require("../db");

/* -----------------------------------
   VALIDATE QR TICKET
   POST /api/tickets/validate
------------------------------------*/
router.post("/validate", (req, res) => {
  const hashkey = (req.body.hashkey || "").trim();

  if (!hashkey) {
    return res.status(400).json({
      success: false,
      message: "Hashkey missing"
    });
  }

  const sql = `
    SELECT 
      t.ticket_id,
      t.status,
      t.scanned_at,
      c.phone_number,
      c.name
    FROM tickets t
    JOIN customers c ON c.phone_number = t.phone_number
    WHERE t.hashkey = ?
    LIMIT 1
  `;

  db.query(sql, [hashkey], (err, rows) => {
    if (err)
      return res.status(500).json({ success:false, message: err.sqlMessage });

    if (!rows.length) {
      return res.json({
        success: true,
        status: "invalid",
        message: "Ticket not found"
      });
    }

    const ticket = rows[0];

    // ❌ Not approved
    if (ticket.status !== "approved") {
      return res.json({
        success: true,
        status: "invalid",
        message: "Ticket not approved"
      });
    }

    // 🔁 Already scanned
    if (ticket.scanned_at) {
      return res.json({
        success: true,
        status: "used",
        message: "Ticket already used",
        customer: {
          phone: ticket.phone_number,
          name: ticket.name
        }
      });
    }

    // ✅ Mark as scanned
    db.query(
      "UPDATE tickets SET scanned_at = NOW() WHERE ticket_id = ?",
      [ticket.ticket_id],
      (err2) => {
        if (err2)
          return res.status(500).json({ success:false, message: err2.sqlMessage });

        return res.json({
          success: true,
          status: "valid",
          message: "Ticket verified successfully",
          customer: {
            phone: ticket.phone_number,
            name: ticket.name
          }
        });
      }
    );
  });
});

module.exports = router;
