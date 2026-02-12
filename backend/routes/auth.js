const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.admin = true;
    return res.json({ success: true });
  }

  return res.status(401).json({
    success: false,
    message: 'Invalid credentials'
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('officer.sid');
    res.json({ success: true });
  });
});

router.get('/check', (req, res) => {
  res.json({ loggedIn: !!req.session.admin });
});

module.exports = router;
