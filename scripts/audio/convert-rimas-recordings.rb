#!/usr/bin/env ruby

require 'shellwords'
require 'json'
require 'open3'

# ================= CONFIGURATION =================
BITRATE_OPUS = "96k"      # Quality for standard PCM files
BITRATE_ADPCM_OPUS = "32k" # Quality for low-end ADPCM files
THRESHOLD_PERCENT = 0.01   # 1% duration tolerance
CONVERSION_TYPE = "flac"   # Default mode
# =================================================

def get_metadata(file)
  stdout, stderr, status = Open3.capture3(
    "ffprobe", "-v", "error", "-select_streams", "a:0", 
    "-show_entries", "stream=codec_name,duration", 
    "-of", "json", file
  )
  return nil unless status.success?
  JSON.parse(stdout)["streams"][0]
rescue
  nil
end

puts "🚀 Starting Hybrid Conversion Loop..."
puts "Mode: #{CONVERSION_TYPE.upcase} (with ADPCM-to-Opus override)"
puts "---------------------------------------------------"

Dir.glob("**/*.[wW][aA][vV]").each do |wav_file|
  meta = get_metadata(wav_file)
  if meta.nil?
    puts "❌ ERROR: Could not probe #{wav_file}. Skipping."
    next
  end

  codec = meta["codec_name"]
  original_duration = meta["duration"].to_f
  
  # Determine actual target type for this specific file
  current_target_type = CONVERSION_TYPE
  is_adpcm = codec.include?("adpcm")

  if CONVERSION_TYPE == "flac" && is_adpcm
    puts "💡 ADPCM detected (#{codec}). Skipping"
    next
  end

  converted_file = wav_file.sub(/\.[^.]+\z/, ".#{current_target_type}")
  
  if File.exist?(converted_file)
    puts "⚠️  Skipping: Output exists for #{File.basename(wav_file)}"
    next 
  end

  puts "Processing: #{File.basename(wav_file)} [Source: #{codec}]"

  success = false
  if current_target_type == "flac"
    # Lossless path
    success = system("ffmpeg", "-n", "-v", "error", "-i", wav_file, "-c:a", "flac", "-compression_level", "8", "-map_metadata", "0", converted_file)
  else
    # Opus path (Standard or ADPCM override)
    br = is_adpcm ? BITRATE_ADPCM_OPUS : BITRATE_OPUS
    app = is_adpcm ? "voip" : "audio"
    success = system("ffmpeg", "-n", "-v", "error", "-i", wav_file, "-c:a", "libopus", "-b:a", br, "-vbr", "on", "-application", app, "-map_metadata", "0", converted_file)
  end

  # Verification Logic
  if success && File.exist?(converted_file)
    new_meta = get_metadata(converted_file)
    new_duration = new_meta ? new_meta["duration"].to_f : 0
      
    diff = (original_duration - new_duration).abs
    allowed_diff = original_duration * THRESHOLD_PERCENT

    # Valid if within 1% OR less than 2 seconds (for very short files)
    if diff < allowed_diff || diff < 2.0
      puts "✅ Success! Duration Match. Deleting original WAV..."
      File.delete(wav_file)
    else
      puts "❌ CRITICAL ERROR: Duration mismatch too large!"
      puts "   WAV: #{original_duration.round(2)}s vs NEW: #{new_duration.round(2)}s (Diff: #{diff.round(2)}s)"
      puts "   Keeping original file for safety."
    end
  else
    puts "❌ ERROR: ffmpeg execution failed for #{wav_file}."
  end
end

puts "---------------------------------------------------"
puts "Done!"