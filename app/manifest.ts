import type { MetadataRoute } from "next";

/**
 * Wires up the icons that were already sitting in public/assets/favicon but
 * that nothing referenced — `site.webmanifest` shipped in the repo and was
 * never linked.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "RW Grading Estimates",
        short_name: "RW Grading Estimates",
        description:
            "Prepare a customer estimate in the browser and download a PDF.",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#4F46E5",
        icons: [
            {
                src: "/assets/favicon/android-chrome-192x192.png",
                sizes: "192x192",
                type: "image/png",
            },
            {
                src: "/assets/favicon/android-chrome-512x512.png",
                sizes: "512x512",
                type: "image/png",
            },
            {
                src: "/assets/favicon/apple-touch-icon.png",
                sizes: "180x180",
                type: "image/png",
                purpose: "maskable",
            },
        ],
    };
}
