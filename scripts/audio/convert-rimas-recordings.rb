#!/usr/bin/env ruby

require 'shellwords'

puts "Starting SAFE conversion loop..."

Dir.glob("**/*.[wW][aA][vV]").each do |wav_file|
  opus_file = wav_file.sub(/\.[^.]+\z/, ".opus")
  
  puts "---------------------------------------------------"
  
  # בדיקה אם קובץ היעד כבר קיים - אם כן, פשוט דלג על הקובץ הזה
  if File.exist?(opus_file)
    puts "⚠️  Skipping: Output already exists for #{wav_file}"
    next 
  end

  puts "Processing: #{wav_file}"
  
  # הרצת ffmpeg
  success = system(
    "ffmpeg", "-n", "-v", "error", "-i", wav_file,
    "-c:a", "libopus", "-b:a", "32k", "-vbr", "on",
    "-map_metadata", "0", opus_file
  )

  # בדיקה כפולה ומכופלת: האם ffmpeg החזיר אמת והאם הקובץ באמת נוצר?
  if success && File.exist?(opus_file) && File.size(opus_file) > 0
    puts "✅ Success! Deleting original WAV..."
    File.delete(wav_file)
  else
    puts "❌ ERROR: Conversion failed for #{wav_file}. Keeping original."
  end
end

puts "Done!"
