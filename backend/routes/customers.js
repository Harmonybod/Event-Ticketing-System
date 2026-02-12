const express = require("express");

const router = express.Router();

const db = require("../db");



// GET /customers?search=&page=1&limit=50

router.get("/", (req, res) => {

    const search = req.query.search || "";

    const page = parseInt(req.query.page) || 1;

    const limit = parseInt(req.query.limit) || 50;

    const offset = (page - 1) * limit;



    const countSql = `

        SELECT COUNT(*) AS total

        FROM customers

        WHERE phone_number LIKE ? OR name LIKE ?

    `;



    const dataSql = `

        SELECT name, phone_number

        FROM customers

        WHERE phone_number LIKE ? OR name LIKE ?

        LIMIT ? OFFSET ?

    `;



    const searchTerm = `%${search}%`;



    db.query(countSql, [searchTerm, searchTerm], (err, countResult) => {

        if (err) return res.status(500).json({ success: false, message: err.sqlMessage });



        const total = countResult[0].total;



        db.query(dataSql, [searchTerm, searchTerm, limit, offset], (err, dataResult) => {

            if (err) return res.status(500).json({ success: false, message: err.sqlMessage });



            res.json({

                success: true,

                customers: dataResult,

                total,

                page,

                perPage: limit

            });

        });

    });

});



// POST /customers/add

router.post("/add", (req, res) => {

    const { phone_number, name } = req.body;



    if (!phone_number || !name) {

        return res.status(400).json({ success: false, message: "Missing phone number or name." });

    }



    // International phone validation (E.164)

    if (!/^\+\d{8,15}$/.test(phone_number)) {

        return res.status(400).json({

            success: false,

            message: "Phone number must be international format, e.g. +251912345678"

        });

    }





    const checkSql = "SELECT * FROM customers WHERE phone_number = ?";

    db.query(checkSql, [phone_number], (err, results) => {

        if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.sqlMessage });



        if (results.length > 0) {

            return res.json({

                success: false,

                message: "The customer is already added."

            });

        }



        const insertSql = "INSERT INTO customers (phone_number, name) VALUES (?, ?)";

        db.query(insertSql, [phone_number, name], (err2) => {

            if (err2) return res.status(500).json({ success: false, message: "DB Error: " + err2.sqlMessage });



            return res.json({

                success: true,

                message: "Customer added successfully!"

            });

        });

    });

});



// POST /customers/confirm - manually add confirmation ID

router.post("/confirm", async (req, res) => {

    const { confirmation_id, phone_number, name } = req.body;



    if (!confirmation_id || !phone_number || !name) {

        return res.status(400).json({ success: false, message: "All fields are required." });

    }



    try {

        // Check if confirmation ID already exists

        const [existing] = await db.query(

            "SELECT * FROM confirmation WHERE confirmation_id = ?",

            [confirmation_id]

        );

        if (existing.length > 0) {

            return res.json({

                success: false,

                message: "This confirmation ID already exists."

            });

        }



        // Insert into confirmation table

        await db.query(

            "INSERT INTO confirmation (confirmation_id, phone_number, name) VALUES (?, ?, ?)",

            [confirmation_id, phone_number, name]

        );



        res.json({

            success: true,

            message: "Customer confirmed successfully!"

        });



    } catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,

            message: "Server error."

        });

    }

});



router.get("/search", (req, res) => {

    const query = req.query.query || "";



    const sql = `

        SELECT phone_number, name

        FROM customers

        WHERE phone_number LIKE ? OR name LIKE ?

        LIMIT 5

    `;



    const like = `%${query}%`;



    db.query(sql, [like, like], (err, results) => {

        if (err) return res.json({ success: false, message: err.sqlMessage });



        return res.json({

            success: true,

            customers: results

        });

    });

});
/* -----------------------------------
   DELETE CUSTOMER
   DELETE /customers/:phone
------------------------------------*/
router.delete("/:phone", (req, res) => {
    const phone = decodeURIComponent(req.params.phone);
  
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number missing"
      });
    }
  
    const sql = "DELETE FROM customers WHERE phone_number = ?";
  
    db.query(sql, [phone], (err, result) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: err.sqlMessage
        });
      }
  
      if (result.affectedRows === 0) {
        return res.json({
          success: false,
          message: "Customer not found"
        });
      }
  
      return res.json({
        success: true,
        message: "Customer deleted successfully"
      });
    });
  });
  







module.exports = router;