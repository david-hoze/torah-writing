#!/usr/bin/env ruby
# encoding: UTF-8

require_relative 'helpers'
include MyHelpers

FOOTNOTE_SOURCE_PREFIX = "## הערה "
NON_TEXT_CHAR = /[^\p{L}\p{N}\p{M}]/
TEXT_CHAR = /[\p{L}\p{N}\p{M}]/

LEFT  = /(?<=#{NON_TEXT_CHAR}|^)"/
RIGHT = /"(?=#{NON_TEXT_CHAR}|$)/
HEBREW_ABBREVIATION = /#{TEXT_CHAR}"#{TEXT_CHAR}/

BALANCED_QUOTES = /(?<quotation> #{LEFT} (?: \g<quotation> | [^"] | #{HEBREW_ABBREVIATION} )* #{RIGHT} )/x
PARANTHESES = /(?<parentheses>\s*\((?<paren_inner_text>[^)]+)\))/


abort "usage: script.rb <article.md> [sources.md]" if ARGV.empty?

text = File.read(ARGV[0], encoding: "UTF-8")

mapping = text
  .scan(/\[\^(\d+)\]/)
  .uniq
  .map { _1[0].to_i }  # slice "[^n]" -> n
  .zip((1..).lazy)
  .to_h

ordered_text = text.gsub(/\[\^(\d+)\]/) { "[^#{mapping[$1.to_i]}]" }

ordered_footnotes = ordered_text.
  scan(/^\[\^(\d+)\]:(.*)$/)
  .sort_by { |num, _| num.to_i }
  .map { |num, content| "[^#{num}]:#{content}" }
  .join("\n\n")
  .gsub(/הערה (\d+)/) { "הערה #{mapping[$1.to_i]}" }


def remove_quotations_with_following_parentheses(text)
  debug = false
  text.gsub(/#{BALANCED_QUOTES}\s*#{PARANTHESES}/) do 
    puts "Matched quotation: '#{$~[:quotation]}'" if debug
    puts "Matched parentheses: '#{$~[:paren_inner_text]}'" if debug
    citations = handle_citation_group($~[:paren_inner_text]).select { |c| MyHelpers.is_citation(c) }
    puts "Citations found: #{citations.inspect}" if debug
    citations.count <= 1 ? "" : "טקסט בשביל הציטוטים" << "(" << citations[1..-1].join(", ") << ")"
  end
end

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

def handle_citation_group(citation_group)
  citation_group
    .split(",")
    .map{_1.strip.gsub(/ו?ע"ע/,"").strip}
    .each_with_object([]){|p,a| p.size<=8 && a.any? ? a[-1]<<", #{p}" : a<<p}
end

footnote_citations = ordered_footnotes
  .scan(/^\[\^(\d+)\]:(.*)$/)
  .reduce({}) do |acc, (num, content)|
    citations = content
      .then { remove_quotations_with_following_parentheses(_1) }
      .scan(/\(([^)]+)\)/)
      .map { handle_citation_group(_1[0]) }
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
