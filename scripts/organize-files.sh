#!/bin/sh

orig="article.md"
origSrc="sources.md"
organized="article_output.md"
organizedSrc="sources_output.md"

organize-footnotes.py $orig $origSrc

check-organized-file.sh $orig $organized
check-organized-file.sh $origSrc $organizedSrc

organize-footnotes.py $origSrc

check-organized-file.sh $origSrc $organized
