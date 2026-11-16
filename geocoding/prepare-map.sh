#!/bin/sh
set -eu
cd /maps
if [ -s cdo-bukidnon.osm.pbf ]; then
  echo 'Regional extract already exists. Keeping it.'
  exit 0
fi
if [ ! -s philippines.osm.pbf ]; then
  curl --fail --location --retry 3 --output philippines.part 'https://download.geofabrik.de/asia/philippines-latest.osm.pbf'
  osmium fileinfo philippines.part -F pbf >/dev/null
  mv philippines.part philippines.osm.pbf
fi
# Complete boundary relations as well as multipolygons, so city/province names
# survive the crop. These can include geometry beyond the buffered rectangle.
osmium extract --bbox 123.8,7.0,126.0,9.1 --strategy smart \
  -S types=multipolygon,boundary philippines.osm.pbf \
  --output regional.part.pbf --overwrite
osmium fileinfo regional.part.pbf >/dev/null
mv regional.part.pbf cdo-bukidnon.osm.pbf
ls -lh cdo-bukidnon.osm.pbf
echo 'Regional extract prepared. Source retained for reproducibility.'
