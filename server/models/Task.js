import mongoose from 'mongoose';

const collaboratorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  canEdit: { type: Boolean, default: false }
}, { _id: false });

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
  status: { type: String, enum: ['In Progress', 'Completed', 'Timed Out'], default: 'In Progress' },
  dueDate: { type: Date },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  collaborators: [collaboratorSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);
export default Task;
