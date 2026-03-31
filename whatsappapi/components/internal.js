const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const InternalMessage = require("../models/InternalMessage");

// Get internal chat history for the user's group
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.user;
    const limit = parseInt(req.query.limit) || 50;
    const messages = await InternalMessage.find({ groupId })
      .sort({ timestamp: -1 })
      .limit(limit);

    // Reverse to get chronological order
    res.json({ status: "success", messages: messages.reverse() });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
