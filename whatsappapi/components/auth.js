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
      groupIds: [groupId], // Initialize with the primary group
    });

    await user.save();

    const payload = {
      userId: user._id,
      username: user.username,
      groupId: user.groupId,
      groupIds: user.groupIds,
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

    // Sync groupIds: Ensure active groupId is in the list
    if (!user.groupIds.includes(user.groupId)) {
        user.groupIds.push(user.groupId);
        await user.save();
    }

    const groupIdsSet = new Set(user.groupIds || []);
    groupIdsSet.add(user.groupId);

    const payload = {
      userId: user._id,
      username: user.username,
      groupId: user.groupId,
      groupIds: Array.from(groupIdsSet),
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

router.post("/switch-group", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    // Capture old group to ensure it stays authorized
    const oldGroupId = user.groupId;

    // Check if user belongs to the group
    const hasAccess = user.groupId === groupId || (user.groupIds && user.groupIds.includes(groupId));
    if (!hasAccess) {
      const msg = `Access denied to group ${groupId}. You currently belong to ${user.groupId}. Authorized: ${user.groupIds.join(', ') || 'none'}`;
      console.warn(`[switch-group] ${msg}`);
      return res.status(403).json({ status: "error", message: msg });
    }

    // Update active group and ensure historic groups are saved
    user.groupId = groupId;
    if (!user.groupIds.includes(oldGroupId)) {
        user.groupIds.push(oldGroupId);
    }
    // Also ensure new group is in list (just in case)
    if (!user.groupIds.includes(groupId)) {
        user.groupIds.push(groupId);
    }
    await user.save();

    const groupIdsSet = new Set(user.groupIds || []);
    groupIdsSet.add(user.groupId);

    const payload = {
      userId: user._id,
      username: user.username,
      groupId: user.groupId,
      groupIds: Array.from(groupIdsSet),
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
