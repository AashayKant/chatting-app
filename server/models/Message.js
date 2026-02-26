const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: String,
  room: String,
  type: {
    type: String,
    default: "text",
  },
  fileName: String,
  fileType: String,
  fileData: String,
  status: {
    type: String,
    enum: ["sent", "delivered", "seen"],
    default: "sent",
  },
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);
