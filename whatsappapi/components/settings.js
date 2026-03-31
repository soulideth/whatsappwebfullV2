const router = require("express").Router();
const Group = require("../models/Group");
const User = require("../models/User");
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

// Get info for all user groups
router.get("/groups", async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ status: "error", message: "User not found" });

        const ids = new Set(user.groupIds || []);
        ids.add(user.groupId); // Ensure active group is always in the list
        const groups = await Group.find({ groupId: { $in: Array.from(ids) } });
        
        const result = groups.map(g => ({
            groupId: g.groupId,
            name: g.name,
            isOnlineEnabled: g.isOnlineEnabled
        }));

        res.json({ status: "success", groups: result });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

module.exports = router;
