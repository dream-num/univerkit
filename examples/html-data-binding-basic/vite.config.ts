import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    define: { "import.meta.env.UNIVER_LICENSE": JSON.stringify(env.UNIVER_LICENSE ?? "") },
    build: { outDir: "dist/web", target: "es2022" },
    ssr: { external: true },
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": "http://127.0.0.1:3030",
        "/universer-api": { target: "http://127.0.0.1:3030", ws: true },
      },
    },
  };
});
