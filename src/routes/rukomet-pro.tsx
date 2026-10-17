import { createFileRoute } from "@tanstack/react-router";
import { CircleDot } from "lucide-react";
import { SportProStranica } from "@/components/SportProStranica";

export const Route = createFileRoute("/rukomet-pro")({
  head: () => ({
    meta: [
      { title: "Rukomet Pro · tipovi 1X2 i zbroj golova" },
      { name: "description", content: "Rukometni tipovi po utakmici: 1X2, ukupno golova, golovi domaćina i gosta više/manje." },
      { property: "og:title", content: "Rukomet Pro · tipovi 1X2 i zbroj golova" },
      { property: "og:description", content: "Konkretni rukometni tipovi s vjerojatnošću, fer kvotom i edgeom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SportProStranica
      sport="rukomet"
      kartica="Rukomet Pro"
      naslov="Rukomet Pro"
      podnaslov="1 X 2 · ukupno golova više/manje · golovi domaćina · golovi gosta"
      ikona={<CircleDot className="h-6 w-6 text-orange-400" />}
    />
  ),
});
