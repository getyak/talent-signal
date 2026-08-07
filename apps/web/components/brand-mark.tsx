import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <Link className="brand" href="/" aria-label="Talent Signal home">
      <svg
        className="brand__mark"
        aria-hidden="true"
        viewBox="0 0 64 64"
      >
        <path
          d="M38 10.5c-4.3-2.1-9.2-2.8-14-1.6C12.1 11.8 5.7 24.2 9.9 35.6c3.8 10.2 14.8 15.8 25.2 12.9"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="5.5"
        />
        <path
          className="brand__signal"
          d="M43.8 15.6c7.4 6.1 8.6 17 2.7 24.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="5.5"
        />
      </svg>
      {!compact && <span className="brand__name">Talent Signal</span>}
    </Link>
  );
}
