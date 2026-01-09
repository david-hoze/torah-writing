#!/usr/bin/env ruby
# encoding: UTF-8

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
      .gsub(/"[^"]+"\s+\([^)]+\)/, "")
      .scan(/\(([^)]+)\)/)
      .map do |citation_group|
        citation_group[0]
          .split(",")
          .map{_1.strip.gsub(/וע?"ע"?/,"").strip}
          .each_with_object([]){|p,a| p.size<=5 && a.any? ? a[-1]<<", #{p}" : a<<p}
      end
      .flatten

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
