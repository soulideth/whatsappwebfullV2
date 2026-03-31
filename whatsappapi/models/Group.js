const mongoose = require("mongoose");

const GroupSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  whatsappClientId: {
    type: String,
    unique: true,
  },
  isOnlineEnabled: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  folders: [{
    name: { type: String, required: true },
    chats: [{ type: String }] // Array of chat IDs
  }]
});

module.exports = mongoose.model("Group", GroupSchema);
