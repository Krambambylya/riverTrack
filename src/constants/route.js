// constants/route.js
import * as turf from "@turf/turf";

export const riverRoute = {
  type: "Feature",
  properties: {
    name: "Ахтуба (Ленинск — Стасов)",
    totalDistance: 0,
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [45.216732, 48.680324], // Старт (Ленинск)
      [45.208641, 48.670152],
      [45.199871, 48.659812],
      [45.1961, 48.6495], // плавный поворот
      [45.1925, 48.6401],
      [45.1899, 48.63],
      [45.186, 48.62],
      [45.1825, 48.61],
      [45.179442, 48.603462], // Финиш (Стасов)
    ],
  },
};

const line = turf.lineString(riverRoute.geometry.coordinates);
riverRoute.properties.totalDistance = turf.length(line, {
  units: "kilometers",
});
