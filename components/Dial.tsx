import React, { useState, useRef, useEffect } from 'react';
import { SCORING_ZONES, DIAL_MIN_DEG, DIAL_MAX_DEG } from '../constants';

interface DialProps {
  targetPercent: number;
  currentPercent: number;
  onChange?: (percent: number) => void;
  isInteractive: boolean;
  showTarget: boolean;
}

const Dial: React.FC<DialProps> = ({
  targetPercent,
  currentPercent,
  onChange,
  isInteractive,
  showTarget,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert percentage (0-100) to degrees (-90 to 90)
  const percentToDeg = (p: number) => (p / 100) * (DIAL_MAX_DEG - DIAL_MIN_DEG) + DIAL_MIN_DEG;
  
  // Convert degrees to coordinate on a circle radius R
  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  const updateFromEvent = (clientX: number, clientY: number) => {
    if (!svgRef.current || !onChange) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const bottomY = rect.height; // The pivot is at the bottom center
    
    // Calculate angle relative to bottom center
    const dx = clientX - (rect.left + centerX);
    const dy = clientY - (rect.top + bottomY);
    
    // Atan2 returns angle from X axis. We need to adjust for our SVG coordinate system
    // -90 (left) to 90 (right) is our desired range relative to "up".
    let angleRad = Math.atan2(dy, dx); 
    let angleDeg = angleRad * (180 / Math.PI);
    
    // Adjust mapping: atan2(0, -1) is -180/180. 
    // We want straight up (0,-1) to be 0deg. 
    // Left (-1, 0) to be -90. Right (1, 0) to be 90.
    
    let valueDeg = angleDeg + 90; // Shift so up is 0
    
    // Clamp
    if (valueDeg < DIAL_MIN_DEG) valueDeg = DIAL_MIN_DEG;
    if (valueDeg > DIAL_MAX_DEG) valueDeg = DIAL_MAX_DEG;
    
    // Convert back to percent
    const percent = ((valueDeg - DIAL_MIN_DEG) / (DIAL_MAX_DEG - DIAL_MIN_DEG)) * 100;
    onChange(percent);
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isInteractive) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    updateFromEvent(clientX, clientY);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !isInteractive) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    updateFromEvent(clientX, clientY);
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchend', handleEnd);
      window.addEventListener('mousemove', handleMove as any);
      window.addEventListener('touchmove', handleMove as any);
    } else {
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('mousemove', handleMove as any);
      window.removeEventListener('touchmove', handleMove as any);
    }
    return () => {
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('mousemove', handleMove as any);
      window.removeEventListener('touchmove', handleMove as any);
    };
  }, [isDragging]);

  // Render Scoring Zones
  const renderZone = (zonePoints: number, widthPercent: number, colorClass: string) => {
    if (!showTarget) return null;
    
    // Width in degrees
    const widthDeg = (widthPercent / 100) * 180; // 180 is total span
    // Center in degrees
    const centerDeg = percentToDeg(targetPercent);
    
    const startDeg = centerDeg - (widthDeg / 2);
    const endDeg = centerDeg + (widthDeg / 2);

    // SVG Arc logic
    const radius = 140; // Inner radius of the zone band
    const cx = 200;
    const cy = 200;
    
    // Ensure within bounds
    const clampedStart = Math.max(DIAL_MIN_DEG, startDeg);
    const clampedEnd = Math.min(DIAL_MAX_DEG, endDeg);
    
    if (clampedStart >= clampedEnd) return null;

    const start = polarToCartesian(cx, cy, radius, clampedStart);
    const end = polarToCartesian(cx, cy, radius, clampedEnd);
    
    const largeArcFlag = widthDeg <= 180 ? "0" : "1";

    // Creating a wedge shape
    const d = [
      "M", cx, cy,
      "L", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y,
      "Z"
    ].join(" ");

    return <path key={zonePoints} d={d} className={`${colorClass} opacity-90`} />;
  };

  const needleDeg = percentToDeg(currentPercent);

  return (
    <div className="relative w-full max-w-[400px] aspect-[2/1] mx-auto select-none">
      <svg 
        ref={svgRef}
        viewBox="0 0 400 220" 
        className="w-full h-full overflow-visible"
        onMouseDown={handleStart}
        onTouchStart={handleStart}
      >
        {/* Background Arc */}
        <path 
          d="M 20 200 A 180 180 0 0 1 380 200 L 340 200 A 140 140 0 0 0 60 200 Z" 
          className="fill-zinc-800" 
        />

        {/* Target Zones (Largest to Smallest overlay) */}
        {showTarget && (
          <g className="transition-opacity duration-700 ease-in-out">
             {/* 2 points zone */}
             {renderZone(2, 22, SCORING_ZONES[2].color)}
             {/* 3 points zone */}
             {renderZone(3, 12, SCORING_ZONES[1].color)}
             {/* 4 points zone */}
             {renderZone(4, 4, SCORING_ZONES[0].color)}
          </g>
        )}
        
        {/* Target Hider (The "Screen" that opens) - Simplified visual representation */}
        {!showTarget && (
           <path 
           d="M 20 200 A 180 180 0 0 1 380 200 L 200 200 Z" 
           className="fill-zinc-700 opacity-20 pointer-events-none" 
         />
        )}

        {/* Needle */}
        <g 
          style={{ 
            transformOrigin: '200px 200px', 
            transform: `rotate(${needleDeg}deg)`,
            transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' 
          }}
          className="pointer-events-none"
        >
          <line x1="200" y1="200" x2="200" y2="30" className="stroke-red-500 stroke-[4px]" strokeLinecap="round" />
          <circle cx="200" cy="200" r="10" className="fill-zinc-200" />
          <circle cx="200" cy="30" r="8" className="fill-red-500" />
        </g>
      </svg>
    </div>
  );
};

export default Dial;