#!/bin/sh

orig="leharim-et-haperurim.md"
origSrc="leharim-et-haperurim-sources.md"
organized="article_output.md"
organizedSrc="sources_output.md"

python organize-footnotes.py $orig $origSrc

./squeeze-new-lines.sh $orig
./squeeze-new-lines.sh $organized

sed 's/[0-9]//g' $orig | sort > orig.md
sed 's/[0-9]//g' $organized | sort > organized.md

if diff -1 -B orig.md organized.md >/dev/null; then
    echo Updating file
    mv $organized $orig
fi

./squeeze-new-lines.sh $origSrc
./squeeze-new-lines.sh $organizedSrc

sed 's/[0-9]//g' $origSrc | sort > orig-src.md
sed 's/[0-9]//g' $organizedSrc | sort > organized-src.md

if diff -1 -B orig-src.md organized-src.md >/dev/null; then
    echo Updating source file
    mv $organizedSrc $origSrc
fi
