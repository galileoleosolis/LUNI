#!/usr/bin/env bash
# Download the LOLA elevation maps LUNO's terrain build needs (about 620 MB) from the NASA PDS Geosciences Node.
set -euo pipefail
mkdir -p "$(dirname "$0")/dem" && cd "$(dirname "$0")/dem"
B=https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr
for f in polar/img/ldem_60s_240m cylindrical/img/ldem_16 polar/img/ldem_80s_40m; do
  for ext in lbl img; do [ -f "$(basename "$f").$ext" ] || curl -sS -O "$B/$f.$ext"; done
done
