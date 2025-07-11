import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

export default function InAppNotifications({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [show, setShow] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    // Fetch initial notifications
    fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/notifications`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(setNotifications);
    // Listen for real-time notifications
    socketRef.current = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
      withCredentials: true
    });
    socketRef.current.emit('join', user._id);
    socketRef.current.on('notification', (notif) => {
      setNotifications((prev) => [notif, ...prev]);
      setShow(true);
      setTimeout(() => setShow(false), 5000);
    });
    return () => {
      socketRef.current.disconnect();
    };
  }, [user._id]);

  const markAllRead = async () => {
    await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/notifications/read-all`, {
      method: 'PUT',
      credentials: 'include',
    });
    setNotifications([]); // Hide all notifications after marking as read
    setShow(false);
  };

  return (
    <>
      {/* Move notification button below logo, slightly left */}
      <div className="fixed top-20 right-8 z-50">
        {show && notifications[0] && (
          <div className="bg-calm5 text-white px-4 py-3 rounded shadow-lg animate-bounce">
            <div className="font-bold">{notifications[0].type.replace(/\b\w/g, l => l.toUpperCase())}</div>
            <div>{notifications[0].message}</div>
          </div>
        )}
        {notifications.length > 0 && (
          <button onClick={markAllRead} className="mt-2 px-3 py-1 bg-calm2 text-calm5 rounded hover:bg-calm3 text-xs">Mark all as read</button>
        )}
      </div>
    </>
  );
}
