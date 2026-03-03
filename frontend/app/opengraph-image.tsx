import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Signalze | Monitor HN, Dev.to, and GitHub Discussions"
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
          background: "linear-gradient(135deg, #f7f6f3 0%, #ece9de 100%)",
          color: "#1f1f1f",
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "#1f1f1f",
              color: "#d6ff3f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            s
          </div>
          Signalze
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 70, lineHeight: 1.05, fontWeight: 800, maxWidth: 920 }}>
            Never miss the conversations that matter
          </div>
          <div style={{ fontSize: 32, color: "#444", maxWidth: 940 }}>
            Monitor Hacker News, Dev.to, and GitHub Discussions for your brand and keywords.
          </div>
        </div>
      </div>
    ),
    size,
  )
}
