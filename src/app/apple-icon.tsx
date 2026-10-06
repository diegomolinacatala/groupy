import { ImageResponse } from "next/og";

// Home-screen icon for iOS / Android ("Añadir a pantalla de inicio"): the
// same nested block diamond as icon.svg, drawn full-bleed (iOS rounds it).
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
          background: "#1d1c17",
        }}
      >
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 20,
            background: "#4f46e5",
            transform: "rotate(45deg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#f6f4ef",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
