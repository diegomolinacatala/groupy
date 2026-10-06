import type { MetadataRoute } from "next";

// Lets phones add Groupy to the home screen and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Groupy — Trabajo en grupo",
    short_name: "Groupy",
    description:
      "El trabajo en grupo, repartido y a la vista: tareas, bloques y un mapa compartido por código.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#f6f4ef",
    lang: "es",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
