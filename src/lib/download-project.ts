// Preuzimanje cijelog izvornog koda projekta kao ZIP.
// ZIP je pripremljen u public/andromeda-ai.zip pri buildu, a ovdje ga
// dohvaćamo kao blob (direktan <a download> ne radi u Lovable pregledu).

export async function downloadProjectZip(fileName = "andromeda-ai.zip"): Promise<void> {
  try {
    const res = await fetch(`/${fileName}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (err) {
    const a = document.createElement("a");
    a.href = `/${fileName}`;
    a.download = fileName;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  }
}
