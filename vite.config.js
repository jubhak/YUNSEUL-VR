import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      // CORS / User-Agent 이슈 시 브라우저 → 로컬 프록시 → Overpass
      "/api/overpass": {
        target: "https://overpass-api.de",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/overpass/, "/api/interpreter"),
        headers: {
          "User-Agent": "YUNSEUL-VR/1.0 (https://github.com/local/yunseul-vr)",
        },
      },
    },
  },
});
