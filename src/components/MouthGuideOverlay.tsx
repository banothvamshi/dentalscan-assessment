// MouthGuideOverlay renders an animated SVG ellipse that transitions color based on stability.
// Memoized to avoid re-renders when parent state (e.g., isCapturing) changes without affecting this component.
import React from "react";

interface Props {
  stabilityScore: number;
}

const getColor = (score: number): string => {
  if (score < 40) return "#ef4444";
  if (score < 80) return "#f59e0b";
  return "#22c55e";
};

const getStatusText = (score: number): { text: string; color: string } => {
  if (score < 40) return { text: "Hold still...", color: "text-red-500" };
  if (score < 80) return { text: "Almost...", color: "text-amber-500" };
  return { text: "Ready ✓", color: "text-green-500" };
};

const MouthGuideOverlay = React.memo(function MouthGuideOverlay({ stabilityScore }: Props) {
  const status = getStatusText(stabilityScore);
  const color = getColor(stabilityScore);

  const outerRx = 38; // percentage of viewBox width
  const outerRy = 42; // percentage of viewBox height
  const innerRx = outerRx * 0.65;
  const innerRy = outerRy * 0.62;
  const cornerFraction = 0.12; // corner markers at 12% from edges
  const cornerR = 2.5;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
      {/* Pill badge — announces stability state changes to screen readers */}
      <div
        className={`mb-4 px-4 py-1.5 rounded-full text-sm font-medium bg-zinc-900/80 backdrop-blur-sm border transition-colors duration-300 ${status.color}`}
        role="status"
        aria-live="polite"
      >
        {status.text}
      </div>

      {/* Animated mouth ellipse — scales with the container using percentage viewBox */}
      <svg
        viewBox="0 0 100 140"
        className="w-[90%] sm:w-[70%] md:w-[55%] max-w-[380px] animate-pulse-slow"
        style={{
          filter: `drop-shadow(0 0 8px ${color}60)`,
        }}
        role="img"
        aria-label="Mouth framing guide — position your mouth within the oval"
      >
        {/* Outer lips outline */}
        <ellipse
          cx="50"
          cy="70"
          rx={outerRx}
          ry={outerRy}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="4 2"
          className="transition-all duration-500"
        />
        {/* Inner mouth */}
        <ellipse
          cx="50"
          cy="75"
          rx={innerRx}
          ry={innerRy}
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity="0.5"
          className="transition-all duration-500"
        />
        {/* Corner markers — positioned as fraction of outer ellipse bounds */}
        <circle cx={50 - outerRx + outerRx * cornerFraction} cy="70" r={cornerR} fill={color} opacity="0.9" />
        <circle cx={50 + outerRx - outerRx * cornerFraction} cy="70" r={cornerR} fill={color} opacity="0.9" />
      </svg>
    </div>
  );
});

export default MouthGuideOverlay;
