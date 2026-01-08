#!/usr/bin/env ruby
# encoding: UTF-8

FOOTNOTE_SOURCE_PREFIX = "## הערה "

text = "Some text[^2] is nice[^1]\n \n[^1]: nice\n[^2]: text\n"

sources = <<~HEREDOC
# Sources
## footnote 1
  nice
## footnote 2 
  text
HEREDOC

abort "usage: script.rb <article.md> [sources.md]" if ARGV.empty?

text = File.read(ARGV[0], encoding: "UTF-8")

mapping = text
  .scan(/(\[\^\d+\])/)
  .uniq
  .map { _1[0][2..-2].to_i }  # slice "[^n]" -> n
  .zip((1..).lazy)
  .to_h

ordered_text = text
  .scan(/(\[\^(\d+)\])|([^\[]+)/)
  .map { |ref, ref_num, other| ref ? "[^#{mapping[ref_num.to_i]}]" : other }
  .join

ordered_footnotes = ordered_text.
  scan(/^\[\^(\d+)\]:(.*)$/)
  .sort_by { |num, _| num.to_i }
  .map { |num, content| "[^#{num}]:#{content}" }
  .join("\n\n")

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

File.write("sources_output.md", ordered_sources)
