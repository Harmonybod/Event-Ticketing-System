const db = require("../db");

// GET paginated customers
exports.getCustomers = (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    const query = "SELECT phone_number, name FROM customers LIMIT ? OFFSET ?";

    db.query(query, [limit, offset], (err, results) => {
        if (err) return res.status(500).send(err);

        res.json({
            page,
            customers: results
        });
    });
};

// SEARCH
exports.searchCustomer = (req, res) => {
    const q = "%" + req.query.q + "%";

    db.query(
        "SELECT phone_number, name FROM customers WHERE phone_number LIKE ? OR name LIKE ?",
        [q, q],
        (err, results) => {
            if (err) return res.status(500).send(err);
            res.json(results);
        }
    );
};
