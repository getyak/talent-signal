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
          background: "#171715",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "flex-end",
            display: "flex",
            gap: 3,
            height: 17,
          }}
        >
          <span
            style={{
              background: "#f2f1ed",
              borderRadius: 5,
              height: 8,
              width: 4,
            }}
          />
          <span
            style={{
              background: "#f2f1ed",
              borderRadius: 5,
              height: 17,
              width: 4,
            }}
          />
          <span
            style={{
              background: "#d84a35",
              borderRadius: 5,
              height: 12,
              width: 4,
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
