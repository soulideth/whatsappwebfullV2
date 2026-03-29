import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

const AuthOverlay = ({ qrCode, status }) => {
  return (
    <div id="auth-overlay" className="modal" style={{ display: 'flex', zIndex: 2000 }}>
      <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <header className="modal-header">
          <h3>WhatsApp Login</h3>
        </header>
        <div className="modal-body" style={{ padding: '30px' }}>
          <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
            Open WhatsApp on your phone and scan this code to login.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', background: 'white', padding: '10px', borderRadius: '8px' }}>
            {qrCode ? (
              <QRCodeSVG value={qrCode} size={256} />
            ) : (
              <div style={{ height: 256, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: '40px' }}></i>
              </div>
            )}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--accent-color)' }}>
            <i className={`fas ${qrCode ? 'fa-check-circle' : 'fa-spinner fa-spin'}`}></i> {status}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthOverlay;
