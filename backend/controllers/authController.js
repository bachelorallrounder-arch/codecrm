import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import AuditLog from "../models/AuditLog.js";

export const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

  await AuditLog.create({ user: user._id, action: "login", entity: "User", entityId: user._id });
  res.json({ token, user: { id: user._id, name: user.name, role: user.role, email: user.email } });
};

export const me = async (req, res) => {
  res.json(req.user);
};
