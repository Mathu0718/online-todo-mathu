import express from 'express';
import mongoose from 'mongoose';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { sendNotificationEmail } from '../utils/email.js';
import { apiLimiter, createTaskLimiter } from '../rateLimit.js';
import { taskValidationRules } from '../validation.js';
import { validationResult } from 'express-validator';

const router = express.Router();

// Middleware to check authentication
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: 'Unauthorized' });
}

// Get all tasks for the authenticated user (owned or shared)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const tasks = await Task.find({
      $or: [
        { owner: req.user._id },
        { 'collaborators.user': req.user._id }
      ]
    }).populate('owner collaborators.user', 'name email avatar');
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new task
router.post('/', isAuthenticated, taskValidationRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { title, description, priority, dueDate, collaborators } = req.body;
    // Only allow owner to set collaborators
    const formattedCollaborators = Array.isArray(collaborators)
      ? collaborators.map(c => ({
          user: c.user || c, // fallback for old format
          canEdit: !!c.canEdit
        }))
      : [];
    const task = new Task({
      title,
      description,
      priority,
      dueDate,
      owner: req.user._id,
      collaborators: formattedCollaborators
    });
    await task.save();
    // Notify collaborators
    if (formattedCollaborators.length > 0) {
      const users = await User.find({ _id: { $in: formattedCollaborators.map(c => c.user) } });
      await Promise.all(users.map(async (user) => {
        const creator = await User.findById(req.user._id);
        const notification = await Notification.create({
          user: user._id,
          type: 'assignment',
          message: `You have been assigned to the task: ${title} by ${creator?.name || 'someone'}.`,
          task: task._id
        });
        if (user.email) {
          await sendNotificationEmail(
            user.email,
            'New Task Assignment',
            `You have been assigned to the task: ${title} by ${creator?.name || 'someone'}.`
          );
        }
        if (req.io) req.io.to(user._id.toString()).emit('notification', notification);
      }));
    }
    // Real-time notification for all involved (owner + collaborators)
    if (req.io) {
      const allUserIds = [task.owner.toString(), ...formattedCollaborators.map(c => c.user.toString())];
      allUserIds.forEach(id => {
        req.io.to(id).emit('notification', {
          type: 'info',
          message: `Task '${title}' was created.`,
          task: task._id
        });
      });
    }
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a task
router.put('/:id', isAuthenticated, taskValidationRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    // Only owner or collaborator with canEdit can update
    const isOwner = task.owner.equals(req.user._id);
    const isEditableCollaborator = task.collaborators.some(c => c.user.equals(req.user._id) && c.canEdit);
    if (!isOwner && !isEditableCollaborator) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    // Only owner can change collaborators
    if ('collaborators' in req.body && !isOwner) {
      return res.status(403).json({ message: 'Only the owner can modify collaborators' });
    }
    const prevStatus = task.status;
    // If collaborators are being updated, format them
    if ('collaborators' in req.body) {
      req.body.collaborators = Array.isArray(req.body.collaborators)
        ? req.body.collaborators.map(c => ({
            user: c.user || c,
            canEdit: !!c.canEdit
          }))
        : [];
    }
    // Track removed collaborators
    let removedCollaboratorIds = [];
    if ('collaborators' in req.body) {
      const prevIds = (task.collaborators || []).map(c => c.user.toString());
      const newIds = req.body.collaborators.map(c => c.user.toString());
      removedCollaboratorIds = prevIds.filter(id => !newIds.includes(id));
    }
    Object.assign(task, req.body);
    await task.save();
    // Notify collaborators and owner on status change
    if (req.body.status && req.body.status !== prevStatus) {
      const notifyUsers = [task.owner, ...task.collaborators.map(c => c.user)].filter(
        (id, idx, arr) => id && arr.indexOf(id) === idx
      );
      const users = await User.find({ _id: { $in: notifyUsers } });
      await Promise.all(users.map(async (user) => {
        const notification = await Notification.create({
          user: user._id,
          type: 'status',
          message: `Task '${task.title}' status updated to ${task.status}`,
          task: task._id
        });
        if (user.email) {
          await sendNotificationEmail(
            user.email,
            'Task Status Updated',
            `Task '${task.title}' status updated to ${task.status}`
          );
        }
        if (req.io) req.io.to(user._id.toString()).emit('notification', notification);
      }));
    }
    // Notify new collaborators if any were added
    if (req.body.collaborators && Array.isArray(req.body.collaborators)) {
      // Find which collaborators are new
      const prevIds = (task.collaborators || []).map(c => c.user.toString());
      const newIds = req.body.collaborators.map(c => c.user.toString());
      const addedIds = newIds.filter(id => !prevIds.includes(id));
      if (addedIds.length > 0) {
        const users = await User.find({ _id: { $in: addedIds } });
        const creator = await User.findById(req.user._id);
        await Promise.all(users.map(async (user) => {
          const notification = await Notification.create({
            user: user._id,
            type: 'assignment',
            message: `You have been assigned to the task: ${task.title} by ${creator?.name || 'someone'}.`,
            task: task._id
          });
          if (user.email) {
            await sendNotificationEmail(
              user.email,
              'New Task Assignment',
              `You have been assigned to the task: ${task.title} by ${creator?.name || 'someone'}.`
            );
          }
          if (req.io) req.io.to(user._id.toString()).emit('notification', notification);
        }));
      }
    }
    // Remove task from removed collaborators' lists (they won't see it anymore)
    if (removedCollaboratorIds.length > 0) {
      // No action needed, since tasks are filtered by collaborators in GET
      // Optionally, send notification to removed users
      const users = await User.find({ _id: { $in: removedCollaboratorIds } });
      await Promise.all(users.map(async (user) => {
        const notification = await Notification.create({
          user: user._id,
          type: 'info',
          message: `You have been removed from the task: ${task.title}`,
          task: task._id
        });
        if (user.email) {
          await sendNotificationEmail(
            user.email,
            'Removed from Task',
            `You have been removed from the task: ${task.title}`
          );
        }
        if (req.io) req.io.to(user._id.toString()).emit('notification', notification);
      }));
    }
    // Real-time notification for all involved (owner + collaborators) on edit
    if (req.io) {
      const allUserIds = [task.owner.toString(), ...task.collaborators.map(c => c.user.toString())];
      allUserIds.forEach(id => {
        req.io.to(id).emit('notification', {
          type: 'info',
          message: `Task '${task.title}' was edited.`,
          task: task._id
        });
      });
    }
    res.json(task);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a task
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (!task.owner.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the owner can delete this task' });
    }
    // Collect all collaborator user IDs before deleting
    const collaboratorIds = (task.collaborators || []).map(c => c.user ? c.user.toString() : c.toString());
    const ownerId = task.owner.toString();
    await task.deleteOne();
    // Notify all collaborators and owner in real-time that the task was deleted
    if (req.io) {
      [ownerId, ...collaboratorIds].forEach(id => {
        if (id) req.io.to(id).emit('task-deleted', { taskId: req.params.id });
      });
      // Real-time notification for all involved
      [ownerId, ...collaboratorIds].forEach(id => {
        if (id) req.io.to(id).emit('notification', {
          type: 'info',
          message: `Task '${task.title}' was deleted.`,
          task: req.params.id
        });
      });
    }
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
