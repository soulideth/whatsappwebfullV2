import React, { useEffect, useRef } from 'react';

const ContextMenu = ({ x, y, options, onClose }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div 
      ref={menuRef}
      className="context-menu" 
      style={{ top: y, left: x }}
    >
      {options.map((option, index) => (
        <div 
          key={index} 
          className="context-menu-item" 
          onClick={() => {
            option.action();
            onClose();
          }}
        >
          <i className={option.icon}></i>
          <span>{option.label}</span>
        </div>
      ))}
    </div>
  );
};

export default ContextMenu;
