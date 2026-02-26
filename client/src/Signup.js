import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./styles/auth.css";

function Signup() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSignup = async () => {
    try {
      await axios.post("/api/auth/signup", {
        username,
        password,
      });
      alert("Signup Successful. You can login now.");
      navigate("/login");
    } catch (err) {
      alert(err?.response?.data || "Signup failed");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">💬</div>
          <div>
            <div className="auth-title">Create your account</div>
            <div className="auth-subtitle">
              Pick a unique username to start chatting.
            </div>
          </div>
        </div>

        <div className="auth-form">
          <div>
            <div className="auth-label">Username</div>
            <input
              className="auth-input"
              placeholder="e.g. john_doe"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <div className="auth-label">Password</div>
            <input
              className="auth-input"
              type="password"
              placeholder="Create a password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className="auth-button" onClick={handleSignup}>
            Create account
          </button>
        </div>

        <div className="auth-footer">
          Already have an account?{" "}
          <span className="auth-link" onClick={() => navigate("/login")}>
            Login
          </span>
        </div>
      </div>
    </div>
  );
}

export default Signup;