#!/bin/sh

organize-footnotes.py article-unordered.md sources-unordered.md

squeeze-new-lines.sh article_output.md

if diff -1 -B article_output.md article.md >/dev/null; then
    echo article test passed
else
    echo article test not passed
fi

organize-footnotes.py sources_output.md
squeeze-new-lines.sh article_output.md

if diff -1 -B article_output.md sources.md >/dev/null; then
    echo sources test passed
else
    echo sources test not passed
fi

rm article_output.md sources_output.md
