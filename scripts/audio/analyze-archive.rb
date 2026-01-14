#!/usr/bin/env ruby

require 'open3'
require 'json'

# הגדרת התיקייה לסריקה (השתמש בנתיב המלא שלך)
BASE_DIR = "." 

# מבנה נתונים לאחסון התוצאות
analysis = Hash.new(0)
details = []

puts "🔍 סורק את הארכיון ומנתח קבצי WAV..."
puts "---------------------------------------------------"

# סריקה רקורסיבית של כל קבצי ה-WAV
Dir.glob("#{BASE_DIR}/**/*.[wW][aA][vV]").each do |file|
  
  # הרצת ffprobe בצורה בטוחה
  stdout, stderr, status = Open3.capture3(
    "ffprobe", "-v", "error", "-select_streams", "a:0", 
    "-show_entries", "stream=codec_name,bits_per_sample,sample_rate,channels", 
    "-of", "json", file
  )

  if status.success?
    data = JSON.parse(stdout)
    stream = data["streams"][0]
    
    # חילוץ המאפיינים
    codec    = stream["codec_name"] || "unknown"
    rate     = stream["sample_rate"] || "unknown"
    bits     = stream["bits_per_sample"] || "N/A"
    channels = stream["channels"] == 1 ? "Mono" : "Stereo"
    
    # יצירת מפתח ייחודי לשילוב הזה
    key = "[#{codec.upcase}] #{rate}Hz, #{bits}-bit, #{channels}"
    analysis[key] += 1
  else
    puts "❌ שגיאה בניתוח הקובץ: #{File.basename(file)}"
  end
end

puts "\n📊 סיכום מאפייני הארכיון:"
puts "---------------------------------------------------"
analysis.sort_by { |_key, count| -count }.each do |key, count|
  puts "#{key.ljust(40)} | קבצים: #{count}"
end

if analysis.any? { |k, _| k.include?("ADPCM") || k.include?("4-bit") }
  puts "\n💡 תובנה: נמצאו קבצי ADPCM או 4-bit. המרה ל-FLAC עבורם תגדיל את הנפח."
  puts "מומלץ להשתמש ב-Opus עם הגדרת voip עבור קבצים אלו."
end
