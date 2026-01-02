#!/bin/sh

python organize-footnotes.py leharim-et-haperurim.md leharim-et-haperurim-sources.md
dos2unix article_output.md
cat -s article_output.md > article_output_squeezed.md
mv article_output_squeezed.md article_output.md
unix2dos article_output.md
