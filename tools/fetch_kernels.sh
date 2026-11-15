#!/usr/bin/env bash
# Download the NASA NAIF SPICE kernels LUNI's ephemeris build needs (about 45 MB).
set -euo pipefail
cd "$(dirname "$0")/kernels"
B=https://naif.jpl.nasa.gov/pub/naif/generic_kernels
for f in lsk/naif0012.tls pck/pck00011.tpc pck/moon_pa_de440_200625.bpc fk/satellites/moon_de440_250416.tf spk/planets/de440s.bsp; do
  [ -f "$(basename "$f")" ] || curl -sS -O "$B/$f"
done
# For tools/build_dsn.py (which Deep Space Network sites have the Moon in their sky): station positions and
# Earth's orientation, 1962 to 2126 (measured, then predicted). About 31 MB more.
for f in spk/stations/earthstns_itrf93_260814.bsp spk/stations/earthstns_itrf93_260814.cmt pck/earth_1962_260806_2126_combined.bpc; do
  [ -f "$(basename "$f")" ] || curl -sS -O "$B/$f"
done
