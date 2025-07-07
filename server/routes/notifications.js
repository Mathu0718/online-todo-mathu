import express from 'express';
import Notification from '../models/Notification.js';

const router = express.Router();

// Middleware to check authentication
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: 'Unauthorized' });
}

// Get all notifications for the authenticated user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark a notification as read
router.put('/:id/read', isAuthenticated, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Mark all notifications as read
router.put('/read-all', isAuthenticated, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
