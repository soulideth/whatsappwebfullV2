const router = require("express").Router();
const Group = require("../models/Group");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// Get all folders for the group
router.get("/", async (req, res) => {
    try {
        const group = await Group.findOne({ groupId: req.user.groupId });
        if (!group) return res.status(404).json({ status: "error", message: "Group not found" });
        res.json({ status: "success", folders: group.folders || [] });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// Create a new folder
router.post("/create", async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ status: "error", message: "Folder name is required" });

        // Atomic search and push: only push if name doesn't exist
        const group = await Group.findOneAndUpdate(
            { groupId: req.user.groupId, "folders.name": { $ne: name } },
            { $push: { folders: { name, chats: [] } } },
            { new: true }
        );

        if (!group) {
            // Either group not found or folder already exists
            const existing = await Group.findOne({ groupId: req.user.groupId });
            if (!existing) return res.status(404).json({ status: "error", message: "Group not found" });
            return res.status(400).json({ status: "error", message: "Folder already exists" });
        }

        // Broadcast update
        if (global.io) {
            global.io.to(req.user.groupId).emit("folders_updated", group.folders);
        }

        res.json({ status: "success", folders: group.folders });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// Move chat to a folder
router.post("/move", async (req, res) => {
    try {
        const { chatId, folderName } = req.body;
        if (!chatId) return res.status(400).json({ status: "error", message: "chatId is required" });

        // 1. Remove from all folders atomically
        await Group.updateOne(
            { groupId: req.user.groupId },
            { $pull: { "folders.$[].chats": chatId } }
        );

        // 2. Add to new folder if folderName is provided
        if (folderName) {
            await Group.updateOne(
                { groupId: req.user.groupId, "folders.name": folderName },
                { $addToSet: { "folders.$.chats": chatId } }
            );
        }

        // 3. Fetch latest state to return and broadcast
        const group = await Group.findOne({ groupId: req.user.groupId });
        
        // Broadcast update
        if (global.io) {
            global.io.to(req.user.groupId).emit("folders_updated", group.folders);
        }

        res.json({ status: "success", folders: group.folders });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// Delete a folder
router.post("/delete", async (req, res) => {
    try {
        const { name } = req.body;
        
        const group = await Group.findOneAndUpdate(
            { groupId: req.user.groupId },
            { $pull: { folders: { name } } },
            { new: true }
        );

        if (!group) return res.status(404).json({ status: "error", message: "Group not found" });

        // Broadcast update
        if (global.io) {
            global.io.to(req.user.groupId).emit("folders_updated", group.folders);
        }

        res.json({ status: "success", folders: group.folders });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

module.exports = router;
