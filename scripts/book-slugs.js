// Mapping from Hebrew book paths (relative to books/) to English slug names.
// Used by extraction scripts and migration tools.
//
// Convention: transliterated Hebrew, lowercase, hyphens between words.
// Short and recognizable. No "sefer-" prefix unless it's part of the common name.

const fs = require("fs");
const path = require("path");

// Hebrew source path (relative to books/) → English slug
const SLUG_MAP = {
  // ── Breslov ──────────────────────────────────────────────────────────────
  "ברסלב/ארץ ישראל/ארץ ישראל חלק ראשון":     "eretz-yisrael-1",
  "ברסלב/ארץ ישראל/ארץ ישראל חלק שני":        "eretz-yisrael-2",
  "ברסלב/חיי מוהרן":                           "chayei-moharan",
  "ברסלב/ליקוטי הלכות":                        "likutei-halachot",
  "ברסלב/ליקוטי הלכות - טענות":                "likutei-halachot-taanot",
  "ברסלב/ליקוטי מוהרן":                        "likutei-moharan",
  "ברסלב/ליקוטי עצות":                         "likutei-etzot",
  "ברסלב/ליקוטי תפילות":                       "likutei-tefilot",
  "ברסלב/משיבת נפש":                           "meshivat-nefesh",
  "ברסלב/סיפורי מעשיות":                       "sipurei-maasiyot",
  "ברסלב/ספר המדות":                           "sefer-hamidot",
  "ברסלב/ספר ימי מוהרנת/ימי מוהרנת חלק ראשון": "yemei-moharnat-1",
  "ברסלב/ספר ימי מוהרנת/ימי מוהרנת חלק שני":   "yemei-moharnat-2",
  "ברסלב/ספר שמות הצדיקים":                    "shemot-hatzadikim",
  "ברסלב/עלים לתרופה":                         "alim-letrufa",
  "ברסלב/שבחי הרן":                            "shivchei-haran",
  "ברסלב/שיחות הרן":                           "sichot-haran",

  // ── Kabbalah: standalone ─────────────────────────────────────────────────
  "קבלה/אגרת וזאת ליהודה":                     "igeret-vezot-leyehuda",
  "קבלה/אור השכל":                              "or-hasechel",
  "קבלה/גט השמות":                              "get-hashemot",
  "קבלה/גן נעול (אבולעפיה)":                    "gan-naul",
  "קבלה/דרשת הרמבן":                            "drashat-haramban",
  "קבלה/היכלות רבתי":                            "heichalot-rabati",
  "קבלה/ספר הבהיר":                              "sefer-habahir",
  "קבלה/ספר החשק":                               "sefer-hacheshek",

  // ── Baal HaSulam ─────────────────────────────────────────────────────────
  "קבלה/בעל הסולם/אור פנימי על תלמוד עשר הספירות":  "or-pnimi",
  "קבלה/בעל הסולם/הערות על קונטרס מתן תורה":        "hearot-kuntres-matan-torah",
  "קבלה/בעל הסולם/הערות על תלמוד עשר הספירות":      "hearot-talmud-eser-hasfirot",
  "קבלה/בעל הסולם/הקדמות לחכמת האמת - ספר הזוהר":  "hakdamot-chochmat-haemet",
  "קבלה/בעל הסולם/השפעה; הלימוד המרכזי של הקבלה/הערות על השפעה; הלימוד המרכזי של הקבלה": "hearot-hashpaa",
  "קבלה/בעל הסולם/השפעה; הלימוד המרכזי של הקבלה/השפעה; הלימוד המרכזי של הקבלה": "hashpaa",
  "קבלה/בעל הסולם/מבוא לספר הזוהר":                 "mavo-lesefer-hazohar",
  "קבלה/בעל הסולם/פתיחה לחכמת הקבלה":               "pticha-lechochmat-hakabbala",
  "קבלה/בעל הסולם/פתיחה לפירוש הסולם":              "pticha-lepirush-hasulam",
  "קבלה/בעל הסולם/קונטרס מתן תורה":                 "kuntres-matan-torah",
  "קבלה/בעל הסולם/תלמוד עשר הספירות":               "talmud-eser-hasfirot",

  // ── Zohar ────────────────────────────────────────────────────────────────
  "קבלה/זהר/אדרא זוטא":                              "idra-zuta",
  "קבלה/זהר/אור החמה על ספר הזהר":                    "or-hachama",
  "קבלה/זהר/ביאור הגרא על ספרא דצניעותא":             "biur-hagra-sifra-detzniuta",
  "קבלה/זהר/האידרות - אדרא רבא, אדרא זוטא, אדרא דמשכנא": "idrot",
  "קבלה/זהר/הסולם על ספר הזהר":                       "hasulam-al-hazohar",
  "קבלה/זהר/הערות על אור החמה על ספר הזהר":           "hearot-or-hachama",
  "קבלה/זהר/זוהר חדש":                                "zohar-chadash",
  "קבלה/זהר/זוהר מתורגם/הזוהר המתורגם - במדבר":      "zohar-meturgam-bamidbar",
  "קבלה/זהר/זוהר מתורגם/הזוהר המתורגם - בראשית":     "zohar-meturgam-bereshit",
  "קבלה/זהר/זוהר מתורגם/הזוהר המתורגם - דברים":      "zohar-meturgam-devarim",
  "קבלה/זהר/זוהר מתורגם/הזוהר המתורגם - הקדמה":      "zohar-meturgam-hakdama",
  "קבלה/זהר/זוהר מתורגם/הזוהר המתורגם - ויקרא":      "zohar-meturgam-vayikra",
  "קבלה/זהר/זוהר מתורגם/הזוהר המתורגם - זוהר חדש":   "zohar-meturgam-chadash",
  "קבלה/זהר/זוהר מתורגם/הזוהר המתורגם - שמות":       "zohar-meturgam-shemot",
  "קבלה/זהר/זוהר מתורגם/הזוהר המתורגם - תיקוני הזוהר": "zohar-meturgam-tikunim",
  "קבלה/זהר/יהל אור על ספר הזהר":                     "yahel-or",
  "קבלה/זהר/כתם פז על ספר הזהר":                      "ketem-paz",
  "קבלה/זהר/מקדש מלך על ספר הזהר":                    "mikdash-melech",
  "קבלה/זהר/מקדש מלך, פירוש הרמז על ספר הזהר":       "mikdash-melech-remez",
  "קבלה/זהר/נפש דוד על ספר הזהר":                     "nefesh-david",
  "קבלה/זהר/ספר הזהר":                                "sefer-hazohar",
  "קבלה/זהר/ספרא דצניעותא עם ביאור הגרא":             "sifra-detzniuta-biur-hagra",
  "קבלה/זהר/ספרא דצניעותא":                            "sifra-detzniuta",
  "קבלה/זהר/תקוני הזהר":                               "tikunei-hazohar",

  // ── Arizal & Chaim Vital ─────────────────────────────────────────────────
  "קבלה/כתבי הארי וחיים ויטאל/הערות על שער רוח הקודש": "hearot-shaar-ruach-hakodesh",
  "קבלה/כתבי הארי וחיים ויטאל/עץ חיים":               "etz-chaim",
  "קבלה/כתבי הארי וחיים ויטאל/פרי עץ חיים":           "pri-etz-chaim",
  "קבלה/כתבי הארי וחיים ויטאל/שער הגלגולים":          "shaar-hagilgulim",
  "קבלה/כתבי הארי וחיים ויטאל/שער ההקדמות":           "shaar-hahakdamot",
  "קבלה/כתבי הארי וחיים ויטאל/שער הכוונות":           "shaar-hakavanot",
  "קבלה/כתבי הארי וחיים ויטאל/שער המצוות":            "shaar-hamitzvot",
  "קבלה/כתבי הארי וחיים ויטאל/שער הפסוקים":           "shaar-hapsukim",
  "קבלה/כתבי הארי וחיים ויטאל/שער מאמרי רזל":         "shaar-maamarei-razal",
  "קבלה/כתבי הארי וחיים ויטאל/שער מאמרי רשבי":        "shaar-maamarei-rashbi",
  "קבלה/כתבי הארי וחיים ויטאל/שער רוח הקודש":         "shaar-ruach-hakodesh",
  "קבלה/כתבי הארי וחיים ויטאל/שערי קדושה":            "shaarei-kedusha",

  // ── Abulafia ─────────────────────────────────────────────────────────────
  "קבלה/כתבי רבי אברהם אבולעפיא/ספר אוצר עדן הגנוז": "otzar-eden-haganuz",
  "קבלה/כתבי רבי אברהם אבולעפיא/ספר אור השכל":       "or-hasechel-abulafia",
  "קבלה/כתבי רבי אברהם אבולעפיא/ספר אמרי שפר":      "imrei-shefer",
  "קבלה/כתבי רבי אברהם אבולעפיא/ספר חיי העולם הבא":  "chayei-haolam-haba",
  "קבלה/כתבי רבי אברהם אבולעפיא/שבע נתיבות התורה":   "sheva-netivot-hatorah",

  // ── Sefer Yetzira ────────────────────────────────────────────────────────
  "קבלה/ספר יצירה/ספר יצירה":                          "sefer-yetzira",
  "קבלה/ספר יצירה/ספר יצירה - מסודר":                  "sefer-yetzira-mesudar",
  "קבלה/ספר יצירה/ספר יצירה נוסח הגרא":                "sefer-yetzira-nusach-hagra",
  "קבלה/ספר יצירה/מפרשים/פירוש הגרא על ספר יצירה":    "pirush-hagra-yetzira",
  "קבלה/ספר יצירה/מפרשים/פירוש הראבד על ספר יצירה":   "pirush-haraavad-yetzira",
  "קבלה/ספר יצירה/מפרשים/פירוש הרי דמן עכו לספר יצירה": "pirush-riaz-yetzira",
  "קבלה/ספר יצירה/מפרשים/פירוש הרמק לספר יצירה":     "pirush-haramak-yetzira",
  "קבלה/ספר יצירה/מפרשים/פירוש מעשה בראשית":          "pirush-maaseh-bereshit",
  "קבלה/ספר יצירה/מפרשים/פירוש רי סגי נהור לספר יצירה": "pirush-ri-sagi-nahor-yetzira",
  "קבלה/ספר יצירה/מפרשים/פרי יצחק על ספר יצירה":     "pri-yitzchak-yetzira",
  "קבלה/ספר יצירה/מפרשים/רמבן על ספר יצירה":          "ramban-yetzira",
  "קבלה/ספר יצירה/מפרשים/רסג על ספר יצירה":           "rasag-yetzira",

  // ── More Kabbalah ────────────────────────────────────────────────────────
  "קבלה/ספרי קבלה נוספים/אגרת אל הרמבן מרבי אברהם גאון": "igeret-el-haramban",
  "קבלה/ספרי קבלה נוספים/ביאור עשר ספירות":            "biur-eser-sfirot",
  "קבלה/ספרי קבלה נוספים/בנפש דוד":                    "benafesh-david",
  "קבלה/ספרי קבלה נוספים/הערות על כללי התחלת החכמה":   "hearot-klalei-hatchalat-hachochma",
  "קבלה/ספרי קבלה נוספים/הערות על מאמר זהר הרקיע":    "hearot-zohar-harakia",
  "קבלה/ספרי קבלה נוספים/וילקט יוסף":                  "vayilket-yosef",
  "קבלה/ספרי קבלה נוספים/חסד לאברהם":                  "chesed-leavraham",
  "קבלה/ספרי קבלה נוספים/יושר לבב":                    "yosher-levav",
  "קבלה/ספרי קבלה נוספים/כללי התחלת החכמה":            "klalei-hatchalat-hachochma",
  "קבלה/ספרי קבלה נוספים/מאמר זהר הרקיע":             "zohar-harakia",
  "קבלה/ספרי קבלה נוספים/מבוא שערים":                  "mavo-shearim",
  "קבלה/ספרי קבלה נוספים/מגיד מישרים":                 "magid-mesharim",
  "קבלה/ספרי קבלה נוספים/מגלה עמוקות על פרשת ואתחנן":  "megale-amukot-vaetchanan",
  "קבלה/ספרי קבלה נוספים/מטפחת ספרים":                 "mitpachat-sfarim",
  "קבלה/ספרי קבלה נוספים/מערכת האלקות":                "maarechet-haelokut",
  "קבלה/ספרי קבלה נוספים/מעשה רוקח על המשנה":          "maaseh-rokeach",
  "קבלה/ספרי קבלה נוספים/סוד הנבואה מרבי יעקב משגביא": "sod-hanevua",
  "קבלה/ספרי קבלה נוספים/סוד ידיעת המציאות מקבלת הגאונים": "sod-yediat-hametziyut",
  "קבלה/ספרי קבלה נוספים/ספר הייחוד":                  "sefer-hayichud",
  "קבלה/ספרי קבלה נוספים/ספר העיון":                   "sefer-haiyun",
  "קבלה/ספרי קבלה נוספים/ספר הפליאה":                  "sefer-hapliah",
  "קבלה/ספרי קבלה נוספים/ספר הקנה":                    "sefer-hakana",
  "קבלה/ספרי קבלה נוספים/ספר התמונה":                  "sefer-hatmuna",
  "קבלה/ספרי קבלה נוספים/ספר מדרש שמעון הצדיק":       "midrash-shimon-hatzadik",
  "קבלה/ספרי קבלה נוספים/ספר מעולפת ספירים":           "meulefet-sapirim",
  "קבלה/ספרי קבלה נוספים/ספר שושן סודות":              "shoshan-sodot",
  "קבלה/ספרי קבלה נוספים/עבודת הקודש (גבאי)":         "avodat-hakodesh",
  "קבלה/ספרי קבלה נוספים/פירוש לב נתיבות מקבלת הגאונים": "lev-netivot",
  "קבלה/ספרי קבלה נוספים/פרי עץ הדר":                 "pri-etz-hadar",
  "קבלה/ספרי קבלה נוספים/קיצור מחברת הקודש":          "kitzur-machberet-hakodesh",
  "קבלה/ספרי קבלה נוספים/ראשית חכמה":                  "reshit-chochma",
  "קבלה/ספרי קבלה נוספים/רקנאטי על התורה":             "recanati-al-hatorah",
  "קבלה/ספרי קבלה נוספים/שובי שובי השולמית":           "shuvi-shuvi-hashulamit",
  "קבלה/ספרי קבלה נוספים/שומר אמונים הקדמון":          "shomer-emunim",
  "קבלה/ספרי קבלה נוספים/שערי אורה":                   "shaarei-ora",
  "קבלה/ספרי קבלה נוספים/שערי צדק":                    "shaarei-tzedek",
  "קבלה/ספרי קבלה נוספים/תולעת יעקב":                  "tolaat-yaakov",

  // ── Individual authors ───────────────────────────────────────────────────
  "קבלה/רבי אברהם בר אלכסנדר מקולוניא/ספר כתר שם טוב": "keter-shem-tov",
  "קבלה/רבי אברהם מרימון הספרדי/ספר ברית מנוחה":       "brit-menucha",
  "קבלה/רבי חיים ויטאל/ליקוטי השס":                    "likutei-hashas",
  "קבלה/רבי חיים ויטאל/ספר עץ הדעת טוב":              "etz-hadaat-tov",
  "קבלה/רבי יוסף גיקטליה/סוד הנחש":                   "sod-hanachash",
  "קבלה/רבי יוסף גיקטליה/ספר החשמל":                  "sefer-hachashmal",
  "קבלה/רבי יוסף גיקטליה/ספר שער הניקוד וסוד החשמל":  "shaar-hanikud",
  "קבלה/רבי מאיר בן גבאי/ספר דרך אמונה":              "derech-emuna",
  "קבלה/רבי מנחם עזריה מפאנו/ספר גלגולי נשמות":       "gilgulei-neshamot",
  "קבלה/רבי מנחם עזריה מפאנו/ספר יונת אלם":           "yonat-elem",
  "קבלה/רבי מנחם עזריה מפאנו/ספר עשרה מאמרות":        "asara-maamarot",
  "קבלה/רבי משה בן שם טוב די ליאון/ספר שקל הקדש":     "shekel-hakodesh",
  "קבלה/רבי שלום שרעבי/ספר נהר שלום":                  "nahar-shalom",
  "קבלה/רבי שלום שרעבי/קונטרס חסדי דוד":              "chasdei-david",

  // ── Ramchal ──────────────────────────────────────────────────────────────
  "קבלה/רמחל/ביאורים לספר אוצרות חיים":               "biurim-otzrot-chaim",
  "קבלה/רמחל/דברי תורה בשם המגיד לרמחל":             "divrei-torah-magid-ramchal",
  "קבלה/רמחל/דעת תבונות":                              "daat-tvunot",
  "קבלה/רמחל/דרך עץ חיים (רמחל)":                     "derech-etz-chaim",
  "קבלה/רמחל/כללות שרשי החכמה":                        "klalut-sharshei-hachochma",
  "קבלה/רמחל/כללי מאמר החכמה":                         "klalei-maamar-hachochma",
  "קבלה/רמחל/כללי ספר מלחמות משה":                     "klalei-milchamot-moshe",
  "קבלה/רמחל/כללי ספר קנאת ה' צבאות":                  "klalei-kinat-hashem",
  "קבלה/רמחל/כללי פתחי חכמה ודעת":                     "klalei-pitchei-chochma",
  "קבלה/רמחל/ליקוטים מכתבי הרמחל זל":                  "likutim-kitvei-ramchal",
  "קבלה/רמחל/מאמר החכמה":                              "maamar-hachochma",
  "קבלה/רמחל/מאמר ויהי מקץ":                           "maamar-vayehi-miketz",
  "קבלה/רמחל/מאמר חכמת האמת להרמחל":                  "maamar-chochmat-haemet",
  "קבלה/רמחל/מאמר על ההגדות":                           "maamar-al-hahagadot",
  "קבלה/רמחל/סוד המרכבה דמות אדם והיחוד":              "sod-hamerkava",
  "קבלה/רמחל/ספר דרך חכמה":                            "derech-chochma",
  "קבלה/רמחל/ספר משכני עליון":                          "mishknei-elyon",
  "קבלה/רמחל/ספר פנות המרכבה":                         "pinot-hamerkava",
  "קבלה/רמחל/ספר קנאת ה' צבאות":                       "kinat-hashem-tzevaot",
  "קבלה/רמחל/עשרה אורות":                              "asara-orot",
  "קבלה/רמחל/עשרה פרקים להרמחל":                       "asara-prakim-ramchal",
  "קבלה/רמחל/עשרה פרקים לרמחל - כללות האילן הקדוש":   "asara-prakim-ilan-hakadosh",
  "קבלה/רמחל/פירוש למאמר ויהי מקץ":                    "pirush-vayehi-miketz",
  "קבלה/רמחל/פירוש מאמר ארימת ידי בצלותין":            "pirush-arimat-yedei",
  "קבלה/רמחל/פירוש מאמר הזוהר ריש משפטים":             "pirush-zohar-mishpatim",
  "קבלה/רמחל/פירוש משנה ראשונה לספר יצירה":            "pirush-mishna-rishona-yetzira",
  "קבלה/רמחל/קלח פתחי חכמה - הפתחים בלבד":            "klach-pitchei-chochma-ptachim",
  "קבלה/רמחל/קלח פתחי חכמה":                           "klach-pitchei-chochma",
  "קבלה/רמחל/ראשי פרקים של דברי תורה":                 "rashei-prakim-divrei-torah",
  "קבלה/רמחל/תפלות לפנות המרכבה":                      "tfilot-pinot-hamerkava",

  // ── Ramak ────────────────────────────────────────────────────────────────
  "קבלה/רמק/אור יקר על בראשית":                       "or-yakar-bereshit",
  "קבלה/רמק/אור יקר על ענין הנבואה":                  "or-yakar-nevua",
  "קבלה/רמק/אור נערב":                                 "or-neerav",
  "קבלה/רמק/דרישות בעניני המלאכים":                    "drishot-malachim",
  "קבלה/רמק/ספר גרושין":                               "sefer-gerushin",
  "קבלה/רמק/פרדס רמונים":                              "pardes-rimonim",
};

// Build reverse map: old Hebrew slug (as used in output/claims/) → new English slug
function hebrewPathToOldSlug(hebrewPath) {
  return hebrewPath
    .replace(/\.md$/, "")
    .replace(/[<>:"|?*]/g, "")
    .replace(/[\\/]/g, "--")
    .replace(/\s+/g, "-");
}

const OLD_TO_NEW = {};
for (const [hebrewPath, englishSlug] of Object.entries(SLUG_MAP)) {
  const oldSlug = hebrewPathToOldSlug(hebrewPath);
  OLD_TO_NEW[oldSlug] = englishSlug;
}

// Get English slug for a Hebrew book path (relative to books/, without .md)
function getSlug(hebrewPath) {
  const clean = hebrewPath.replace(/\.md$/, "");
  return SLUG_MAP[clean] || null;
}

module.exports = { SLUG_MAP, OLD_TO_NEW, getSlug, hebrewPathToOldSlug };
