#!/usr/bin/env ruby
require 'pathname'
require 'open3'

# ================= CONFIGURATION =================
SOURCE_WAV_DIR = "C:/Users/david/Documents/Backup/wav"
TARGET_DIR     = "C:/Users/david/Documents/Backup/new_flac_conversion"
THRESHOLD_PERCENT = 0.01 # סלחנות של 1% באורך
# =================================================

def get_duration(file)
  # הפעלה ישירה ללא Shell כדי למנוע בעיות תווים בעברית
  stdout, stderr, status = Open3.capture3(
    "ffprobe", "-v", "error", "-show_entries", "format=duration", 
    "-of", "default=noprint_wrappers=1:nokey=1", file
  )
  
  (status.success? && !stdout.strip.empty?) ? stdout.to_f : nil
end

puts "🚀 Starting Smart Comparison (Searching for Opus or FLAC)..."
puts "Source: #{SOURCE_WAV_DIR}"
puts "Target: #{TARGET_DIR}"
puts "---------------------------------------------------"

source_base = Pathname.new(SOURCE_WAV_DIR)
target_base = Pathname.new(TARGET_DIR)

stats = { matched: 0, missing: 0, duration_mismatch: 0, probe_error: 0 }
errors = []

Dir.glob("#{SOURCE_WAV_DIR}/**/*.[wW][aA][vV]").each do |wav_path|
  wav_pathname = Pathname.new(wav_path)
  relative_path = wav_pathname.relative_path_from(source_base)
  
  # יצירת נתיבים פוטנציאליים לשני הפורמטים
  base_relative = relative_path.to_s.sub(/\.[^.]+\z/, "")
  opus_path = target_base.join("#{base_relative}.opus").to_s
  flac_path = target_base.join("#{base_relative}.flac").to_s

  # בדיקה איזה קובץ קיים ביעד
  target_full_path = nil
  ext_found = ""

  if File.exist?(flac_path)
    target_full_path = flac_path
    ext_found = "FLAC"
  elsif File.exist?(opus_path)
    target_full_path = opus_path
    ext_found = "OPUS"
  end

  # 1. בדיקת קיום קובץ
  if target_full_path.nil?
    stats[:missing] += 1
    errors << "MISSING: #{base_relative} (No .opus or .flac found)"
    next
  end

  # 2. קבלת אורך הקבצים
  wav_dur = get_duration(wav_path)
  target_dur = get_duration(target_full_path)

  # 3. אימות נתונים
  if wav_dur.nil? || target_dur.nil?
    stats[:probe_error] += 1
    errors << "PROBE ERROR: Could not read #{base_relative}"
  else
    diff = (wav_dur - target_dur).abs
    allowed_diff = wav_dur * THRESHOLD_PERCENT
    
    # בדיקה סלחנית: אם ההפרש קטן מ-1% או קטן מ-2 שניות
    if diff < allowed_diff || diff < 2.0
      stats[:matched] += 1
      puts "✅ OK [#{ext_found}]: #{base_relative} (WAV: #{wav_dur}s, #{ext_found}: #{target_dur}s), Diff: #{diff.round(2)}s)" # אופציונלי ללוג מפורט
    else
      stats[:duration_mismatch] += 1
      errors << "DURATION MISMATCH [#{ext_found}]: #{base_relative} (WAV: #{wav_dur}s, #{ext_found}: #{target_dur}s, Diff: #{diff.round(2)}s)"
    end
  end
end

puts "---------------------------------------------------"
puts "📊 FINAL REPORT"
puts "✅ Successfully Verified: #{stats[:matched]}"
puts "❌ Missing Files:         #{stats[:missing]}"
puts "⚠️  Duration Mismatch:    #{stats[:duration_mismatch]}"
puts "🚫 Read Errors:           #{stats[:probe_error]}"
puts "---------------------------------------------------"

unless errors.empty?
  File.write("comparison_errors.txt", errors.join("\n"))
  puts "📝 Detailed errors saved to 'comparison_errors.txt'"
  puts "🛑 ARCHIVE INVALID. Check the errors above."
else
  puts "✨ ARCHIVE IS VALID. All files matched (using mix of Opus/FLAC)."
end