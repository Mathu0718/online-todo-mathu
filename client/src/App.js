import React, { useEffect, useState } from 'react';
import './App.css';
import TodoDashboard from './components/TodoDashboard';

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if user is authenticated
    fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/auth/user`, {
      credentials: 'include',
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data._id) setUser(data);
      });
  }, []);

  const handleGoogleSignIn = () => {
    window.location.href = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/auth/google`;
  };

  const handleLogout = () => {
    fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/auth/logout`, {
      credentials: 'include',
    }).then(() => window.location.reload());
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-calm1">
        <div className="bg-white/80 rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-calm5 mb-4 text-center">Multi-User To-Do App</h1>
          <p className="text-calm5 text-center mb-6">Organize, collaborate, and stay notified in a calm, modern workspace.</p>
          <button
            className="w-full py-2 px-4 rounded-lg bg-calm3 text-calm5 font-semibold hover:bg-calm2 transition mb-2"
            onClick={handleGoogleSignIn}
          >
            Sign in with Google
          </button>
          <div className="mt-6 text-center text-calm5 text-xs opacity-70">
            &copy; {new Date().getFullYear()} Calm To-Do
          </div>
        </div>
      </div>
    );
  }

  // Render the TodoDashboard component if the user is logged in
  return <TodoDashboard user={user} onLogout={handleLogout} />;
}

export default App;
