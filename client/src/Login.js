import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./styles/auth.css";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await axios.post("/api/auth/login", {
        username,
        password,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("username", res.data.user.username);
      alert("Login Successful");
      navigate("/chat");
    } catch (err) {
      alert(err?.response?.data || "Login failed");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">💬</div>
          <div>
            <div className="auth-title">Welcome back</div>
            <div className="auth-subtitle">
              Login with your username to continue.
            </div>
          </div>
        </div>

        <div className="auth-form">
          <div>
            <div className="auth-label">Username</div>
            <input
              className="auth-input"
              placeholder="Your username"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <div className="auth-label">Password</div>
            <input
              className="auth-input"
              type="password"
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className="auth-button" onClick={handleLogin}>
            Login
          </button>
        </div>

        <div className="auth-footer">
          New here?{" "}
          <span className="auth-link" onClick={() => navigate("/signup")}>
            Create an account
          </span>
        </div>
      </div>
    </div>
  );
}

export default Login;