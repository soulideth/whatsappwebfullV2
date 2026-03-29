import React, { useState } from 'react';
import api from '../api/axios';

const LoginPage = ({ onLoginSuccess }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    groupId: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { username, password, groupId } = formData;

  const onChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegistering ? '/auth/register' : '/auth/login';
      const { data } = await api.post(endpoint, formData);

      if (data.status === 'success') {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        onLoginSuccess(data.token, data.user);
      } else {
        setError(data.message || 'Authentication failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" style={styles.container}>
      <div className="login-card" style={styles.card}>
        <div style={styles.header}>
          <i className="fab fa-whatsapp" style={styles.logo}></i>
          <h2 style={styles.title}>WhatsApp Web Clone</h2>
          <p style={styles.subtitle}>{isRegistering ? 'Create your account' : 'Sign in to continue'}</p>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={onSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              name="username"
              value={username}
              onChange={onChange}
              required
              style={styles.input}
              placeholder="Enter your username"
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              name="password"
              value={password}
              onChange={onChange}
              required
              style={styles.input}
              placeholder="Enter your password"
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Group ID {isRegistering ? '(Required)' : '(Optional for login)'}</label>
            <input
              type="text"
              name="groupId"
              value={groupId}
              onChange={onChange}
              required={isRegistering}
              style={styles.input}
              placeholder="e.g. support-team"
            />
          </div>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? <i className="fas fa-spinner fa-spin"></i> : (isRegistering ? 'Register' : 'Login')}
          </button>
        </form>

        <div style={styles.footer}>
          <span>{isRegistering ? 'Already have an account?' : 'Don\'t have an account?'}</span>
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            style={styles.toggleBtn}
          >
            {isRegistering ? 'Login here' : 'Register here'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: '#f0f2f5',
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 9999,
  },
  card: {
    background: '#fff',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
  },
  header: {
    marginBottom: '30px',
  },
  logo: {
    fontSize: '60px',
    color: '#25D366',
    marginBottom: '15px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#111b21',
    marginBottom: '8px',
  },
  subtitle: {
    color: '#667781',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    textAlign: 'left',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#111b21',
  },
  input: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #e9edef',
    outline: 'none',
    fontSize: '15px',
    transition: 'border-color 0.3s',
  },
  button: {
    background: '#00a884',
    color: '#fff',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'background 0.3s',
  },
  error: {
    background: '#fee7e6',
    color: '#f44336',
    padding: '10px',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '20px',
  },
  footer: {
    marginTop: '25px',
    fontSize: '14px',
    color: '#667781',
    display: 'flex',
    justifyContent: 'center',
    gap: '5px',
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: '#00a884',
    fontWeight: '600',
    cursor: 'pointer',
    padding: 0,
    fontSize: '14px',
  }
};

export default LoginPage;
