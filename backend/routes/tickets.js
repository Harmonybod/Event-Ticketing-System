const express = require("express");
const router = express.Router();
const { getTicketByHash } = require("../controllers/ticketsController");

router.get("/:hashkey", getTicketByHash);

module.exports = router;
