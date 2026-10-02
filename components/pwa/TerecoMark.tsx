/** The app icon artwork, rendered to PNG by ImageResponse (app/pwa-icons, app/apple-icon.tsx). */
export function TerecoMark({ size, mark }: { size: number; mark: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#02465B",
        color: "#FFFFFF",
        fontSize: size * mark,
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      T
    </div>
  );
}
