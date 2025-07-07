import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['assignment', 'status', 'invitation', 'deadline'], required: true },
  message: { type: String, required: true },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
