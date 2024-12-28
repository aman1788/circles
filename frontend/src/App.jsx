import React, { useState } from "react";
import io from "socket.io-client";
import Chat from "./components/Chat";
import Login from "./components/Login";

const socket = io("https://circles.up.railway.app");

function App() {
  const [currentUser, setCurrentUser] = useState(null);

  const handleLogin = (user) => {
    setCurrentUser(user);
    socket.emit("join", user._id);
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return <Chat socket={socket} currentUser={currentUser} />;
}

export default App;
