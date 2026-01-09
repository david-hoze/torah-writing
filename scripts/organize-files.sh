#!/bin/sh

orig="article.md"
origSrc="sources.md"
organized="article_output.md"
organizedSrc="sources_output.md"

organize-footnotes.rb $orig $origSrc

check-organized-file.sh $orig $organized
check-organized-file.sh $origSrc $organizedSrc

organize-footnotes.rb $origSrc

check-organized-file.sh $origSrc $organized
