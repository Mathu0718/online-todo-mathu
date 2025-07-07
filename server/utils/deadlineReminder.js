import mongoose from 'mongoose';
import Task from '../models/Task.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendNotificationEmail } from './email.js';

export async function sendDeadlineReminders(io) {
  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
  // Find tasks due in the next hour and not completed/timed out
  const tasks = await Task.find({
    dueDate: { $gte: now, $lte: soon },
    status: { $in: ['In Progress'] }
  });
  for (const task of tasks) {
    const users = await User.find({ _id: { $in: [task.owner, ...task.collaborators] } });
    for (const user of users) {
      const notification = await Notification.create({
        user: user._id,
        type: 'deadline',
        message: `Task '${task.title}' is due soon!`,
        task: task._id
      });
      if (user.email) {
        await sendNotificationEmail(
          user.email,
          'Task Deadline Reminder',
          `Task '${task.title}' is due soon!`
        );
      }
      if (io) io.to(user._id.toString()).emit('notification', notification);
    }
  }
}
