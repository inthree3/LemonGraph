import React from 'react';

type MoatIconProps = {
  size?: number;
  opacity?: number;
  style?: React.CSSProperties;
};

export default function MoatIcon({ size = 24, opacity = 1, style = {} }: MoatIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity, ...style }}>
      {/* root node */}
      <circle cx="12" cy="4" r="2.2" fill="currentColor" />
      {/* mid nodes */}
      <circle cx="5" cy="13" r="2.2" fill="currentColor" />
      <circle cx="19" cy="13" r="2.2" fill="currentColor" />
      {/* leaf nodes */}
      <circle cx="2" cy="21" r="1.6" fill="currentColor" />
      <circle cx="8" cy="21" r="1.6" fill="currentColor" />
      <circle cx="16" cy="21" r="1.6" fill="currentColor" />
      <circle cx="22" cy="21" r="1.6" fill="currentColor" />
      {/* edges root → mid */}
      <line x1="10.3" y1="5.6" x2="6.7" y2="11.4" stroke="currentColor" strokeWidth="1.3" />
      <line x1="13.7" y1="5.6" x2="17.3" y2="11.4" stroke="currentColor" strokeWidth="1.3" />
      {/* edges mid → leaves */}
      <line x1="4.0" y1="15.2" x2="2.5" y2="19.4" stroke="currentColor" strokeWidth="1.1" />
      <line x1="6.0" y1="15.2" x2="7.5" y2="19.4" stroke="currentColor" strokeWidth="1.1" />
      <line x1="18.0" y1="15.2" x2="16.5" y2="19.4" stroke="currentColor" strokeWidth="1.1" />
      <line x1="20.0" y1="15.2" x2="21.5" y2="19.4" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}
