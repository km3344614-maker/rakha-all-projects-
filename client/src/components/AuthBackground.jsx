import { memo } from 'react';
import LiquidEther from './LiquidEther';

// Sleek dark monochrome fluid colors (pure black, deep charcoal, subtle silver glow)
const DARK_LIQUID_COLORS = ['#050505', '#141414', '#2a2a2a'];

function AuthBackground() {
  return (
    <div className="auth-shader-bg" aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: '#070709' }}>
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: '#070709',
          zIndex: 1,
          pointerEvents: 'none',
        }} 
      />
      <LiquidEther
        colors={DARK_LIQUID_COLORS}
        mouseForce={28}
        cursorSize={350}
        resolution={0.45}
        isViscous
        viscous={20}
        iterationsViscous={14}
        iterationsPoisson={16}
        dt={0.014}
        BFECC={false}
        autoDemo
        autoSpeed={0.55}
        autoIntensity={2.2}
        autoResumeDelay={250}
        autoRampDuration={0.6}
        takeoverDuration={0.2}
      />
    </div>
  );
}

export default memo(AuthBackground);

