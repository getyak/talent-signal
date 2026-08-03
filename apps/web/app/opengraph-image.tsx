import { ImageResponse } from "next/og";

export const alt =
  "Talent Signal. Candidate momentum for relationship-led search.";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#f2f1ed",
          color: "#171715",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "66px 74px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            fontSize: 26,
            fontWeight: 700,
            gap: 16,
          }}
        >
          <div
            style={{
              alignItems: "flex-end",
              background: "#171715",
              borderRadius: 11,
              display: "flex",
              gap: 4,
              height: 40,
              padding: 9,
              width: 40,
            }}
          >
            <span
              style={{
                background: "#f2f1ed",
                borderRadius: 4,
                height: 9,
                width: 5,
              }}
            />
            <span
              style={{
                background: "#f2f1ed",
                borderRadius: 4,
                height: 22,
                width: 5,
              }}
            />
            <span
              style={{
                background: "#d84a35",
                borderRadius: 4,
                height: 15,
                width: 5,
              }}
            />
          </div>
          Talent Signal
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            maxWidth: 900,
          }}
        >
          <div
            style={{
              fontSize: 82,
              fontWeight: 650,
              letterSpacing: "-4px",
              lineHeight: 0.98,
            }}
          >
            Know who needs you now.
          </div>
          <div style={{ color: "#585650", fontSize: 28, lineHeight: 1.4 }}>
            Evidence-backed candidate momentum for relationship-led search.
          </div>
        </div>

        <div
          style={{
            background: "#d84a35",
            borderRadius: 99,
            bottom: 70,
            height: 19,
            position: "absolute",
            right: 74,
            width: 190,
          }}
        />
      </div>
    ),
    size,
  );
}
