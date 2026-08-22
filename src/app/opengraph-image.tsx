import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "IWANNAPEE public restroom finder";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const logoData = await readFile(
  join(process.cwd(), "public/brand/iwannapee-mark.png"),
  "base64",
);
const logoSrc = `data:image/png;base64,${logoData}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f7f4eb",
          color: "#17231d",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          padding: "72px 88px",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#fffdf7",
            border: "2px solid #dcded5",
            borderRadius: 44,
            display: "flex",
            height: "100%",
            padding: "64px 72px",
            width: "100%",
          }}
        >
          <img alt="" src={logoSrc} style={{ height: 220, width: 220 }} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginLeft: 52,
            }}
          >
            <div style={{ color: "#315fff", display: "flex", fontSize: 72, fontWeight: 900, letterSpacing: -3 }}>
              IWANNAPEE
            </div>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 700, lineHeight: 1.2, marginTop: 12 }}>
              Find public restrooms near you.
            </div>
            <div style={{ color: "#667169", display: "flex", fontSize: 24, marginTop: 20 }}>
              Directions · access details · photos · cleanliness ratings
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
