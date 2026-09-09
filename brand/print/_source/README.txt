Business card print files
=========================

CLPPS-card-<name>-BOTH-SIDES.pdf   <- send this one to the printer
CLPPS-card-<name>-front.pdf        }  same artwork, split, if they ask
CLPPS-card-<name>-back.pdf         }
CLPPS-card-<name>-*-600dpi.png     <- raster version, if they want images
CLPPS-card-<name>-PROOF-with-guides.png  <- shows the trim and safe area

Finished size 3.5 x 2 inches. Files are 3.75 x 2.25 inches because they
include the standard 0.125 inch bleed on all four sides. Page 1 of the
combined PDF is the details side, page 2 is the green logo side.

Colours are RGB: #0E4B3B deep green, #1D8A68 accent green. Ask the printer
to convert to CMYK and to send a proof before the full run.

make-cards.js regenerates everything. See the notes at the top of it.
