const db = require("../db");

exports.verifyQR = (req, res) => {
    const { hashkey } = req.body;

    db.query(
        "SELECT * FROM ticket WHERE hashkey = ?",
        [hashkey],
        (err, results) => {
            if (err) return res.status(500).send(err);

            if (results.length === 0) {
                return res.json({ status: "declined", message: "Invalid QR Code" });
            }

            const ticket = results[0];

            // Already scanned
            if (ticket.scanned === 1) {
                return res.json({ status: "used", message: "Already Used" });
            }

            // Mark ticket as scanned
            db.query(
                "UPDATE ticket SET scanned = 1 WHERE ticket_id = ?",
                [ticket.ticket_id]
            );

            res.json({ status: "confirmed", message: "Valid Ticket" });
        }
    );
};
