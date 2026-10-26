import { createFileRoute } from "@tanstack/react-router";
import { Dribbble } from "lucide-react";
import { SportProStranica } from "@/components/SportProStranica";

export const Route = createFileRoute("/kosarka-pro")({
  head: () => ({
    meta: [
      { title: "Košarka Pro · tipovi 1X2 i zbroj poena" },
      {
        name: "description",
        content:
          "Košarkaški tipovi po utakmici: pobjednik, ukupno poena s produžecima, poeni domaćina i gosta više/manje.",
      },
      { property: "og:title", content: "Košarka Pro · tipovi 1X2 i zbroj poena" },
      {
        property: "og:description",
        content: "Konkretni košarkaški tipovi s vjerojatnošću, fer kvotom i edgeom.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SportProStranica
      sport="kosarka"
      kartica="Košarka Pro"
      naslov="Košarka Pro"
      podnaslov="1 X 2 · ukupno poena (uklj. produžetke) · poeni domaćina · poeni gosta"
      ikona={<Dribbble className="h-6 w-6 text-orange-400" />}
    />
  ),
});
