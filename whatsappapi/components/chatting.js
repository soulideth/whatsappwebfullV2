const router = require("express").Router();
const { MessageMedia, Location, Buttons, List } = require("whatsapp-web.js");
const request = require("request");
const vuri = require("valid-url");
const fs = require("fs");
const moment = require("moment");
const multer = require("multer");
const path = require("path");
const shelljs = require("shelljs");
const authMiddleware = require("../middleware/authMiddleware");

var storage = multer.diskStorage({
  destination: "./tmp/",
  filename: function (req, file, cb) {
    cb(null, "video.mp4");
  },
});
const upload = multer({ storage: storage });

var voiceStorage = multer.diskStorage({
  destination: "./tmp/",
  filename: function (req, file, cb) {
    const ext = file.originalname.endsWith('.ogg') ? 'ogg' : 'webm';
    cb(null, `voice.${ext}`);
  },
});
const uploadVoice = multer({ storage: voiceStorage });

const mediadownloader = (url, path, callback) => {
  request.head(url, (err, res, body) => {
    request(url).pipe(fs.createWriteStream(path)).on("close", callback);
  });
};

// Helper to get client for the logged-in user's group
const getGroupClient = (req) => {
  if (!req.user || !req.user.groupId) return null;
  return global.clientManager ? global.clientManager.getClient(req.user.groupId) : null;
};

router.use(authMiddleware);

router.post("/sendmessage/:phone", async (req, res) => {
  let phone = req.params.phone;
  let message = req.body.message;
  const client = getGroupClient(req);

  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized for this group" });
  if (phone == undefined || message == undefined) {
    return res.send({ status: "error", message: "please enter valid phone and message" });
  }

  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const response = await client.sendMessage(chatId, message);
    if (response && response.id && response.id.fromMe) {
      res.send({ status: "success", message: `Message successfully sent to ${phone}` });
    } else {
      res.send({ status: "error", message: "Failed to send message" });
    }
  } catch (error) {
    res.send({ status: "error", message: error.message || "Failed to send message" });
  }
});

router.post("/sendimage/:phone", async (req, res) => {
  var base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  let phone = req.params.phone;
  let image = req.body.image;
  let caption = req.body.caption;
  const client = getGroupClient(req);

  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (phone == undefined || image == undefined) {
    return res.send({ status: "error", message: "please enter valid phone and base64/url of image" });
  }

  const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
  try {
    if (base64regex.test(image)) {
      let media = new MessageMedia("image/png", image);
      const response = await client.sendMessage(chatId, media, { caption: caption || "" });
      if (response && response.id && response.id.fromMe) {
        res.send({ status: "success", message: `MediaMessage successfully sent to ${phone}` });
      }
    } else if (vuri.isWebUri(image)) {
      if (!fs.existsSync("./tmp")) fs.mkdirSync("./tmp");
      var path = "./tmp/" + image.split("/").slice(-1)[0];
      mediadownloader(image, path, async () => {
        try {
          let media = MessageMedia.fromFilePath(path);
          const response = await client.sendMessage(chatId, media, { caption: caption || "" });
          if (response && response.id && response.id.fromMe) {
            res.send({ status: "success", message: `MediaMessage successfully sent to ${phone}` });
          }
          if (fs.existsSync(path)) fs.unlinkSync(path);
        } catch (innerErr) {
          res.send({ status: "error", message: innerErr.message });
        }
      });
    } else {
      res.send({ status: "error", message: "Invalid URL/Base64 Encoded Media" });
    }
  } catch (error) {
    res.send({ status: "error", message: error.message || "Failed to send image" });
  }
});

router.post("/sendvideo/:phone", upload.single("video"), async (req, res) => {
  let phone = req.params.phone;
  let file = req.file;
  let caption = req.body.caption;
  const client = getGroupClient(req);

  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (phone == undefined || file == undefined) {
    return res.send({ status: "error", message: "please enter valid phone and video mp4" });
  }
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const media = await MessageMedia.fromFilePath("./tmp/video.mp4");
    if (file.size > 15728640) {
      return res.send({ status: "error", message: "limit size of video is 15 Mb and 3 minute" });
    }
    const response = await client.sendMessage(chatId, media, { caption: caption || "" });
    if (response && response.id && response.id.fromMe) {
      res.send({ status: "success", message: `MediaMessage successfully sent to ${phone}` });
    }
  } catch (error) {
    res.send({ status: "error", message: error.message || "Failed to send video" });
  }
});

router.post("/sendvoice/:phone", uploadVoice.single("voice"), async (req, res) => {
  let phone = req.params.phone;
  let file = req.file;
  const client = getGroupClient(req);

  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (phone == undefined || file == undefined) {
    return res.send({ status: "error", message: "please provide a valid phone and voice audio file" });
  }
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const absolutePath = path.resolve(file.path);
    const oggPath = absolutePath.replace(/\.[^.]+$/, '.ogg');

    shelljs.exec(`ffmpeg -y -i "${absolutePath}" -c:a libopus -b:a 64k "${oggPath}"`, { silent: true });

    const media = MessageMedia.fromFilePath(oggPath);
    const response = await client.sendMessage(chatId, media, { sendAudioAsVoice: true });

    if (response && response.id && response.id.fromMe) {
      res.send({ status: "success", message: `Voice message sent successfully to ${phone}` });
    } else {
      res.send({ status: "error", message: "Failed to send native voice message" });
    }
    try { fs.unlinkSync(oggPath); } catch (e) { }
  } catch (error) {
    res.send({ status: "error", message: error.message || "Voice send failed" });
  }
});

async function fetchMessagesWithRetry(chat, targetLimit, maxRetries = 3, delayMs = 500) {
  let messages = [];
  let previousCount = 0;
  let attempts = 0;
  while (attempts < maxRetries) {
    messages = await chat.fetchMessages({ limit: targetLimit });
    if (messages.length >= targetLimit) break;
    if (attempts > 0 && messages.length === previousCount) break;
    previousCount = messages.length;
    attempts++;
    if (attempts < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return messages;
}

router.get("/getchatbyid/:phone", async (req, res) => {
  let phone = req.params.phone;
  let limit = parseInt(req.query.limit) || 50;
  const client = getGroupClient(req);

  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (phone == undefined) {
    res.send({ status: "error", message: "please enter valid phone number" });
  } else {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    try {
      const chat = await client.getChatById(chatId);
      const messages = await fetchMessagesWithRetry(chat, limit);
      const processedMessages = await Promise.all(messages.map(async (msg) => {
        msg.timestamp = moment(msg.timestamp * 1000).format("yyyy-MM-DD HH:mm:ss");
        if (msg.hasReaction) {
          try {
            const reactions = await msg.getReactions();
            msg.reactions = reactions ? reactions.map(r => r.reaction) : [];
          } catch (e) { msg.reactions = []; }
        }
        return msg;
      }));
      res.status(200).json({ status: "success", message: processedMessages });
    } catch (err) {
      res.send({ status: "error", message: "getchaterror: " + err.message });
    }
  }
});

router.get("/getchats", async (req, res) => {
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chats = await client.getChats();
    const processedChats = chats.map((e) => {
      e.phoneNumber = e.id.user; // Extract native phone number strictly from WA object
      e.id = e.id._serialized;
      e.date = moment(e.timestamp * 1000).format("yyyy-MM-DD");
      e.timestamp = moment(e.timestamp * 1000).format("yyyy-MM-DD HH:mm:ss");
      return e;
    });
    res.send({ status: "success", message: processedChats });
  } catch (err) {
    res.send({ status: "error", message: "getchatserror" });
  }
});

router.get("/getcontact/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const contact = await client.getContactById(phone);
    if (contact) {
      res.status(200).json({ status: "success", message: { number: contact.number, pushname: contact.pushname, name: contact.name, isBusiness: contact.isBusiness }});
    } else {
      res.status(404).json({ status: "error", message: "Contact not found" });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.post("/react/:phone", async (req, res) => {
  let msgId = req.body.msgId;
  let reaction = req.body.reaction;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (msgId == undefined || reaction == undefined) {
    res.send({ status: "error", message: "please enter valid msgId and reaction" });
  } else {
    try {
      const msg = await client.getMessageById(msgId);
      if (msg) {
        await msg.react(reaction);
        res.send({ status: "success", message: "Reaction sent" });
      } else {
        res.send({ status: "error", message: "Message not found" });
      }
    } catch (error) {
      res.send({ status: "error", message: error.message });
    }
  }
});

router.post("/delete/:phone", async (req, res) => {
  let msgId = req.body.msgId;
  let everyone = req.body.everyone || false;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (msgId == undefined) {
    res.send({ status: "error", message: "please enter valid msgId" });
  } else {
    try {
      const msg = await client.getMessageById(msgId);
      if (msg) {
        await msg.delete(everyone);
        res.send({ status: "success", message: "Message deleted" });
      } else {
        res.send({ status: "error", message: "Message not found" });
      }
    } catch (error) {
      res.send({ status: "error", message: error.message });
    }
  }
});

router.post("/edit/:phone", async (req, res) => {
  let msgId = req.body.msgId;
  let newContent = req.body.newContent;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (msgId == undefined || newContent == undefined) {
    res.send({ status: "error", message: "please enter valid msgId and newContent" });
  } else {
    try {
      const msg = await client.getMessageById(msgId);
      if (msg) {
        await msg.edit(newContent);
        res.send({ status: "success", message: "Message edited" });
      } else {
        res.send({ status: "error", message: "Message not found" });
      }
    } catch (error) {
      res.send({ status: "error", message: error.message });
    }
  }
});

router.post("/seen/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const chat = await client.getChatById(chatId);
    await chat.sendSeen();
    res.send({ status: "success", message: "Chat marked as seen" });
  } catch (error) {
    res.send({ status: "error", message: error.message });
  }
});

router.post("/archive/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const chat = await client.getChatById(chatId);
    await chat.archive();
    res.send({ status: "success", message: "Chat archived" });
  } catch (error) {
    res.send({ status: "error", message: error.message });
  }
});

router.post("/unarchive/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const chat = await client.getChatById(chatId);
    await chat.unarchive();
    res.send({ status: "success", message: "Chat unarchived" });
  } catch (error) {
    res.send({ status: "error", message: error.message });
  }
});

router.post("/mute/:phone", async (req, res) => {
  let phone = req.params.phone;
  let unmuteDate = req.body.unmuteDate ? new Date(req.body.unmuteDate) : null;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const chat = await client.getChatById(chatId);
    await chat.mute(unmuteDate);
    res.send({ status: "success", message: "Chat muted" });
  } catch (error) {
    res.send({ status: "error", message: error.message });
  }
});

router.post("/pin/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const chat = await client.getChatById(chatId);
    const result = await chat.pin();
    res.send({ status: "success", message: result ? "Chat pinned" : "Pin limit reached or failed" });
  } catch (error) {
    res.send({ status: "error", message: error.message });
  }
});

router.post("/unpin/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const chat = await client.getChatById(chatId);
    const result = await chat.unpin();
    res.send({ status: "success", message: result ? "Chat unpinned" : "Failed to unpin" });
  } catch (error) {
    res.send({ status: "error", message: error.message });
  }
});

router.get("/getprofilepic/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.send({ status: "success", message: "" });
  const cleanPhone = (phone || "").split('@')[0];
  if (!phone || phone === 'status@broadcast' || phone.includes('newsletter') || cleanPhone.length < 5 || isNaN(cleanPhone)) {
    return res.send({ status: "success", message: "" });
  }
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const url = await client.pupPage.evaluate(async (id) => {
      try {
        const chatWid = window.Store.WidFactory.createWid(id);
        const contact = window.Store.Contact.get(id);
        if (contact && contact.profilePicThumbObj && contact.profilePicThumbObj.eurl) return contact.profilePicThumbObj.eurl;
        if (window.Store.ProfilePicThumb) {
          const thumb = window.Store.ProfilePicThumb.get(id);
          if (thumb && thumb.eurl) return thumb.eurl;
        }
        const targetObj = contact || { id: chatWid, isNewsletter: false, isGroup: chatWid.isGroup, isUser: chatWid.isUser };
        if (window.Store.ProfilePic && window.Store.ProfilePic.requestProfilePicFromServer) return await window.Store.ProfilePic.requestProfilePicFromServer(targetObj);
        return "";
      } catch (e) { return ""; }
    }, chatId);
    res.send({ status: "success", message: url || "" });
  } catch (error) {
    res.send({ status: "success", message: "" });
  }
});

router.get("/getabout/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const contact = await client.getContactById(chatId);
    const about = await contact.getAbout();
    res.send({ status: "success", message: about });
  } catch (error) {
    res.send({ status: "error", message: error.message });
  }
});

router.get("/checknumber/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    const isRegistered = await client.isRegisteredUser(chatId);
    res.send({ status: "success", message: isRegistered });
  } catch (error) {
    res.send({ status: "error", message: error.message || "Failed to check number" });
  }
});

router.get("/getmedia/:messageId", async (req, res) => {
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const message = await client.getMessageById(req.params.messageId);
    if (message && message.hasMedia) {
      const media = await message.downloadMedia();
      if (media) {
        res.send({ status: "success", message: { mimetype: media.mimetype, data: media.data, filename: media.filename } });
      } else {
        res.status(404).send({ status: "error", message: "Media not found" });
      }
    } else {
      res.status(400).send({ status: "error", message: "Message has no media" });
    }
  } catch (error) {
    res.status(500).send({ status: "error", message: error.message });
  }
});

router.get("/getbroadcasts", async (req, res) => {
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const broadcasts = await client.pupPage.evaluate(async () => {
      const statusCollection = window.Store.Status;
      if (!statusCollection) return [];
      return statusCollection.getModelsArray().map(s => ({
        id: s.id._serialized, unreadCount: s.unreadCount, totalCount: s.totalCount, timestamp: s.t
      }));
    });
    res.send({ status: "success", message: broadcasts });
  } catch (err) {
    res.send({ status: "error", message: "getbroadcastserror: " + err.message });
  }
});

module.exports = router;
