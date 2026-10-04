import { ImageResponse } from "next/og";

// iOS home-screen icon. It cannot be the SVG (Safari pins a monochrome version and
// ignores the gradient), so it is generated as a rounded-navy tile with the brand
// mark in amber — the same geometry as the adaptive SVG favicon.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1b2a5e 0%, #0b1020 100%)",
        }}
      >
        <div
          style={{
            fontSize: 104,
            fontWeight: 900,
            color: "#fcd34d",
            fontFamily: "serif",
            lineHeight: 1,
          }}
        >
          N
        </div>
      </div>
    ),
    { ...size },
  );
}
