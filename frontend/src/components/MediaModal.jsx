import React, { useEffect } from 'react';

const MediaModal = ({ isOpen, onClose, media }) => {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !media) return null;

  const src = `data:${media.mimetype};base64,${media.data}`;

  const handleDownload = (e) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = src;
    link.download = media.filename || (media.mimetype.startsWith('image/') ? 'whatsapp-image.png' : 'whatsapp-video.mp4');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="media-modal-overlay" onClick={onClose}>
      <div className="media-modal-header">
        <div className="media-info">
          <span className="media-name">{media.filename || 'Media'}</span>
        </div>
        <div className="media-actions">
          <button className="media-action-btn" onClick={handleDownload} title="Download">
            <i className="fas fa-download"></i>
          </button>
          <button className="media-action-btn" onClick={onClose} title="Close">
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
        {media.mimetype.startsWith('image/') ? (
          <img src={src} alt="Full screen" className="full-media" />
        ) : (
          <video src={src} controls autoPlay className="full-media" />
        )}
      </div>
    </div>
  );
};

export default MediaModal;
