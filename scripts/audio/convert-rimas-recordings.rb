#!/usr/bin/env ruby

# convert_audio.rb
require 'fileutils'

puts "Starting conversion loop..."

# Find all WAV files recursively (case insensitive)
Dir.glob("**/*.[wW][aA][vV]").each do |wav_file|
  
  # Create the new filename with .opus extension
  opus_file = wav_file.sub(/\.[^.]+\z/, ".opus")
  
  puts "---------------------------------------------------"
  puts "Processing: #{wav_file}"
  
  # COMMAND EXPLANATION:
  # We pass the arguments as a list. This bypasses the shell completely.
  # This fixes the issue with Hebrew, spaces, and ' quotes.
  success = system(
    "ffmpeg", 
    "-n",              # Do not overwrite if output exists
    "-v", "error",     # Show only errors
    "-i", wav_file,    # Input
    "-c:a", "libopus", # Codec
    "-b:a", "32k",     # Bitrate (Excellent for speech)
    "-vbr", "on",      # Variable Bitrate
    "-map_metadata", "0", # Copy tags
    opus_file          # Output
  )

  if success
    puts "✅ Success! Deleting original WAV..."
    File.delete(wav_file)
  else
    puts "❌ Error converting file. Skipping delete."
  end
end

puts "Done!"

