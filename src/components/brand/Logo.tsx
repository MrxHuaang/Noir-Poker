type Props = {
  size?: number;
  className?: string;
  withText?: boolean;
};

export function Logo({ size = 28, className = "", withText = false }: Props) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Noir"
      >
        <defs>
          <linearGradient id="nr-grad-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#17171b" />
            <stop offset="100%" stopColor="#050506" />
          </linearGradient>
          <linearGradient id="nr-grad-mark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f6f6f8" />
            <stop offset="100%" stopColor="#c2c2cb" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill="url(#nr-grad-bg)" />
        <rect
          x="0.75"
          y="0.75"
          width="46.5"
          height="46.5"
          rx="11.25"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.08"
          strokeWidth="1.5"
        />
        <path
          d="M24 9.5s-11 8.4-11 16.2c0 4.2 3.2 6.6 6.6 5.9-.6 2.9-2.3 4.7-4.1 5.9h17c-1.8-1.2-3.5-3-4.1-5.9 3.4.7 6.6-1.7 6.6-5.9C35 17.9 24 9.5 24 9.5Z"
          fill="url(#nr-grad-mark)"
        />
        <path
          d="M11 30.5c4.2-2.4 7.4 2.2 11.6.2 4.2-2 7.2 1.8 9.4.2"
          stroke="#e0b15e"
          strokeWidth="2.1"
          fill="none"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>
      {withText ? (
        <span className="font-semibold tracking-tight text-zinc-100">
          Noir
        </span>
      ) : null}
    </div>
  );
}
