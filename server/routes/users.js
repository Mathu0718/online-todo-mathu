import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// Get users by email array
router.post('/by-emails', async (req, res) => {
  const { emails } = req.body;
  if (!Array.isArray(emails)) return res.status(400).json([]);
  const users = await User.find({ email: { $in: emails } });
  res.json(users);
});

export default router;
