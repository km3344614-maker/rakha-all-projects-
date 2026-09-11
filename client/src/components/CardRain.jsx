import { useEffect, useRef, memo } from 'react';

function CardRain() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resize = () => {
      if (!canvas || !canvas.parentElement) return;
      canvas.width = canvas.parentElement.offsetWidth;
      canvas.height = canvas.parentElement.offsetHeight;
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) {
      ro.observe(canvas.parentElement);
    }

    const dropCount = 45;
    const drops = [];

    for (let i = 0; i < dropCount; i++) {
      drops.push({
        x: Math.random() * (canvas.width || 380),
        y: Math.random() * (canvas.height || 600),
        length: Math.random() * 16 + 10,
        speed: Math.random() * 6 + 9,
        opacity: Math.random() * 0.4 + 0.15,
        wind: (Math.random() - 0.5) * 0.6
      });
    }

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${d.opacity})`;
        ctx.lineWidth = 1.1;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.wind * 2, d.y + d.length);
        ctx.stroke();

        d.y += d.speed;
        d.x += d.wind;

        if (d.y > h) {
          d.y = -d.length;
          d.x = Math.random() * w;
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      ro.disconnect();
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        borderRadius: 'inherit'
      }}
    />
  );
}

export default memo(CardRain);
