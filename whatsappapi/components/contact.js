const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");

// Helper to get client for the logged-in user's group
const getGroupClient = (req) => {
    if (!req.user || !req.user.groupId) return null;
    return global.clientManager ? global.clientManager.getClient(req.user.groupId) : null;
};

router.use(authMiddleware);

router.get("/getcontacts", (req, res) => {
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  client.getContacts().then((contacts) => {
    res.send(JSON.stringify(contacts));
  });
});

router.get("/getaboutall/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (phone != undefined) {
    await client
      .getContactById(`${phone}`)
      .then((contact) => {
        contact.getAbout().then((about) => {
          res.send({ status: "success", contact: contact, about: about });
        });
      })
      .catch((err) => {
        res.send({ status: "error", message: "Not found" });
      });
  }
});

router.get("/getcontact/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (phone != undefined) {
    client
      .getContactById(`${phone}@c.us`)
      .then((contact) => {
        res.send(JSON.stringify(contact));
      })
      .catch((err) => {
        res.send({ status: "error", message: "Not found" });
      });
  }
});

router.get("/getcontactall/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (phone != undefined) {
    client
      .getContactById(`${phone}`)
      .then((contact) => {
        res.send(JSON.stringify(contact));
      })
      .catch((err) => {
        res.send({ status: "error", message: "Not found" });
      });
  }
});

router.get("/isregistereduser/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (phone != undefined) {
    try {
      const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
      const is = await client.isRegisteredUser(chatId);
      if (is) {
        res.send({ status: "success", message: `${phone} is a whatsapp user` });
      } else {
        res.send({ status: "error", message: `${phone} is not a whatsapp user` });
      }
    } catch (error) {
      console.error("isregisteredusererror:", error);
      res.send({ status: "error", message: error.message || "Failed to check number" });
    }
  } else {
    res.send({ status: "error", message: "Invalid Phone number" });
  }
});

router.get("/getpresence/:phone", async (req, res) => {
  let phone = req.params.phone;
  const client = getGroupClient(req);
  if (!client) return res.status(503).json({ status: "error", message: "WhatsApp client not initialized" });
  if (phone != undefined) {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    try {
      // Use pupPage.evaluate to get presence from internal Store
      const presence = await client.pupPage.evaluate(async (id) => {
        try {
          const presenceObj = window.Store.Presence.get(id);
          if (presenceObj) {
            return { id: id, type: presenceObj.type || 'offline', isOnline: presenceObj.isOnline || false };
          }
          if (window.Store.Presence.subscribe) window.Store.Presence.subscribe(id);
          return { id, type: 'offline', isOnline: false };
        } catch (e) {
          return { id, type: 'offline', isOnline: false, error: e.message };
        }
      }, chatId);
      res.send({ status: "success", presence });
    } catch (error) {
      res.send({ status: "error", message: error.message });
    }
  } else {
    res.send({ status: "error", message: "Invalid Phone number" });
  }
});

module.exports = router;
