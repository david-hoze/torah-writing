#!/bin/sh

orig="leharim-et-haperurim.md"
origSrc="leharim-et-haperurim-sources.md"
organized="article_output.md"

python organize-footnotes.py $orig $origSrc

./squeeze-new-lines.sh $orig
./squeeze-new-lines.sh $organized

sed 's/[0-9]//g' $orig | sort > orig.md
sed 's/[0-9]//g' $organized | sort > organized.md

diff orig.md organized.md
