"use client";

interface LogoProps {
  variant?: "auto" | "light" | "dark";
  showWordmark?: boolean;
  size?: number;
  onClick?: () => void;
}

export function TyreLogo({
  variant = "auto",
  showWordmark = true,
  size = 28,
  onClick,
}: LogoProps) {
  const wordmarkColor =
    variant === "light"
      ? "#FFFFFF"
      : variant === "dark"
      ? "#181410"
      : "currentColor";

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2.5 group"
      aria-label="TYRE home"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="transition-transform duration-300 group-hover:rotate-90"
      >
        <defs>
          <linearGradient
            id="tyreLogoGrad"
            x1="0"
            y1="0"
            x2="32"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#8FE03A" />
            <stop offset="0.55" stopColor="#FF6A2B" />
            <stop offset="1" stopColor="#FFB74D" />
          </linearGradient>
        </defs>
        <circle
          cx="16"
          cy="16"
          r="13.5"
          stroke="url(#tyreLogoGrad)"
          strokeWidth="3.5"
          fill="none"
        />
        <circle cx="16" cy="16" r="5" fill="url(#tyreLogoGrad)" />
      </svg>
      {showWordmark && (
        <span
          className="text-[19px] font-extrabold tracking-[-0.04em]"
          style={{ color: wordmarkColor }}
        >
          TYRE
        </span>
      )}
    </button>
  );
}
