const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  content: { type: String, required: true },
  status: {
    type: String,
    enum: ["sent", "delivered", "read"],
    default: "sent",
  },
  createdAt: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);
module.exports = Message;

// const messageSchema = new mongoose.Schema({
//   sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   content: String,
//   fileUrl: String,
//   fileType: String,
//   status: {
//     type: String,
//     enum: ["sent", "delivered", "read"],
//     default: "sent",
//   },
//   createdAt: { type: Date, default: Date.now },
// });
