export function BadgeLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 110"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Shield shape */}
      <path
        d="M50 5 L95 20 L95 55 Q95 95 50 105 Q5 95 5 55 L5 20 Z"
        fill="#3B82F6"
        stroke="#2563EB"
        strokeWidth="2"
      />
      {/* R-1 text */}
      <text
        x="50"
        y="65"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#FACC15"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="28"
        fontWeight="bold"
      >
        R-1
      </text>
    </svg>
  );
}
