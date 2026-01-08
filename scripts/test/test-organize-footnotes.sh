#!/bin/sh

$1 article-unordered.md sources-unordered.md

squeeze-new-lines.sh article_output.md

if diff -B -b article_output.md article.md >/dev/null; then
    echo unordered article test passed
else
    echo unordered article test not passed
fi

$1 sources_output.md
squeeze-new-lines.sh article_output.md

if diff -B -b article_output.md sources.md >/dev/null; then
    echo unordered sources test passed
else
    echo unordered sources test not passed
fi

rm article_output.md sources_output.md

$1 article-unordered-citation-mismatch.md sources-unordered-citation-mismatch.md

if diff -B -b citation-mismatch.md expected-citation-mismatch.md >/dev/null; then
    echo citation mismatch test passed
else
    echo citation mismatch not passed
fi

rm article_output.md sources_output.md
