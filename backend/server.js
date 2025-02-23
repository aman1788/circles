const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
require("dotenv").config();

const User = require("./models/User");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "https://amanscircle.netlify.app",
      "https://purplecircles.netlify.app",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST"],
  },
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Middleware
app.use(
  cors({
    origin: [
      "https://amanscircle.netlify.app",
      "https://purplecircles.netlify.app",
      "http://localhost:5173",
    ],
  })
);
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// Login endpoint
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid password" });
    }

    res.json({
      _id: user._id,
      username: user.username,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Register endpoint
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already taken" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = await User.create({
      username,
      password: hashedPassword,
    });

    res.status(201).json({
      _id: user._id,
      username: user.username,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/users", async (req, res) => {
  try {
    let user = await User.findOne({ username: req.body.username });
    if (!user) {
      user = await User.create({ username: req.body.username });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users
app.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chat history between two users
app.get("/messages/:userId1/:userId2", async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.params.userId1, receiver: req.params.userId2 },
        { sender: req.params.userId2, receiver: req.params.userId1 },
      ],
    }).sort("createdAt");

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/users/last-messages/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const users = await User.find({ _id: { $ne: userId } });

    const lastMessages = await Promise.all(
      users.map(async (user) => {
        const lastMessage = await Message.findOne({
          $or: [
            { sender: userId, receiver: user._id },
            { sender: user._id, receiver: userId },
          ],
        }).sort({ timestamp: -1 });

        return {
          userId: user._id,
          lastMessageTime: lastMessage ? lastMessage.timestamp : null,
        };
      })
    );

    res.json(lastMessages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const typingUsers = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", async (userId) => {
    socket.join(userId);
    socket.handshake.auth.userId = userId; // Store userId in socket

    await User.findByIdAndUpdate(userId, {
      status: "online",
      lastSeen: new Date(),
    });

    io.emit("user-status-change", {
      userId,
      status: "online",
      lastSeen: new Date(),
    });
  });

  socket.on("typing-start", ({ receiver }) => {
    typingUsers.set(socket.id, true);
    io.to(receiver).emit("typing-start", {
      userId: socket.handshake.auth.userId,
    });
  });

  socket.on("typing-stop", ({ receiver }) => {
    typingUsers.delete(socket.id);
    io.to(receiver).emit("typing-stop", {
      userId: socket.handshake.auth.userId,
    });
  });

  socket.on("send-message", async (data) => {
    const { sender, receiver, content } = data;

    try {
      const message = new Message({
        sender,
        receiver,
        content,
        createdAt: new Date(),
        status: "sent",
      });

      await message.save();

      // Emit to both sender and receiver
      // io.to(receiver).emit("receive-message", message);
      // io.to(sender).emit("receive-message", message);
      io.to(receiver).emit("receive-message", message.toObject());
      io.to(sender).emit("receive-message", message.toObject());

      message.status = "delivered";
      await message.save();

      io.to(sender).emit("message-status-update", {
        messageId: message._id,
        status: "delivered",
      });
    } catch (error) {
      console.error("Error sending message:", error);
      socket.emit("message-error", { error: "Failed to send message" });
    }
  });

  socket.on("message-read", async (messageId) => {
    const message = await Message.findById(messageId);
    if (message) {
      message.status = "read";
      await message.save();

      io.to(message.sender.toString()).emit("message-status-update", {
        messageId: message._id,
        status: "read",
      });
    }
  });

  socket.on("disconnect", async () => {
    const userId = socket.handshake.auth.userId;
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        status: "offline",
        lastSeen: new Date(),
      });

      io.emit("user-status-change", {
        userId,
        status: "offline",
        lastSeen: new Date(),
      });
    }
    typingUsers.delete(socket.id);
  });
});

const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
