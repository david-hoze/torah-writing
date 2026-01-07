#!/bin/sh

dos2unix $1
cat -s $1 > squeezed.tmp
mv squeezed.tmp $1
unix2dos $1
