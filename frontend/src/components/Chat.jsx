// Chat.jsx
import React, { useState, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";

function Chat({ socket, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [userLastMessages, setUserLastMessages] = useState({});
  const [chatPartner, setChatPartner] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [userStatuses, setUserStatuses] = useState({});
  const typingTimeoutRef = useRef();
  const messagesEndRef = useRef();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch all users and their statuses
  useEffect(() => {
    fetch("https://circles.up.railway.app/users")
      .then((res) => res.json())
      .then((users) => {
        const otherUsers = users.filter((user) => user._id !== currentUser._id);
        setAllUsers(otherUsers);

        // Initialize status object
        const statuses = {};
        otherUsers.forEach((user) => {
          statuses[user._id] = {
            online: user.status === "online",
            lastSeen: user.lastSeen,
          };
        });
        setUserStatuses(statuses);
      });
  }, [currentUser._id]);

  // Fetch chat history
  useEffect(() => {
    if (chatPartner) {
      fetch(
        `https://circles.up.railway.app/messages/${currentUser._id}/${chatPartner}`
      )
        .then((res) => res.json())
        .then((history) => {
          setMessages(history);
          scrollToBottom();
        });
    }
  }, [chatPartner, currentUser._id]);

  // Socket event listeners
  useEffect(() => {
    socket.on("receive-message", (message) => {
      setMessages((prev) => {
        // Check if this message already exists (real ID from the server)
        const isDuplicate = prev.some((m) => m._id === message._id);
        if (isDuplicate) {
          return prev; // Avoid duplicates
        }

        // Check for and replace optimistic message
        const optimisticMessageIndex = prev.findIndex(
          (m) =>
            m.sender === message.sender &&
            m.receiver === message.receiver &&
            m.content === message.content &&
            m._id.toString().startsWith("temp") // Match temporary ID
        );

        if (optimisticMessageIndex !== -1) {
          const updatedMessages = [...prev];
          updatedMessages[optimisticMessageIndex] = message; // Replace with server version
          return updatedMessages;
        }

        // Add the message if no optimistic match is found
        return [...prev, message];
      });
    });

    socket.on("message-status-update", ({ messageId, status }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, status } : msg))
      );
    });

    socket.on("user-status-change", ({ userId, status, lastSeen }) => {
      setUserStatuses((prev) => ({
        ...prev,
        [userId]: { online: status === "online", lastSeen },
      }));
    });

    socket.on("typing-start", ({ userId }) => {
      if (userId === chatPartner) {
        setIsTyping(true);
      }
    });

    socket.on("typing-stop", ({ userId }) => {
      if (userId === chatPartner) {
        setIsTyping(false);
      }
    });

    return () => {
      socket.off("receive-message");
      socket.off("message-status-update");
      socket.off("user-status-change");
      socket.off("typing-start");
      socket.off("typing-stop");
    };
  }, [socket, chatPartner]);

  useEffect(() => {
    const fetchLastMessages = async () => {
      const lastMessages = {};

      for (const user of allUsers) {
        try {
          const response = await fetch(
            `https://circles.up.railway.app/messages/${currentUser._id}/${user._id}`
          );
          const messages = await response.json();
          if (messages.length > 0) {
            lastMessages[user._id] = messages[messages.length - 1].timestamp;
          } else {
            lastMessages[user._id] = new Date(0); // Default for no messages
          }
        } catch (error) {
          console.error("Error fetching messages:", error);
        }
      }

      setUserLastMessages(lastMessages);
    };

    if (allUsers.length > 0) {
      fetchLastMessages();
    }
  }, [allUsers, currentUser._id]);

  // Handle typing indicator
  const handleTyping = () => {
    socket.emit("typing-start", { receiver: chatPartner });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing-stop", { receiver: chatPartner });
    }, 1000);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatPartner) return;

    const tempId = `temp-${Date.now()}`; // Temporary ID for optimistic message
    const messageData = {
      _id: tempId,
      sender: currentUser._id,
      receiver: chatPartner,
      content: newMessage,
      timestamp: new Date(),
      status: "sent",
    };

    // Optimistically add the message
    setMessages((prev) => [...prev, messageData]);

    // Emit the message to the server
    socket.emit("send-message", { ...messageData, _id: undefined }); // Let the server generate a real ID

    setNewMessage("");
    scrollToBottom();
  };

  const formatLastSeen = (date) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };

  // Modify the users list to sort by last message
  const sortedUsers = [...allUsers].sort((a, b) => {
    const timeA = userLastMessages[a._id] || 0;
    const timeB = userLastMessages[b._id] || 0;
    return new Date(timeB) - new Date(timeA);
  });

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r flex flex-col">
        {/* User profile header */}
        <div className="p-4 border-b bg-gradient-to-r from-purple-600 to-indigo-600">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-semibold">
              {currentUser.username[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-white">
                {currentUser.username}
              </h2>
              <p className="text-xs text-purple-200">Active Now</p>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="p-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search users..."
              className="w-full px-4 py-2 bg-gray-50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>
        </div>

        {/* Users list */}
        <div className="flex-1 overflow-y-auto">
          {sortedUsers.map((user) => (
            <button
              key={user._id}
              onClick={() => setChatPartner(user._id)}
              className={`w-full p-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors ${
                chatPartner === user._id ? "bg-purple-50" : ""
              }`}
            >
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                  {user.username[0].toUpperCase()}
                </div>
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                    userStatuses[user._id]?.online
                      ? "bg-green-500"
                      : "bg-gray-400"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium truncate">{user.username}</h3>
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(
                      new Date(user.lastSeen || Date.now()),
                      {
                        addSuffix: true,
                      }
                    )}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {chatPartner ? (
          <>
            {/* Chat header */}
            <div className="h-16 bg-white border-b flex items-center px-4 justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                  {allUsers
                    .find((u) => u._id === chatPartner)
                    ?.username[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-medium">
                    {allUsers.find((u) => u._id === chatPartner)?.username}
                  </h3>
                  {isTyping ? (
                    <p className="text-xs text-purple-500">typing...</p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      {userStatuses[chatPartner]?.online
                        ? "Active Now"
                        : "Offline"}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
              <div className="max-w-2xl mx-auto space-y-4">
                {messages.map((message) => (
                  <div
                    key={message._id}
                    className={`flex ${
                      message.sender === currentUser._id
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex max-w-[70%] ${
                        message.sender === currentUser._id
                          ? "flex-row-reverse"
                          : "flex-row"
                      }`}
                    >
                      {message.sender !== currentUser._id && (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-semibold mr-2">
                          {allUsers
                            .find((u) => u._id === message.sender)
                            ?.username[0].toUpperCase()}
                        </div>
                      )}
                      <div
                        className={`flex flex-col ${
                          message.sender === currentUser._id
                            ? "items-end"
                            : "items-start"
                        }`}
                      >
                        <div
                          className={`px-4 py-2 rounded-2xl ${
                            message.sender === currentUser._id
                              ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                              : "bg-white text-gray-800"
                          } shadow-sm`}
                        >
                          {message.content}
                        </div>
                        <div className="flex items-center space-x-1 mt-1 text-xs text-gray-400">
                          <span>
                            {message.createdAt
                              ? new Date(message.createdAt).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )
                              : "Invalid Date"}
                          </span>
                          {message.sender === currentUser._id && (
                            <span className="ml-1">
                              {message.status === "sent" && "✓"}
                              {message.status === "delivered" && "✓✓"}
                              {message.status === "read" && (
                                <span className="text-purple-500">✓✓</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Message input */}
            <div className="bg-white border-t p-4">
              <div className="max-w-2xl mx-auto">
                <form
                  onSubmit={sendMessage}
                  className="flex items-center space-x-4 bg-gray-50 rounded-lg p-2"
                >
                  <button
                    type="button"
                    className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                  >
                    <svg
                      className="w-6 h-6 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                  </button>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                    }}
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent px-4 py-2 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-full transition-colors"
                  >
                    <svg
                      className="w-6 h-6 text-white transform rotate-90"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">
                No chat selected
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Choose a conversation to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;
