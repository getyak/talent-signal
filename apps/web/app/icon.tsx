import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f4f1e9",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <svg
          height="23"
          viewBox="0 0 64 64"
          width="23"
        >
          <path
            d="M38 10.5c-4.3-2.1-9.2-2.8-14-1.6C12.1 11.8 5.7 24.2 9.9 35.6c3.8 10.2 14.8 15.8 25.2 12.9"
            fill="none"
            stroke="#171715"
            strokeLinecap="round"
            strokeWidth="6"
          />
          <path
            d="M43.8 15.6c7.4 6.1 8.6 17 2.7 24.5"
            fill="none"
            stroke="#d5533d"
            strokeLinecap="round"
            strokeWidth="6"
          />
        </svg>
      </div>
    ),
    size,
  );
}
