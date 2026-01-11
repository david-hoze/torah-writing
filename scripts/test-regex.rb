#!/usr/bin/env ruby
# encoding: UTF-8

def clean_hebrew_text(text)
  # Define the patterns clearly
  non_text_char = /[^\p{L}\p{N}\p{M}]/
  # 1. Define your "Left" and "Right" delimiters
  left  = /(#{non_text_char}|^)"/
  right = /"(?=#{non_text_char}|$)/

  # 2. Put them in the pattern
  rr = /(?<quotation> #{left} (?: \g<quotation> | [^"] )* #{right} )/x
  text.scan(rr)  # Test the regex
end

# # Verification
# all_matches = clean_hebrew_text('אמר "הספר "בראשית" כנ"ל" (מקור).')
# puts all_matches.inspect

# # --- בדיקות "קפדניות" ---
# test_cases = [
#   'הוא אמר "זה כנ"ל" ושתק.',                            # כנ"ל פשוט
#   'אמר "הספר "בראשית" הוא כנ"ל" (מקור 1).',             # ציטוט בתוך ציטוט + כנ"ל + סוגריים
#   'גרשיים "בסוף מילה" וגם "כנ"ל" (ביבליוגרפיה).',        # שני ציטוטים נפרדים
#   'הציטוט "הזה "לא נסגר'                                # מקרה קצה: ציטוט שבור (לא אמור להידבק)
# ]

# puts "Starting tests:"
# test_cases.each do |t|
#   puts "קלט:  #{t}"
#   puts "פלט: #{clean_hebrew_text(t)}"
#   puts "-" * 20
# end

text = 'This is a "test "string" with "multiple "quoted" sections" to "check"".'
# text = 'This is ""a" "test string ""with" multiple "quoted"" sections to check"".'
# text = 'This is a "test "string ""with" multiple "quoted"" "sections" to" check".'
text = 'This is "A tes"t" for quotations'

# Define the patterns clearly
non_text_char = /[^\p{L}\p{N}\p{M}]/
text_char = /[\p{L}\p{N}\p{M}]/
# 1. Define your "Left" and "Right" delimiters
left  = /(?<=#{non_text_char}|^)"/
right = /"(?=#{non_text_char}|$)/
hebrew_abbreviation = /#{text_char}"#{text_char}/

# 2. Put them in the pattern
balanced_quotes = /(?<quotation> #{left} (?: \g<quotation> | [^"] | #{hebrew_abbreviation} )* #{right} )/x
parantheses = /(?<parentheses>\s*\(([^)]+)\))/
all_matches = text.scan(balanced_quotes)  # Test the regex
puts all_matches.inspect


# text = 'This is "A test fo"r quotations" (with parantheses). Another "example here" (and more).'
# all_matches = text.scan(/#{balanced_quotes}\s*#{parantheses}/)  # Test the regex
# puts all_matches.inspect

# text.gsub(/#{balanced_quotes}\s*#{parantheses}/) do 
#   puts "Matched quotation: '#{$~[:quotation]}'"
#   puts "Matching text: '#{$~[:parentheses]}' for parentheses"
#   ""
# end