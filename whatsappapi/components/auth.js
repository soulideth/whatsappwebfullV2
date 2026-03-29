const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Group = require("../models/Group");
const config = require("../config.json");
const authMiddleware = require("../middleware/authMiddleware");

// Helper to get client for a specific group (implemented in api.js)
const getClient = (groupId) => {
  return global.clientManager ? global.clientManager.getClient(groupId) : null;
};

// --- User Auth Routes ---

router.post("/register", async (req, res) => {
  try {
    const { username, password, groupId, groupName } = req.body;

    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ status: "error", message: "User already exists" });
    }

    // Check if group exists, if not create it
    let group = await Group.findOne({ groupId });
    if (!group) {
        group = new Group({
            groupId,
            name: groupName || groupId,
            whatsappClientId: groupId
        });
        await group.save();
    }

    user = new User({
      username,
      password,
      groupId,
    });

    await user.save();

    const payload = {
      userId: user._id,
      username: user.username,
      groupId: user.groupId,
    };

    jwt.sign(
      payload,
      config.jwt_secret || "secret",
      { expiresIn: "7d" },
      (err, token) => {
        if (err) throw err;
        res.json({ status: "success", token, user: payload });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ status: "error", message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ status: "error", message: "Invalid credentials" });
    }

    const payload = {
      userId: user._id,
      username: user.username,
      groupId: user.groupId,
    };

    jwt.sign(
      payload,
      config.jwt_secret || "secret",
      { expiresIn: "7d" },
      (err, token) => {
        if (err) throw err;
        res.json({ status: "success", token, user: payload });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// --- WhatsApp Auth Routes (Protected & Group-Aware) ---

router.get("/status", authMiddleware, async (req, res) => {
  const { groupId } = req.user;
  const clientInfo = global.clientManager ? global.clientManager.getClientInfo(groupId) : null;
  
  res.json({
    status: "success",
    authenticated: clientInfo ? clientInfo.authed : false,
    info: clientInfo ? clientInfo.info : null,
  });
});

router.get("/qrdata", authMiddleware, (req, res) => {
  const { groupId } = req.user;
  const clientInfo = global.clientManager ? global.clientManager.getClientInfo(groupId) : null;

  if (clientInfo && clientInfo.authed) {
    return res.json({ status: "error", message: "Already authenticated" });
  }

  if (clientInfo && clientInfo.qrString) {
    return res.json({ status: "success", qr: clientInfo.qrString });
  }

  res.json({ status: "error", message: "QR not ready" });
});

router.get("/checkauth", authMiddleware, async (req, res) => {
  const { groupId } = req.user;
  const client = getClient(groupId);

  if (!client || !client.info) {
    res.send("DISCONNECTED");
  } else {
    try {
      client
        .getState()
        .then((data) => {
          res.send(data);
        })
        .catch((err) => {
          res.send("DISCONNECTED");
        });
    } catch (error) {
      res.send("DISCONNECTED");
    }
  }
});

router.post("/logout", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.user;
    if (global.clientManager) {
        await global.clientManager.logoutClient(groupId);
        res.json({ status: "success", message: "Logged out and data cleared for group " + groupId });
    } else {
        res.status(500).json({ status: "error", message: "Client manager not initialized" });
    }
  } catch (err) {
    console.error("Logout critical error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;
