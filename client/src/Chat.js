import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import "./styles/chat.css";

function Chat() {
  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [file, setFile] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [active, setActive] = useState(null);
  const socketRef = useRef(null);
  const username = useRef(localStorage.getItem("username") || "anonymous");
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const [calling, setCalling] = useState(false);
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const SOCKET_URL = (process.env.REACT_APP_SOCKET_URL || `http://${host}:5000`);

  useEffect(() => {
    axios
      .get("/api/conversations", { params: { me: username.current } })
      .then((r) => setContacts(Array.isArray(r.data) ? r.data : []))
      .catch(() => setContacts([]));
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      endCall();
    };
  }, []);

  const joinRoom = (selected) => {
    const contact = selected?.username || selected;
    const nextRoom = normalizeRoom(username.current, contact || room);
    if (!nextRoom.trim()) return;
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { transports: ["websocket"] });
      socketRef.current.on("load_messages", (msgs) => setMessages(msgs || []));
      socketRef.current.on("receive_message", (msg) => {
        setMessages((prev) => [...prev, msg]);
        if (msg.receiver === username.current && active?.username === msg.sender) {
          socketRef.current.emit("message_delivered", { id: msg._id, room });
          if (document.hasFocus()) {
            setTimeout(() => {
              socketRef.current.emit("message_seen", { ids: [msg._id], room });
            }, 400);
          }
        }
      });
      socketRef.current.on("status_update", ({ id, status }) => {
        setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, status } : m)));
      });
      socketRef.current.on("status_bulk_update", ({ ids, status }) => {
        const setIds = new Set(ids.map(String));
        setMessages((prev) => prev.map((m) => (setIds.has(String(m._id)) ? { ...m, status } : m)));
      });
      socketRef.current.on("call_offer", async (data) => {
        if (!active || data.from === username.current) return;
        await handleIncomingOffer(data);
      });
      socketRef.current.on("call_answer", async (data) => {
        if (pcRef.current) await pcRef.current.setRemoteDescription(data.sdp);
      });
      socketRef.current.on("ice_candidate", async (data) => {
        try {
          if (pcRef.current && data.candidate) await pcRef.current.addIceCandidate(data.candidate);
        } catch {}
      });
      socketRef.current.on("end_call", () => {
        endCall();
      });
    }
    socketRef.current.emit("join_room", nextRoom);
    setRoom(nextRoom);
    setJoined(true);
  };

  const sendMessage = async () => {
    if (!joined || !room) return;
    if (!input.trim() && !file) return;

    const payload = {
      sender: username.current,
      message: input,
      room,
      type: file ? "file" : "text",
      receiver: active?.username || "",
    };

    if (file) {
      const base64 = await toBase64(file);
      payload.fileName = file.name;
      payload.fileType = file.type;
      payload.fileData = base64;
    }

    socketRef.current.emit("send_message", payload);
    setInput("");
    setFile(null);
  };

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });

  const normalizeRoom = (a, b) => {
    const pair = [String(a).toLowerCase(), String(b).toLowerCase()].sort();
    return `dm:${pair[0]}:${pair[1]}`;
  };

  const startCall = async (kind) => {
    try {
      const constraints = { audio: true, video: kind === "video" };
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current.emit("ice_candidate", { candidate: e.candidate, room });
        }
      };
      pc.ontrack = (e) => {
        const stream = e.streams && e.streams[0];
        if (remoteStreamRef.current && stream) {
          remoteStreamRef.current.srcObject = stream;
        }
      };
      const local = await navigator.mediaDevices.getUserMedia(constraints);
      if (localStreamRef.current) localStreamRef.current.srcObject = local;
      local.getTracks().forEach((t) => pc.addTrack(t, local));
      pcRef.current = pc;
      setCalling(true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit("call_offer", { sdp: offer, room, from: username.current, type: kind });
    } catch {}
  };

  const handleIncomingOffer = async (data) => {
    try {
      const constraints = { audio: true, video: data.type === "video" };
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current.emit("ice_candidate", { candidate: e.candidate, room });
        }
      };
      pc.ontrack = (e) => {
        const stream = e.streams && e.streams[0];
        if (remoteStreamRef.current && stream) {
          remoteStreamRef.current.srcObject = stream;
        }
      };
      const local = await navigator.mediaDevices.getUserMedia(constraints);
      if (localStreamRef.current) localStreamRef.current.srcObject = local;
      local.getTracks().forEach((t) => pc.addTrack(t, local));
      pcRef.current = pc;
      setCalling(true);
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit("call_answer", { sdp: answer, room });
    } catch {}
  };

  const endCall = () => {
    try {
      if (pcRef.current) {
        pcRef.current.getSenders().forEach((s) => {
          try { s.track && s.track.stop && s.track.stop(); } catch {}
        });
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localStreamRef.current && localStreamRef.current.srcObject) {
        const tracks = localStreamRef.current.srcObject.getTracks();
        tracks.forEach((t) => t.stop());
        localStreamRef.current.srcObject = null;
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current.srcObject = null;
      }
      setCalling(false);
      if (socketRef.current && room) socketRef.current.emit("end_call", { room });
    } catch {}
  };

  return (
    <div className="chat-container">
      <div className="join-chat">
        <div className="join-header">
          <div className="join-avatar">💬</div>
          <div>
            <div className="join-title">Chats</div>
            <div className="join-subtitle">Select a conversation</div>
          </div>
        </div>

        <h2>Chats</h2>
        <div>
          {contacts.map((c) => (
            <div
              key={c.username}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 10,
                background: active?.username === c.username ? "#202c33" : "transparent",
                cursor: "pointer",
                marginBottom: 6,
              }}
              onClick={() => {
                setActive(c);
                setMessages([]);
                joinRoom(c);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="join-avatar" style={{ width: 30, height: 30, fontSize: 16 }}>
                  {c.username?.[0]?.toUpperCase() || "U"}
                </div>
                <div className={active?.username === c.username ? "conversation-name-unread" : ""}>
                  {c.username}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#8696a0" }}>
                {c.lastType === "file" ? (c.lastFileName || "File") : (c.lastMessage || "")}
              </div>
            </div>
          ))}
        </div>
        <h2 style={{ marginTop: 16 }}>Search</h2>
        <SearchUser me={username.current} onPick={(u) => { setActive({ username: u }); setMessages([]); joinRoom(u); }} />
      </div>

      <div className="chat-box">
        <div className="chat-header">
          <div className="chat-header-content">
            <div className="chat-header-avatar">👥</div>
            <div>
              <div className="chat-header-text-primary">
                {active ? active.username : "Select a chat"}
              </div>
              <div className="chat-header-text-secondary">
                {messages.length} messages
              </div>
            </div>
          </div>
          <div className="chat-header-actions">
            <button
              className="icon-button"
              title="Voice call"
              disabled={!active}
              onClick={() => startCall("audio")}
            >
              ☎
            </button>
            <button
              className="icon-button"
              title="Video call"
              disabled={!active}
              onClick={() => startCall("video")}
            >
              🎥
            </button>
          </div>
        </div>

        <div className="chat-body">
          {messages.map((m) => {
            const isOwn = m.sender === username.current;
            if (m.type === "file" && m.fileData) {
              return (
                <div key={m._id || Math.random()} className={`message ${isOwn ? "own" : ""}`}>
                  <div style={{ fontSize: 12, color: "#8696a0" }}>{m.sender}</div>
                  <div style={{ marginTop: 4 }}>
                    <a href={m.fileData} download={m.fileName} style={{ color: "#25d366" }}>
                      {m.fileName || "Download file"}
                    </a>
                  </div>
                </div>
              );
            }
            return (
              <div key={m._id || Math.random()} className={`message ${isOwn ? "own" : ""}`}>
                <div style={{ fontSize: 12, color: "#8696a0" }}>{m.sender}</div>
                <span style={{ display: "inline-block", marginTop: 4 }}>{m.message}</span>
                {isOwn && (
                  <span className="message-status" style={{ marginLeft: 6 }}>
                    {renderStatus(m)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="chat-footer">
          <label className="file-input-label" title="Attach file">
            ⤓
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <input
            placeholder={joined ? "Type a message" : "Join a room to chat"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!joined}
          />
          <button onClick={sendMessage} disabled={!joined}>
            ➤
          </button>
        </div>
        {calling && (
          <div className="call-overlay">
            <div className="call-videos">
              <video
                ref={(el) => (remoteStreamRef.current = el)}
                className="remote-video"
                autoPlay
                playsInline
              />
              <video
                ref={(el) => (localStreamRef.current = el)}
                className="local-video"
                autoPlay
                playsInline
                muted
              />
            </div>
            <div className="call-controls">
              <button className="end-call-button" onClick={endCall}>End Call</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;

function renderStatus(m) {
  const s = m.status || "sent";
  if (s === "seen") return <span style={{ color: "#25d366" }}>✓✓</span>;
  if (s === "delivered") return <span style={{ color: "#8696a0" }}>✓✓</span>;
  return <span style={{ color: "#8696a0" }}>✓</span>;
}

function SearchUser({ me, onPick }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      const query = q.trim();
      if (!query) return setResults([]);
      axios
        .get("/api/users", { params: { q: query, me } })
        .then((r) => setResults(Array.isArray(r.data) ? r.data : []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, me]);
  return (
    <div>
      <input placeholder="Search username" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ marginTop: 8 }}>
        {results.map((u) => (
          <div
            key={u.username}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 10,
              cursor: "pointer",
            }}
            onClick={() => onPick(u.username)}
          >
            <div className="join-avatar" style={{ width: 28, height: 28, fontSize: 14 }}>
              {u.username?.[0]?.toUpperCase() || "U"}
            </div>
            <div>{u.username}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
