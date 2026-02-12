const mysql = require("mysql2");

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      // your DB username
    password: 'Open_gate24',  // your DB password
    database: 'event_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.connect((err) => {
    if (err) {
        console.error("DB connection error:", err);
    } else {
        console.log("Connected to MySQL database");
    }
});

module.exports = db;
