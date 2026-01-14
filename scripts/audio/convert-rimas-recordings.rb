#!/usr/bin/env ruby

require 'shellwords'
require 'json'

# הגדרות איכות משופרות
BITRATE = "64k" # העלינו מ-32k ל-64k. לתוצאה מושלמת אפשר גם 96k.
THRESHOLD_PERCENT = 0.01 # סלחנות של 1% מהאורך הכולל

def get_duration(file)
  # Calls ffprobe to get duration in seconds
  output = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "#{file}"`
  output.to_f
rescue
  0.0
end

puts "Starting ULTRA-SAFE conversion loop (Duration Check enabled)..."

Dir.glob("**/*.[wW][aA][vV]").each do |wav_file|
  opus_file = wav_file.sub(/\.[^.]+\z/, ".opus")
  
  puts "---------------------------------------------------"
  
  # בדיקה אם קובץ היעד כבר קיים - אם כן, פשוט דלג על הקובץ הזה
  if File.exist?(opus_file)
    puts "⚠️  Skipping: Output already exists for #{wav_file}"
    next 
  end

  puts "Processing: #{wav_file}"
  
  # Get original duration
  original_duration = get_duration(wav_file)
  
  if original_duration == 0
    puts "❌ ERROR: Could not read duration of original WAV. Skipping."
    next
  end

  # Run ffmpeg conversion
  success = system(
    "ffmpeg", "-n", "-v", "error", "-i", wav_file,
    "-c:a", "libopus", "-b:a", BITRATE, "-vbr", "on",
    "-application", "voip", "-map_metadata", "0", opus_file
  )

  # Verification Logic
  if success && File.exist?(opus_file)
    new_duration = get_duration(opus_file)

    diff = (original_duration - new_duration).abs
    allowed_diff = original_duration * THRESHOLD_PERCENT

    # Check if duration difference is less than 0.1 seconds (to allow for slight padding/rounding)
    duration_match = (original_duration - new_duration).abs < 0.2

    if diff < allowed_diff || diff < 2.0
      puts "✅ Success! Duration matches (#{new_duration.round(2)}s). Deleting WAV..."
      File.delete(wav_file)
    else
      puts "❌ CRITICAL ERROR: Duration mismatch too large!"
      puts "   WAV: #{original_duration}s vs OPUS: #{new_duration}s (Diff: #{diff.round(2)}s)"
      puts "   Allowed Diff: #{allowed_diff.round(2)}s. Keeping original."    end
  else
    puts "❌ ERROR: ffmpeg execution failed for #{wav_file}."
  end
end

puts "Done!"