#!/usr/bin/env ruby
# encoding: UTF-8

# helpers.rb
module MyHelpers


  def self.windows_to_linux(path)
    # 1. Replace backslashes with forward slashes
    path = path.gsub('\\', '/')
    
    # 2. Convert drive letters (e.g., C:/ to /mnt/c/)
    path.gsub(/^([A-Za-z]):/) { "/#{$1.downcase}" }
  end

  def self.find_git_root
    root = `git rev-parse --show-toplevel 2>/dev/null`.strip
    puts root
    root.empty? ? nil : windows_to_linux(root)
  end

  # 1. Load the lines from the file into an array
  # 'readlines' reads the whole file; 'map(&:chomp)' removes the newline characters (\n)
  $books = File.readlines(File.join(__dir__, 'data/books.md')).map(&:chomp)
  $halachot = File.readlines(File.join(__dir__, 'data/halachot.md')).map(&:chomp)

  $hebrew_number = /[א-ת]'?|[א-ת]"?[א-ת]|[א-ת][א-ת]"?[א-ת]/
  $marked_hebrew_number = /[א-ת]'|[א-ת]"[א-ת]|[א-ת][א-ת]"[א-ת]/
  def self.is_citation(text)
    puts "Checking if '#{text}' is a citation"
    puts text
    if text =~ /תורה #{$hebrew_number}/
      puts "Matched Likutei Moharan citation"
      return true
    end
    if book = $books.find { |b| text.start_with?(b) }
      puts "Found a match! The book is: #{book}"
      rest = text[book.length..-1]
      if rest =~ /\sסעיף|פרק|דף|עמוד|משנה|גמרא|הלכה|הלכות|אות|סימן|פרק|שער|הקדמה|פרשת|ערך|מצוות\s/
        puts "Contains section indicator"
        return true
      end
      if rest =~ /\s+#{$marked_hebrew_number}(\s+|$)/
        puts "Contains Hebrew number"
        return true
      end
      puts "No identifiers found after book name"
      return false
    end
    if $halachot.any? { |halacha| text.start_with?(halacha) && text[halacha.length..-1] =~ /\s+([א-י]'?\s)?(אות\s#{$hebrew_number}|בהתחלה)/ }
      puts "Matched halacha citation"
      return true
    end
    false
  end
end

include MyHelpers
# Example usage:
# puts

puts MyHelpers.is_citation(%q(תפילין ה' אות כ"ד))  # => true
puts MyHelpers.is_citation(%q(סביבון))  # => false
puts MyHelpers.find_git_root()

