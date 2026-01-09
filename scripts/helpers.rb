#!/usr/bin/env ruby
# encoding: UTF-8

# helpers.rb
module MyHelpers

  # 1. Load the lines from the file into an array
  # 'readlines' reads the whole file; 'map(&:chomp)' removes the newline characters (\n)
  $books = File.readlines('data/books.md').map(&:chomp)
  $halachot = File.readlines('data/halachot.md').map(&:chomp)

  $hebrew_number = /[א-י]'?|[א-ת]"?[א-ת]|[א-ת][א-ת]"?[א-ת]/
  def self.is_citation(text)
    puts "Checking if '#{text}' is a citation"
    if text =~ /תורה #{$hebrew_number}/
      puts "Matched Likutei Moharan citation"
      return true
    end
    if book = $books.find { |b| text.start_with?(b) }
      puts "Found a match! The book is: #{book}"
      rest = text[book.length..-1]
      if rest.include?(" פרשת ")
        puts "Contains Parashat"
        return true
      end
      if rest =~ /סעיף|פרק|דף|עמוד|משנה|גמרא|הלכה|הלכות|אות|סימן|פרק|שער/
        puts "Contains section indicator"
        return true
      end
      puts "No identifiers found after book name"
      return false
    end
    if $halachot.any? { |halacha| text.start_with?(halacha) && text[halacha.length..-1] =~ /\s+[א-י]'?\sאות\s#{$hebrew_number}/ }
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

