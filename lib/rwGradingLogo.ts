/** Public letterhead already shipped in the repo. Browser-only. */
export const RW_GRADING_LOGO_PATH = "/assets/img/rw-grading-logo.png";

export async function rwGradingLogoDataUrl(): Promise<string> {
    const response = await fetch(RW_GRADING_LOGO_PATH);
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
