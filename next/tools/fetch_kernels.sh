#!/usr/bin/env bash
# Download the NASA NAIF SPICE kernels LUNO's ephemeris build needs (about 45 MB).
set -euo pipefail
cd "$(dirname "$0")/kernels"
B=https://naif.jpl.nasa.gov/pub/naif/generic_kernels
for f in lsk/naif0012.tls pck/pck00011.tpc pck/moon_pa_de440_200625.bpc fk/satellites/moon_de440_250416.tf spk/planets/de440s.bsp; do
  [ -f "$(basename "$f")" ] || curl -sS -O "$B/$f"
done
