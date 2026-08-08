import React from 'react';
import { theme } from '../theme';

/** Marca d'água persistente, sobreposta a toda a composição. */
export const Watermark: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: 'absolute',
      bottom: 70,
      width: '100%',
      textAlign: 'center',
      fontFamily: theme.body,
      fontSize: 34,
      fontWeight: 700,
      letterSpacing: 2,
      color: 'rgba(255,255,255,0.72)',
      textShadow: '0 2px 12px rgba(0,0,0,0.9)',
      pointerEvents: 'none',
    }}
  >
    {text}
  </div>
);
