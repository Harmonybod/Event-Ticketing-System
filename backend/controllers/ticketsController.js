const db = require("../db");

exports.getTicketByHash = (req, res) => {
    const hashkey = req.params.hashkey;

    db.query("SELECT * FROM ticket WHERE hashkey = ?", [hashkey], (err, results) => {
        if (err) return res.status(500).send(err);

        res.json(results[0] || null);
    });
};
