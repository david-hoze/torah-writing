#!/usr/bin/env ruby
require 'pathname'
require 'open3'

# ================= CONFIGURATION =================
SOURCE_WAV_DIR = "C:/Users/david/Documents/Backup"
TARGET_OPUS_DIR = "E:/temp"
# =================================================

def get_duration(file)
  # הפעלה ישירה ללא Shell כדי למנוע בעיות תווים בעברית
  stdout, stderr, status = Open3.capture3(
    "ffprobe", "-v", "error", "-show_entries", "format=duration", 
    "-of", "default=noprint_wrappers=1:nokey=1", file
  )
  
  if status.success? && !stdout.strip.empty?
    stdout.to_f
  else
    nil # מחזיר "כלום" במקרה של שגיאה במקום -1.0
  end
end

puts "🚀 Starting Deep Folder Comparison (Fixing False Positives)..."
puts "Source: #{SOURCE_WAV_DIR}"
puts "Target: #{TARGET_OPUS_DIR}"
puts "---------------------------------------------------"

source_base = Pathname.new(SOURCE_WAV_DIR)
target_base = Pathname.new(TARGET_OPUS_DIR)

stats = { matched: 0, missing: 0, duration_mismatch: 0, probe_error: 0 }
errors = []

Dir.glob("#{SOURCE_WAV_DIR}/**/*.[wW][aA][vV]").each do |wav_path|
  wav_pathname = Pathname.new(wav_path)
  relative_path = wav_pathname.relative_path_from(source_base)
  opus_relative = relative_path.to_s.sub(/\.[^.]+\z/, ".opus")
  opus_full_path = target_base.join(opus_relative).to_s

  # 1. בדיקת קיום קובץ
  if !File.exist?(opus_full_path)
    stats[:missing] += 1
    errors << "MISSING: #{opus_relative}"
    next
  end

  # 2. קבלת אורך הקבצים
  wav_dur = get_duration(wav_path)
  opus_dur = get_duration(opus_full_path)

  # 3. אימות נתונים
  if wav_dur.nil? || opus_dur.nil?
    stats[:probe_error] += 1
    errors << "PROBE ERROR (Could not read file): #{opus_relative}"
  elsif (wav_dur - opus_dur).abs < 0.1
    stats[:matched] += 1
  else
    stats[:duration_mismatch] += 1
    errors << "DURATION MISMATCH: #{opus_relative} (WAV: #{wav_dur}s, OPUS: #{opus_dur}s)"
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
  puts "🛑 ARCHIVE INVALID. Do not delete backup yet."
else
  puts "✨ ARCHIVE IS VALID. All files matched perfectly."
end
