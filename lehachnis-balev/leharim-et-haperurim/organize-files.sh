#!/bin/sh

orig="leharim-et-haperurim.md"
origSrc="leharim-et-haperurim-sources.md"
organized="article_output.md"
organizedSrc="sources_output.md"

python organize-footnotes.py $orig $origSrc

./check-organized-file.sh $orig $organized
./check-organized-file.sh $origSrc $organizedSrc
