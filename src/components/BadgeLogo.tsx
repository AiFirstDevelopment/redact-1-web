export function BadgeLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 110"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Shield shape */}
      <path
        d="M50 5 Q50 15 65 18 Q85 22 95 20 L95 55 Q95 95 50 105 Q5 95 5 55 L5 20 Q15 22 35 18 Q50 15 50 5 Z"
        fill="#22C55E"
        stroke="#16A34A"
        strokeWidth="2"
      />
      {/* R-1 text */}
      <text
        x="50"
        y="65"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#2563EB"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="28"
        fontWeight="bold"
      >
        R-1
      </text>
    </svg>
  );
}
