import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../state/settingsStore';

interface GlowElement {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  speedX: number;
  speedY: number;
}

export function SpotlightBackground() {
  const { settings } = useSettingsStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [glowElements, setGlowElements] = useState<GlowElement[]>([]);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!settings.useSpotlightBackground) return;

    const colors = [
      '#FF1744', '#00E676', '#00B0FF', '#FFD600', '#E040FB', '#FF6E40',
      '#00E5FF', '#FF4081', '#76FF03', '#FF3D00', '#7C4DFF', '#00C853'
    ];

    const elements = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: Math.random() * 120 - 10,
      y: Math.random() * 120 - 10,
      color: colors[i % colors.length],
      size: 15 + Math.random() * 25,
      speedX: (Math.random() - 0.5) * 0.35, // Reduced from 0.5 to 0.35 (30% slower)
      speedY: (Math.random() - 0.5) * 0.35  // Reduced from 0.5 to 0.35 (30% slower)
    }));
    
    setGlowElements(elements);
  }, [settings.useSpotlightBackground]);

  useEffect(() => {
    if (!settings.useSpotlightBackground) return;

    const interval = setInterval(() => {
      setGlowElements(prev => prev.map(element => {
        let newX = element.x + element.speedX;
        let newY = element.y + element.speedY;
        let newSpeedX = element.speedX;
        let newSpeedY = element.speedY;
        
        // Bounce off edges
        if (newX <= -15 || newX >= 115) {
          newSpeedX = -newSpeedX;
          newX = newX <= -15 ? -15 : 115;
        }
        if (newY <= -15 || newY >= 115) {
          newSpeedY = -newSpeedY;
          newY = newY <= -15 ? -15 : 115;
        }
        
        // Occasionally change direction
        if (Math.random() < 0.02) {
          newSpeedX += (Math.random() - 0.5) * 0.14; // Reduced from 0.2 to 0.14 (30% slower)
          newSpeedY += (Math.random() - 0.5) * 0.14; // Reduced from 0.2 to 0.14 (30% slower)
          // Limit speed
          newSpeedX = Math.max(-0.7, Math.min(0.7, newSpeedX)); // Reduced from 1 to 0.7 (30% slower)
          newSpeedY = Math.max(-0.7, Math.min(0.7, newSpeedY)); // Reduced from 1 to 0.7 (30% slower)
        }
        
        return {
          ...element,
          x: newX,
          y: newY,
          speedX: newSpeedX,
          speedY: newSpeedY
        };
      }));
    }, 30);

    return () => clearInterval(interval);
  }, [settings.useSpotlightBackground]);

  useEffect(() => {
    if (!settings.useSpotlightBackground) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, [settings.useSpotlightBackground]);

  if (!settings.useSpotlightBackground) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className="spotlight-background"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden'
      }}
    >
      {/* Random moving glow elements */}
      {glowElements.map(element => (
        <div
          key={element.id}
          className="spotlight-glow animated-glow"
          style={{
            position: 'absolute',
            left: `${element.x}%`,
            top: `${element.y}%`,
            background: element.color,
            width: `${element.size}vw`,
            height: `${element.size}vw`,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            filter: 'blur(80px)',
            opacity: 0.15
          }}
        />
      ))}
      
      {/* Cursor-following glow */}
      <div
        className="spotlight-glow cursor-glow"
        style={{
          position: 'absolute',
          left: `${mousePosition.x}px`,
          top: `${mousePosition.y}px`,
          width: '300px',
          height: '300px',
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 23, 68, 0.08) 0%, transparent 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none'
        }}
      />
    </div>
  );
}
