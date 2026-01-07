#/bin/sh

squeeze-new-lines.sh $1
squeeze-new-lines.sh $2

echo lines, words, chars
wc $1
wc $2

sed 's/[0-9]//g' $1 | sort > orig.md
sed 's/[0-9]//g' $2 | sort > organized.md

if diff -1 -B orig.md organized.md >/dev/null; then
    echo Updating file
    mv $2 $1
fi

rm orig.md organized.md
