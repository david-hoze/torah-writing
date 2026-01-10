#!/usr/bin/env ruby
# encoding: UTF-8

require_relative 'helpers'
include MyHelpers

FOOTNOTE_SOURCE_PREFIX = "## הערה "

abort "usage: script.rb <article.md> [sources.md]" if ARGV.empty?

text = File.read(ARGV[0], encoding: "UTF-8")

mapping = text
  .scan(/(\[\^\d+\])/)
  .uniq
  .map { _1[0][2..-2].to_i }  # slice "[^n]" -> n
  .zip((1..).lazy)
  .to_h

ordered_text = text.gsub(/\[\^(\d+)\]/) { "[^#{mapping[$1.to_i]}]" }

ordered_footnotes = ordered_text.
  scan(/^\[\^(\d+)\]:(.*)$/)
  .sort_by { |num, _| num.to_i }
  .map { |num, content| "[^#{num}]:#{content}" }
  .join("\n\n")
  .gsub(/הערה (\d+)/) { "הערה #{mapping[$1.to_i]}" }


class String
  def remove_quotations_with_following_parentheses
    non_text = /[^\p{L}\p{N}\p{M}]/
    quotation_count = 0
    i = 0
    out = ""
    debug = false
    while i < self.length
      puts "At position #{i}, char is '#{self[i]}', quotation_count is #{quotation_count}" if debug
      if self[i] == '"' && (i == 0 || self[i-1] =~ non_text)
        puts "Found opening quotation at #{i}" if debug
        quotation_count = 1
        j = i + 1
        while j < self.length
          if self[j] == '"' && self[j+1] =~ non_text
            puts "Found closing quotation at #{j}" if debug
            puts "quotation_count is #{quotation_count}" if debug
            quotation_count -= 1
            j += 1
            next
          end
          if self[j] == '"' && self[j-1] =~ non_text
            quotation_count += 1
            j += 1
            next
          end
          if quotation_count == 0
            break
          end
          j += 1
        end
        puts "Matched quotation from #{i} to #{j}" if debug
        puts self[i..j-1] if debug
        puts "Matching text: '#{self[j..-1]}' for parentheses" if debug
        match = self[j..-1].match(/^\s*\([^)]+\)/)
        if match
          puts "Also found following parentheses: '#{match[0]}'" if debug
          puts "Removed text: '#{self[i..(j + match[0].length - 1)]}'" if debug
          i = j + match[0].length
          puts "Removing quotation and following parentheses, moving to position #{i}" if debug
        else
          puts "No following parentheses, keeping quotation" if debug
          out << self[i..j]
          i = j + 1
        end
      else
        out << self[i]
        i += 1
      end
    end
    puts "Resulting text:" if debug
    puts out if debug
    out
  end
end

# test_text = %Q{"You need to (capture): "this", text (because): "it's a well" balanced (quotes): 'with inner quotes'" (and also the parantheses following), but not capture this text, 'cause it's not a quote right? (even though it has parantheses following it). "Also, capture this, it's also quotes" (followed by parantheses).}

# puts test_text.remove_quotations_with_following_parentheses()
# return


ordered_text = ordered_text
  .gsub(/^\[\^(\d+)\]:(.*)$/) { "" }.strip
  .concat("\n\n")
  .concat(ordered_footnotes)

File.write("article_output.md", ordered_text)

if ARGV.size < 2
  exit
end

sources = File.read(ARGV[1], encoding: "UTF-8")
ordered_sources = sources
  .scan(/^## הערה (\d+)|(^(?!## הערה \d+).*)/)
  .reduce([[0,""]]) do |acc, (footnote, text)|
    if footnote
      if mapping[footnote.to_i].nil?
        warn "Unknown footnote source #{footnote}"
      else
        acc << [mapping[footnote.to_i], ""]  # start new footnote entry
      end
    elsif !acc.empty?
      acc[-1][1] << text + "\n"  # append to current footnote text
    end
    acc
  end
  .sort_by { |num, _| num }
  .map { |num, content| num != 0 ? "#{FOOTNOTE_SOURCE_PREFIX}#{num}\n\n#{content.strip}\n" : content.strip }
  .join("\n")

footnote_citations = ordered_footnotes
  .scan(/^\[\^(\d+)\]:(.*)$/)
  .reduce({}) do |acc, (num, content)|
    citations = content
      .remove_quotations_with_following_parentheses()
      .scan(/\(([^)]+)\)/)
      .map do |citation_group|
        citation_group[0]
          .split(",")
          .map{_1.strip.gsub(/ו?ע"ע/,"").strip}
          .each_with_object([]){|p,a| p.size<=8 && a.any? ? a[-1]<<", #{p}" : a<<p}
      end
      .flatten
      .select { |c| MyHelpers.is_citation(c) }

    acc[num.to_i] = citations
    acc
  end

current_footnote = nil
sources_footnote_citations = ordered_sources
  .scan(/^## הערה (\d+)|^### (.*)/)
  .reduce({}) do |acc, (footnote, citation)|
    if footnote
      current_footnote = footnote.to_i
      acc[current_footnote] ||= []
    elsif citation && current_footnote
      acc[current_footnote] << citation.strip
    end
    acc
  end

File.write(
  "citation-mismatch.md",
  footnote_citations.sort
    .map { |k,v| [k, v, sources_footnote_citations.fetch(k, [])] }
    .reject { |_,a,b| a == b }
    .map { |n,a,b|
      "Footnote #{n}\nExpected:\n#{a.join("\n")}\nFound:\n#{b.join("\n")}\n"
    }
    .join("\n")
)

File.write("sources_output.md", ordered_sources)
