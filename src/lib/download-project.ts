// Preuzimanje cijelog izvornog koda projekta kao ZIP.
// ZIP je pripremljen u public/andromeda-ai.zip pri buildu, a ovdje ga
// dohvaćamo kao blob (direktan <a download> ne radi u Lovable pregledu).

export async function downloadProjectZip(
  fileName = "andromeda-ai.zip",
): Promise<void> {
  const res = await fetch(`/${fileName}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `ZIP nije dostupan (${res.status}). Pokušaj ponovno na objavljenoj verziji aplikacije.`,
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
