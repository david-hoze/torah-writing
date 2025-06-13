#import "@preview/wrap-it:0.1.1": wrap-content

#set page(
  paper: "a4",
  margin: (x: 2cm, y: 2cm),
)

// זהו הכלל הכללי לטקסט בכל הדף
#set text(
  font: (
    ( name: "FrankRuehl", covers: regex("[\u0590-\u05FF]") ), // פונט עברי
    "Times New Roman", // פונט כללי/אנגלי/ברירת מחדל
  ),
  size: 12pt,
  lang: "he",
  dir: rtl,
)

#set par(
  first-line-indent: 0em,
  leading: 1.2em,
  justify: true,
)

// כלל יחיד לציטוט: גם עיצוב טקסט וגם הזחה
#show quote: it => {
  // נשתמש ב-block להזחה
  block(inset: (left: 1em, right: 1em))[
    // נשתמש ב-override כדי לכפות את הגדרות הטקסט האלה על הציטוט
    #text.with(font: "FrankRuehl", style: "italic", size: 12pt)[#it]
  ]
}

---
= מוקד האש — גיליון 1

#let img = image("shlomo-question.png", width: 4cm)

#wrap-content(
  box(img, inset: 0.5em),
  [
    *לילה.*
    רוח קרירה...
  ],
  align: bottom + right,
  column-gutter: 1em,
)

> ציטוט