const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
require("dotenv").config();

const Message = require("./models/Message");
const User = require("./models/User");
const authRoutes = require("./routes/authRoutes");

const app = express();

app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

app.use("/api/auth", authRoutes);

app.get("/api/users", async (req, res) => {
  try {
    const me = req.query.me;
    const q = String(req.query.q || "").trim();
    if (!q) return res.json([]);
    const raw = await User.find({
      username: { $exists: true, $ne: me, $regex: q, $options: "i" }
    })
      .select("username profilePic")
      .lean();
    const seen = new Set();
    const users = raw
      .filter((u) => {
        if (!u.username) return false;
        const key = String(u.username).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.username.localeCompare(b.username));
    res.json(users);
  } catch (e) {
    res.status(500).json("Failed to load users");
  }
});

app.get("/api/conversations", async (req, res) => {
  try {
    const me = String(req.query.me || "").trim();
    if (!me) return res.json([]);
    const pipeline = [
      { $match: { $or: [{ sender: me }, { receiver: me }] } },
      {
        $project: {
          counterpart: {
            $cond: [{ $eq: ["$sender", me] }, "$receiver", "$sender"],
          },
          message: 1,
          createdAt: 1,
          status: 1,
          type: 1,
          fileName: 1,
        },
      },
      {
        $group: {
          _id: "$counterpart",
          lastMessage: { $last: "$message" },
          lastStatus: { $last: "$status" },
          lastType: { $last: "$type" },
          lastFileName: { $last: "$fileName" },
          lastAt: { $max: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { lastAt: -1 } },
    ];
    const convs = await Message.aggregate(pipeline);
    const mapped = convs.map((c) => ({
      username: c._id,
      lastMessage: c.lastMessage,
      lastStatus: c.lastStatus,
      lastType: c.lastType,
      lastFileName: c.lastFileName,
      lastAt: c.lastAt,
      count: c.count,
    }));
    res.json(mapped);
  } catch (e) {
    res.status(500).json("Failed to load conversations");
  }
});

// Serve React build in production (for HTTPS usage)
const clientBuildPath = path.join(__dirname, "..", "client", "build");
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
}

// ---------------- HTTP/HTTPS SERVER ----------------

let server;
const certDir = path.join(__dirname, "certs");
const keyPath = path.join(certDir, "server.key");
const certPath = path.join(certDir, "server.crt");

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  server = https.createServer(sslOptions, app);
  console.log("Starting HTTPS server on port 5000");
} else {
  server = http.createServer(app);
  console.log("SSL certs not found. Starting HTTP server on port 5000");
}

// ---------------- SOCKET.IO ----------------

const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ---------------- SOCKET CONNECTION ----------------

io.on("connection", (socket) => {

  console.log("User Connected:", socket.id);

  // JOIN ROOM
  socket.on("join_room", async (room) => {

    socket.join(room);

    const messages = await Message.find({ room });

    socket.emit("load_messages", messages);
  });

  // SEND MESSAGE (text / file)
  socket.on("send_message", async (data) => {

    const newMsg = await Message.create({
      sender: data.sender,
      receiver: data.receiver,
      message: data.message,
      room: data.room,
      type: data.type || "text",
      fileName: data.fileName,
      fileType: data.fileType,
      fileData: data.fileData
    });

    io.to(data.room).emit("receive_message", newMsg);
  });

  socket.on("message_delivered", async (payload) => {
    try {
      const { id, room } = payload || {};
      if (!id || !room) return;
      const updated = await Message.findByIdAndUpdate(id, { status: "delivered" }, { new: true });
      if (updated) io.to(room).emit("status_update", { id: updated._id, status: updated.status });
    } catch (_) {}
  });

  socket.on("message_seen", async (payload) => {
    try {
      const { ids, room } = payload || {};
      if (!Array.isArray(ids) || !room) return;
      const res = await Message.updateMany({ _id: { $in: ids } }, { status: "seen" });
      io.to(room).emit("status_bulk_update", { ids, status: "seen" });
    } catch (_) {}
  });
  // WEBRTC SIGNALING
  socket.on("call_offer", (data) => {
    io.to(data.room).emit("call_offer", data);
  });

  socket.on("call_answer", (data) => {
    io.to(data.room).emit("call_answer", data);
  });

  socket.on("ice_candidate", (data) => {
    io.to(data.room).emit("ice_candidate", data);
  });

  socket.on("end_call", (data) => {
    io.to(data.room).emit("end_call", data);
  });

});

// Fallback to serve React index.html for any other route (after API)
if (fs.existsSync(clientBuildPath)) {
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
}

// ---------------- MONGODB CONNECT ----------------

mongoose.connect(process.env.MONGO_URL)
.then(() => {

  console.log("MongoDB Connected");

  server.listen(5000, () => {
    console.log("Server running on port 5000");
  });

})
.catch(err => {
  console.log("MongoDB Error:", err.message);
});
