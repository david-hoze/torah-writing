#!/usr/bin/env ruby
# encoding: UTF-8

require "logger"
L = Logger.new($stderr); L.level = Logger::WARN

REF   = /\[\^([^\]]+)\]/
DEF   = /^\[\^([^\]]+)\]:(.*)$/
SRC   = "## הערה "
QH    = ">### "
QCIT  = /"[^"]+"\s+\([^)]+\)/
PAREN = /\(([^)]+)\)/

def remap(text)
  t,f,i,n = {},{},[],1
  text.each_line do |l|
    if (m = DEF.match(l))
      t[m[1]] ? f[t[m[1]]] = "[^#{t[m[1]]}]:#{m[2]}" : L.warn("Dangling footnote #{m[1]}")
    else
      i << l.gsub(REF){ |x|
        k = $1; t[k] ||= (n+=1)-1; "[^#{t[k]}]"
      }
    end
  end
  [i.join, f, t]
end

def fix_refs(t, tr)
  t.gsub(/הערה (\d+)/){ tr[$1] ? "הערה #{tr[$1]}" : $& }
end

def load_sources(txt, tr)
  cur=nil
  txt.each_line.each_with_object({}) do |l,h|
    if l.start_with?(SRC)
      k = l[SRC.size..].strip
      cur = tr[k] or (L.warn("Unknown source #{k}"); next)
      h[cur] = "#{SRC}#{cur}\n"
    elsif cur
      h[cur] << l
    end
  end
end

def split_cits(s)
  s.split(",").map{_1.strip.gsub(/וע?"ע"?/,"").strip}
   .each_with_object([]){|p,a| p.size<=5 && a.any? ? a[-1]<<", #{p}" : a<<p}
end

def extract(txt)
  txt.gsub(QCIT,"").scan(PAREN).flat_map{ split_cits(_1[0]) }
end

abort "usage: script.rb <article.md> [sources.md]" if ARGV.empty?

body,notes,tr = remap(File.read(ARGV[0], encoding:"UTF-8"))
notes.transform_values!{ fix_refs(_1,tr) }

File.write("article_output.md",
  body + notes.sort.map{ "\n#{_2}\n" }.join,
  encoding:"UTF-8"
)

if ARGV[1]
  srcs = load_sources(File.read(ARGV[1], encoding:"UTF-8"), tr)
  File.write("sources_output.md", srcs.sort.map(&:last).join, encoding:"UTF-8")

  File.open("citation-mismatch.md","w",encoding:"UTF-8") do |o|
    srcs.each do |n,s|
      next unless notes[n]
      actual = s.each_line.filter_map { |l|
        l[QH.size..].strip if l.start_with?(QH)
      }

      extract(notes[n]).zip(actual).each{ |e,a| o.puts "Mismatch #{n}\n#{e}\n#{a}\n\n" unless e==a }
    end
  end
end
