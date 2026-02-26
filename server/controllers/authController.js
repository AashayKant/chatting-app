const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.signup = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json("Username and password are required");
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json("Username is already taken");
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password: hash,
    });

    res.json(user);
  } catch (err) {
    res.status(500).json(err);
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });

    if (!user) return res.status(400).json("User not found");

    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.status(400).json("Wrong password");

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.json({ user, token });
  } catch (err) {
    res.status(500).json(err);
  }
};