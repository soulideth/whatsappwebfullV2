const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const axios = require("axios");
const moment = require("moment");
const { Client, LocalAuth } = require("whatsapp-web.js");
const mongoose = require("mongoose");
const { MongoStore } = require("wwebjs-mongo");
const qrcode = require("qrcode-terminal");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const config = require("./config.json");
const Group = require("./models/Group");

process.title = "whatsapp-web-api";

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

const MONGODB_URI = config.mongodb_uri || "mongodb://localhost:27017/whatsapp-web-api";

class ClientManager {
  constructor(io, store) {
    this.io = io;
    this.store = store;
    this.clients = {};      // groupId -> client instance
    this.states = {};       // groupId -> { authed, qrString, info }
    this.initializing = {}; // groupId -> promise
  }

  async initClients() {
    const groups = await Group.find({ isOnlineEnabled: true });
    for (const group of groups) {
      await this.createClient(group.groupId);
    }
  }

  async createClient(groupId) {
    if (!groupId || groupId === "null" || groupId === "undefined") {
      console.warn("Attempted to create client with invalid groupId:", groupId);
      return null;
    }
    if (this.clients[groupId]) return this.clients[groupId];
    if (this.initializing[groupId]) return this.initializing[groupId];

    this.initializing[groupId] = (async () => {
      console.log(`Initializing client for group: ${groupId}`);

      try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const localPath = path.resolve(__dirname, ".wwebjs_auth", `session-${groupId}`);
        // Windows folders are often nested: session-groupId/RemoteAuth-clientId/Default
        const localExists = fs.existsSync(path.join(localPath, 'Default')) || 
                           fs.existsSync(path.join(localPath, `RemoteAuth-${groupId}`, 'Default'));
        console.log(`Manual path check for ${groupId}: ${localPath} (Exists: ${localExists})`);
        
        const sessionCollection = collections.find(c => 
          c.name.startsWith('whatsapp-') && 
          c.name.toLowerCase().includes(groupId.toLowerCase()) &&
          c.name.endsWith(`.files`)
        );

        let isRestoring = false;
        if (localExists || sessionCollection) {
          console.log(`Fuzzy discovery for ${groupId}: (Local: ${localExists}, DB: ${!!sessionCollection})`);
          isRestoring = true;
        } else {
          console.log(`No valid session found for ${groupId}.`);
        }

        const client = new Client({
          puppeteer: {
            headless: true,
            executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            protocolTimeout: 120000, 
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-accelerated-2d-canvas",
              "--no-first-run",
              "--no-zygote",
              "--disable-gpu",
              "--disable-extensions",
            ],
          },
          qrMaxRetries: 0,
          restartOnAuthFail: true,
          qrTimeoutMs: 0,
          authStrategy: new LocalAuth({
            clientId: groupId,
            dataPath: path.resolve(__dirname, ".wwebjs_auth")
          })
        });

        const startTime = Date.now();
        this.states[groupId] = { authed: false, qrString: null, info: null, restoring: isRestoring };
        this.clients[groupId] = client;

        if (isRestoring) {
          console.log(`Restoration starting for ${groupId}: Waiting for local session validation...`);
        }

        client.on("qr", (qr) => {
          this.states[groupId].qrString = qr;
          
          if (this.states[groupId].restoring) {
            console.log(`Session invalid or corrupted for ${groupId}. Silencer aborted, showing QR instantly.`);
            this.states[groupId].restoring = false; 
          }

          this.io.to(groupId).emit("qr", qr);
          console.log(`QR RECEIVED for ${groupId}`);
        });

        client.on("authenticated", () => {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`AUTHENTICATED for ${groupId} (Handshake took ${duration}s)`);
          this.states[groupId].authed = true;
          this.states[groupId].restoring = false;
          this.io.to(groupId).emit("authenticated", true);
        });

        client.on("ready", async () => {
          console.log(`CLIENT READY for ${groupId} (Session natively secured on Disk)`);
          this.states[groupId].authed = true;
          this.states[groupId].restoring = false;
          this.states[groupId].qrString = null;
          this.states[groupId].info = client.info;
          this.io.to(groupId).emit("ready", { authenticated: true, info: client.info });
        });


        client.on("disconnected", (reason) => {
          console.log(`DISCONNECTED for ${groupId}`, reason);
          this.states[groupId].authed = false;
          this.states[groupId].restoring = false;
          this.states[groupId].qrString = null;
          this.io.to(groupId).emit("disconnected", reason);
          if (reason === "Max qrcode retries reached" || reason === "NAVIGATION_TIMEOUT" || !this.states[groupId].authed) {
            this.destroyClient(groupId);
          }
        });

        client.on("message", async (msg) => {
          msg.timestamp = moment(msg.timestamp * 1000).format("yyyy-MM-DD HH:mm:ss");
          this.io.to(groupId).emit("new_message", msg);
        });

        client.on("message_create", (msg) => {
          msg.timestamp = moment(msg.timestamp * 1000).format("yyyy-MM-DD HH:mm:ss");
          this.io.to(groupId).emit("new_message", msg);
        });

        await client.initialize();
      } catch (err) {
        console.error(`Failed to initialize client for ${groupId}:`, err);
        delete this.clients[groupId];
        delete this.states[groupId];
      } finally {
        delete this.initializing[groupId];
      }
    })();

    return this.initializing[groupId];
  }

  getClient(groupId) {
    return this.clients[groupId];
  }

  getClientInfo(groupId) {
    return this.states[groupId];
  }

  async destroyClient(groupId) {
    const client = this.clients[groupId];
    if (client) {
      try { await client.destroy(); } catch (e) { }
      delete this.clients[groupId];
      delete this.states[groupId];
      console.log(`Client destroyed and removed for ${groupId}`);
    }
  }

  async logoutClient(groupId) {
    const client = this.clients[groupId];
    if (client) {
      try { await client.logout(); } catch (e) { }
      await this.destroyClient(groupId);
    }

    // Clear session data from MongoDB store by finding correctly named collections
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      const targetCollections = collections.filter(c => 
        c.name.startsWith('whatsapp-') && 
        c.name.includes(`${groupId}.files`)
      );

      for (const col of targetCollections) {
        const sessionName = col.name.replace('whatsapp-', '').replace('.files', '');
        await this.store.delete({ session: sessionName });
        console.log(`MongoDB session cleared: ${sessionName}`);
      }
    } catch (err) {
      console.error(`Failed to clear MongoDB session for ${groupId}:`, err);
    }
  }
}

mongoose.connect(MONGODB_URI).then(async () => {
  console.log("Connected to MongoDB");
  const store = new MongoStore({ mongoose: mongoose });

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
  });

  global.clientManager = new ClientManager(io, store);

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);
    socket.on("join_group", (groupId) => {
      if (!groupId || groupId === "null" || groupId === "undefined") {
        console.warn("Socket join attempted with invalid groupId:", groupId);
        return;
      }
      socket.join(groupId);
      console.log(`Socket ${socket.id} joined group ${groupId}`);
      global.clientManager.createClient(groupId);
    });
  });

  app.use(cors());
  app.use(express.static(path.join(__dirname, "public")));
  app.use(bodyParser.json({ limit: "50mb" }));
  app.use(express.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // Routes
  const chatRoute = require("./components/chatting");
  const groupRoute = require("./components/group");
  const authRoute = require("./components/auth");
  const contactRoute = require("./components/contact");
  const settingsRoute = require("./components/settings");

  app.use("/chat", chatRoute);
  app.use("/group", groupRoute);
  app.use("/auth", authRoute);
  app.use("/contact", contactRoute);
  app.use("/settings", settingsRoute);

  const port = process.env.PORT || config.port;
  server.listen(port, () => {
    console.log("Server Running Live on Port : " + port);
    global.clientManager.initClients();
  });
}).catch(err => {
  console.error("Failed to connect to MongoDB", err);
});

// CRITICAL FIX: Graceful Shutdown Hook
// WhatsApp Multi-Device requires perfect IndexedDB synchronization.
// Force-killing the server (Ctrl+C) corrupts the keys in Chrome and triggers WhatsApp's anti-clone logout.
// This hook ensures Chrome saves its state perfectly to the Windows disk before Node exits.
async function gracefulShutdown(signal) {
  console.log(`\n(${signal}) Initiating graceful shutdown. Securing WhatsApp sessions to disk...`);
  if (global.clientManager) {
    const promises = [];
    for (const groupId in global.clientManager.clients) {
      if (global.clientManager.clients[groupId]) {
         const client = global.clientManager.clients[groupId];
         console.log(`Gracefully closing Chromium to flush profile: ${groupId}`);
         
         // Fix: Prevent Chromium shutdown from hanging indefinitely
         promises.push(
             Promise.race([
                 client.destroy().catch(() => {}),
                 new Promise(resolve => setTimeout(resolve, 3000))
             ])
         );
      }
    }
    await Promise.all(promises);
    console.log('All WhatsApp sessions perfectly secured. Safe to restart.');
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
