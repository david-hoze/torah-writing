#!/bin/sh

orig="article.md"
origSrc="sources.md"
organized="article_output.md"
organizedSrc="sources_output.md"

python organize-footnotes.py $orig $origSrc

./check-organized-file.sh $orig $organized
./check-organized-file.sh $origSrc $organizedSrc

python organize-footnotes.py $origSrc

./check-organized-file.sh $origSrc $organized
