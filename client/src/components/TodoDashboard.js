import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import InAppNotifications from './InAppNotifications';

const PRIORITIES = ['Low', 'Medium', 'High'];
const STATUSES = ['In Progress', 'Completed', 'Timed Out'];

export default function TodoDashboard({ user, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'Low',
    status: 'In Progress',
    collaborators: '', // comma-separated emails
  });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false); // NEW STATE
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [collaboratorFields, setCollaboratorFields] = useState([]); // [{email, canEdit}]
  const socketRef = useRef(null);
  const tableRef = useRef(null);
  const createFormRef = useRef(null);

  // Fetch tasks
  const fetchTasks = () => {
    fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/tasks`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(setTasks);
  };

  useEffect(() => {
    fetchTasks();
    // Setup socket.io
    socketRef.current = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
      withCredentials: true
    });
    socketRef.current.emit('join', user._id);
    socketRef.current.on('task-updated', () => {
      fetchTasks();
    });
    // Listen for real-time task deletion
    socketRef.current.on('task-deleted', ({ taskId }) => {
      setTasks(tasks => tasks.filter(t => t._id !== taskId));
    });
    return () => {
      socketRef.current.disconnect();
    };
  }, [user._id]);

  // Handle form input
  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Handle collaborator field changes
  const handleCollaboratorChange = (idx, field, value) => {
    setCollaboratorFields(fields => fields.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  // Add a new collaborator field
  const addCollaboratorField = () => {
    setCollaboratorFields(fields => [...fields, { email: '', canEdit: false }]);
  };

  // Remove a collaborator field
  const removeCollaboratorField = idx => {
    setCollaboratorFields(fields => fields.filter((_, i) => i !== idx));
  };

  // Create or update task
  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    // Only owner can manage collaborators
    let collaborators = [];
    if (collaboratorFields.length) {
      // Validate emails
      const emails = collaboratorFields.map(c => c.email.trim()).filter(Boolean);
      if (emails.length !== collaboratorFields.length) {
        setError('Please enter all collaborator emails.');
        return;
      }
      // Fetch user IDs for emails
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/users/by-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ emails })
      });
      const data = await res.json();
      if (!Array.isArray(data) || data.length !== emails.length) {
        setError('Some collaborator emails are invalid.');
        return;
      }
      // Map canEdit to user IDs
      collaborators = collaboratorFields.map((c, i) => ({ user: data[i]._id, canEdit: c.canEdit }));
    }
    // Prevent sending undefined collaborators if field is empty
    let payload = {
      ...form
    };
    // Remove dueDate if empty string
    if (!payload.dueDate) {
      delete payload.dueDate;
    }
    // Only owner can send collaborators field
    const task = editingId ? tasks.find(t => t._id === editingId) : null;
    const isOwner = task ? (task.owner?.email === user.email) : true;
    if (isOwner) {
      payload.collaborators = collaborators;
    } else {
      // If user is a collaborator, do not send collaborators field at all
      delete payload.collaborators;
    }
    const url = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/tasks${editingId ? `/${editingId}` : ''}`;
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      let msg = `Failed to save task (HTTP ${res.status})`;
      try {
        const err = await res.json();
        if (err && err.errors) {
          msg = err.errors.map(e => e.msg).join(', ');
        } else if (err && err.message) {
          // Custom message for forbidden
          if (res.status === 403 && err.message === 'Forbidden') {
            msg = 'You are not allowed to edit this task.';
          } else {
            msg = err.message;
          }
        }
      } catch (e) {
        // If not JSON, show raw text
        try {
          const text = await res.text();
          if (text) msg += `: ${text}`;
        } catch {}
      }
      setError(msg);
      return;
    }
    setForm({ title: '', description: '', dueDate: '', priority: 'Low', status: 'In Progress', collaborators: '' });
    setCollaboratorFields([]);
    setEditingId(null);
    setShowCreate(false); // HIDE FORM AFTER ADD/UPDATE
    // Notify collaborators in real-time
    const updatedTask = await res.json();
    socketRef.current.emit('task-updated', updatedTask);
    fetchTasks();
    // Scroll back to table after update
    setTimeout(() => {
      if (tableRef.current) {
        tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  // Edit task
  const handleEdit = task => {
    setEditingId(task._id);
    setForm({
      title: task.title,
      description: task.description,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      priority: task.priority,
      status: task.status,
      collaborators: '', // not used anymore
    });
    setCollaboratorFields(
      (task.collaborators || [])
        .filter(c => c.user && c.user.email && c.user.email !== user.email)
        .map(c => ({ email: c.user.email, canEdit: c.canEdit || false }))
    );
    setShowCreate(true);
    // Scroll to create form after a short delay
    setTimeout(() => {
      if (createFormRef.current) {
        createFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  // Delete task
  const handleDelete = async id => {
    await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/tasks/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    socketRef.current.emit('task-updated', { owner: user._id, collaborators: [] });
    setTasks(tasks.filter(t => t._id !== id));
  };

  return (
    <>
      <InAppNotifications user={user} />
      <div className="space-y-8 relative">
        {/* User Logo in Top Right */}
        <div className="fixed top-4 right-4 z-50 flex flex-col items-end">
          <button
            className="w-12 h-12 rounded-full bg-calm3 text-calm5 font-bold text-xl flex items-center justify-center shadow hover:bg-calm2 focus:outline-none border-2 border-calm5"
            onClick={() => setShowProfileMenu(v => !v)}
            style={{ transition: 'background 0.2s' }}
            aria-label="User menu"
            type="button"
          >
            {user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()}
          </button>
          {showProfileMenu && (
            <div className="mt-2 bg-white rounded-lg shadow-lg p-4 z-50 min-w-[200px] border border-calm3">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-calm5">Profile</span>
                <button className="text-calm5 hover:text-red-500 text-lg font-bold" onClick={() => setShowProfileMenu(false)} aria-label="Close">&times;</button>
              </div>
              <div className="mb-1"><span className="font-semibold">Name:</span> {user.name}</div>
              <div className="mb-3"><span className="font-semibold">Email:</span> {user.email}</div>
              <button onClick={onLogout} className="w-full py-1 rounded bg-calm2 text-calm5 font-semibold hover:bg-calm3 transition">Logout</button>
            </div>
          )}
        </div>
        {/* Dashboard Title */}
        <div className="flex flex-col items-center justify-center">
          <h2 className="text-4xl font-bold text-calm5 text-center">
            {user.name ? `${user.name.split(' ')[0]}'s To-Do Dashboard` : 'To-Do Dashboard'}
          </h2>
        </div>
        {/* Create Mission Button (should be above the table heading) */}
        {!showCreate && (
          <button
            className="block mx-auto mb-4 px-8 py-4 rounded bg-calm3 text-calm5 font-semibold hover:bg-calm2 transition text-[1.25rem]"
            onClick={() => {
              setShowCreate(true);
              setEditingId(null);
              setForm({ title: '', description: '', dueDate: '', priority: 'Low', status: 'In Progress', collaborators: '' });
              setCollaboratorFields([]);
            }}
          >
            Create Mission
          </button>
        )}
        {/* Show Create Mission Form when showCreate is true */}
        {showCreate && (
          <div className="flex justify-center w-full" ref={createFormRef}>
            <form
              onSubmit={handleSubmit}
              className="bg-white/90 rounded-xl shadow p-4 space-y-4 relative w-full max-w-2xl"
              style={{ minWidth: '0' }}
              key={editingId || 'create'} // This will force remount/clear on edit/create toggle
            >
              <button
                type="button"
                className="absolute top-2 right-2 text-calm5 hover:text-red-500 text-xl font-bold focus:outline-none"
                onClick={() => { setShowCreate(false); setEditingId(null); setCollaboratorFields([]); }}
                aria-label="Close"
              >
                &times;
              </button>
              <h3 className="text-lg font-bold text-calm5 mb-2">{editingId ? 'Edit Mission' : 'Create Mission'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input name="title" value={form.title} onChange={handleChange} required placeholder="Task Name" className="p-2 rounded border" />
                <input name="dueDate" value={form.dueDate} onChange={handleChange} type="date" className="p-2 rounded border" required />
              </div>
              <textarea name="description" value={form.description} onChange={handleChange} placeholder="Description" className="p-2 rounded border w-full" />
              <div className="flex gap-4">
                <select name="priority" value={form.priority} onChange={handleChange} className="p-2 rounded border" required>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
                <select name="status" value={form.status} onChange={handleChange} className="p-2 rounded border">
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              {/* Collaborator management, only for owner */}
              {(!editingId || (tasks.find(t => t._id === editingId)?.owner?.email === user.email)) && (
                <div className="space-y-2">
                  <div className="font-semibold text-calm5">Collaborators</div>
                  {collaboratorFields.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="email"
                        placeholder="Collaborator Email"
                        value={c.email}
                        onChange={e => handleCollaboratorChange(idx, 'email', e.target.value)}
                        className="p-2 rounded border flex-1"
                        required
                      />
                      <label className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={c.canEdit}
                          onChange={e => handleCollaboratorChange(idx, 'canEdit', e.target.checked)}
                        />
                        Allow Edit
                      </label>
                      <button type="button" onClick={() => removeCollaboratorField(idx)} className="text-red-500 font-bold text-lg">&times;</button>
                    </div>
                  ))}
                  <button type="button" onClick={addCollaboratorField} className="px-3 py-1 rounded bg-calm2 text-calm5 font-semibold hover:bg-calm3 transition text-sm">Add Collaborator</button>
                </div>
              )}
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <button className="w-full py-2 rounded bg-calm3 text-calm5 font-semibold hover:bg-calm2 transition">
                {editingId ? 'Update Task' : 'Add Task'}
              </button>
            </form>
          </div>
        )}
        {/* Table Heading: half the dashboard title size (text-2xl) */}
        <div className="flex justify-center w-full" ref={tableRef}>
          <div className="space-y-4 w-full max-w-2xl mx-auto" style={{minWidth: '0'}}>
            <h3 className="text-2xl font-bold text-calm5 mb-2">List of Missions</h3>
            {tasks.length === 0 && <div className="text-calm5 text-center text-xs">No tasks yet.</div>}
            {tasks.map(task => (
              <div key={task._id} className="bg-white/80 rounded-lg shadow p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="font-bold text-calm5 text-base">{task.title}</div>
                  {/* Show description if present */}
                  {task.description && (
                    <div className="text-calm5 text-sm mb-1 whitespace-pre-line">{task.description}</div>
                  )}
                  {/* Due date and overdue logic */}
                  <div className="text-calm5 text-sm">{/* was text-xs, now text-sm */
                    `Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'}`
                  }</div>
                  {task.dueDate && new Date(task.dueDate) < new Date() && (
                    <span className="ml-2 font-semibold text-[#c0392b] text-sm">
                      (Overdue by {Math.ceil((new Date() - new Date(task.dueDate)) / (1000 * 60 * 60 * 24))} day{Math.ceil((new Date() - new Date(task.dueDate)) / (1000 * 60 * 60 * 24)) > 1 ? 's' : ''})
                    </span>
                  )}
                  {task.dueDate && new Date(task.dueDate) >= new Date() && (
                    <span className="ml-2 font-semibold text-[#27ae60] text-sm">
                      ({Math.ceil((new Date(task.dueDate) - new Date()) / (1000 * 60 * 60 * 24))} day{Math.ceil((new Date(task.dueDate) - new Date()) / (1000 * 60 * 60 * 24)) > 1 ? 's' : ''} left)
                    </span>
                  )}
                  {/* Status logic: show 'Timed Out' if overdue, with color */}
                  <div className="text-sm mt-1">
                    Priority: <span className="font-semibold">{task.priority}</span> | Status: <span className={(() => {
                      if (task.dueDate && new Date(task.dueDate) < new Date()) return 'font-semibold text-[#c0392b]';
                      if (task.status === 'Completed') return 'font-semibold text-[#27ae60]';
                      if (task.status === 'In Progress') return 'font-semibold text-[#f39c12]';
                      return 'font-semibold text-calm5';
                    })()}>
                      {task.dueDate && new Date(task.dueDate) < new Date() ? 'Timed Out' : task.status}
                    </span>
                  </div>
                  {/* Only show Collaborators if there are any */}
                  {(() => {
                    let collabText = '';
                    if (task.owner && task.owner.email === user.email) {
                      collabText = (task.collaborators || [])
                        .filter(c => c.user && c.user.email !== user.email)
                        .map(c => c.user.email + (c.canEdit ? ' (can edit)' : ''))
                        .join(', ');
                    } else if (task.owner && task.owner.email) {
                      collabText = task.owner.email;
                    }
                    if (collabText) {
                      return (
                        <div className="text-calm5 text-sm mt-1">
                          Collaborators: <span className="font-semibold">{collabText}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="flex flex-row gap-2">
                  <button onClick={() => handleEdit(task)} className="px-1 py-2 rounded bg-calm2 text-calm5 font-semibold hover:bg-calm3 transition text-sm">
                    Edit Mission
                  </button>
                  <button onClick={() => handleDelete(task._id)} className="px-1 py-2 rounded bg-red-500 text-white font-semibold hover:bg-red-400 transition text-sm">
                    Delete Mission
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
