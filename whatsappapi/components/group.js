const router = require('express').Router();
const authMiddleware = require("../middleware/authMiddleware");

// Helper to get client for the logged-in user's group
const getGroupClient = (req) => {
    if (!req.user || !req.user.groupId) return null;
    return global.clientManager ? global.clientManager.getClient(req.user.groupId) : null;
};

router.use(authMiddleware);

router.post('/sendmessage/:chatname', async (req, res) => {
  let chatname = req.params.chatname;
  let message = req.body.message;
  const client = getGroupClient(req);

  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (chatname == undefined || message == undefined) {
    res.send({ status: "error", message: "please enter valid chatname and message" });
  } else {
    try {
      const chats = await client.getChats();
      const chat = chats.find(c => c.isGroup && c.name === chatname);
      if (chat) {
        const response = await client.sendMessage(chat.id._serialized, message);
        if (response.id.fromMe) {
          res.send({ status: 'success', message: `Message successfully sent to ${chatname}` });
        } else {
          res.send({ status: 'error', message: 'Failed to send message' });
        }
      } else {
        res.send({ status: 'error', message: 'Group not found' });
      }
    } catch (err) {
      res.send({ status: 'error', message: err.message });
    }
  }
});

router.get('/getparticipants/:groupId', async (req, res) => {
  let groupId = req.params.groupId;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chat = await client.getChatById(groupId);
    if (chat.isGroup) {
      res.send({ status: 'success', message: chat.participants });
    } else {
      res.send({ status: 'error', message: 'Not a group' });
    }
  } catch (error) {
    res.send({ status: 'error', message: error.message });
  }
});

router.post('/addparticipants/:groupId', async (req, res) => {
  let groupId = req.params.groupId;
  let participants = req.body.participants;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chat = await client.getChatById(groupId);
    await chat.addParticipants(participants);
    res.send({ status: 'success', message: 'Participants added' });
  } catch (error) {
    res.send({ status: 'error', message: error.message });
  }
});

router.post('/removeparticipants/:groupId', async (req, res) => {
  let groupId = req.params.groupId;
  let participants = req.body.participants;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chat = await client.getChatById(groupId);
    await chat.removeParticipants(participants);
    res.send({ status: 'success', message: 'Participants removed' });
  } catch (error) {
    res.send({ status: 'error', message: error.message });
  }
});

router.post('/setsubject/:groupId', async (req, res) => {
  let groupId = req.params.groupId;
  let subject = req.body.subject;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chat = await client.getChatById(groupId);
    await chat.setSubject(subject);
    res.send({ status: 'success', message: 'Subject updated' });
  } catch (error) {
    res.send({ status: 'error', message: error.message });
  }
});

router.post('/setdescription/:groupId', async (req, res) => {
  let groupId = req.params.groupId;
  let description = req.body.description;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chat = await client.getChatById(groupId);
    await chat.setDescription(description);
    res.send({ status: 'success', message: 'Description updated' });
  } catch (error) {
    res.send({ status: 'error', message: error.message });
  }
});

router.post('/leave/:groupId', async (req, res) => {
  let groupId = req.params.groupId;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  try {
    const chat = await client.getChatById(groupId);
    await chat.leave();
    res.send({ status: 'success', message: 'Left group' });
  } catch (error) {
    res.send({ status: 'error', message: error.message });
  }
});

module.exports = router;
