const router = require("express").Router();
const Group = require("../models/Group");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// Get group settings
router.get("/group", async (req, res) => {
    try {
        const group = await Group.findOne({ groupId: req.user.groupId });
        if (!group) return res.status(404).json({ status: "error", message: "Group not found" });
        res.json({ status: "success", isOnlineEnabled: group.isOnlineEnabled, name: group.name });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// Update group settings
router.post("/group", async (req, res) => {
    try {
        const { isOnlineEnabled } = req.body;
        const group = await Group.findOneAndUpdate(
            { groupId: req.user.groupId },
            { isOnlineEnabled },
            { new: true }
        );
        if (!group) return res.status(404).json({ status: "error", message: "Group not found" });
        
        res.json({ status: "success", message: "Settings updated", isOnlineEnabled: group.isOnlineEnabled });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

module.exports = router;
