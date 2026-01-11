#!/usr/bin/env ruby
# make_taaluma.rb – build A4/A5 PDF from Markdown + template.tex

require 'fileutils'
require 'tmpdir'
require 'pathname'
require 'open3'
require 'debug'

# If you have a separate file for this, you can require_relative 'helper_functions'
module HelperFunctions
  def self.get_git_root
    `git rev-parse --show-toplevel`.strip rescue Dir.pwd
  end
end

def split_title(h1)
  # Return (part, subtitle) split at first dash
  if h1.include?(" - ")
    part, sub = h1.split(" - ", 2)
  elsif h1.include?("-")
    part, sub = h1.split("-", 2)
  else
    part, sub = h1, ""
  end
  [part.to_s.strip, sub.to_s.strip]
end

def to_linux_path(win_path)
  # 1. Replace backslashes with forward slashes
  path = win_path.tr('\\', '/')
  
  # 2. Convert "C:/" to "/mnt/c/" (Common for WSL/Docker)
  path.gsub!(/^([A-Za-z]):\//) { "/#{$1.downcase}/" }
  
  path
end

def main
  if ARGV.length < 2
    abort "usage: make_taaluma.rb <markdown.md> <template.tex>"
  end

  md_path = Pathname.new(ARGV[0])
  # Building the path similar to your Python version
  tpl_base = Pathname.new(HelperFunctions.get_git_root) + "lehachnis-balev/templates"
  tpl_path = tpl_base + ARGV[1]

  abort "Markdown '#{md_path}' not found" unless md_path.exist?
  abort "Template '#{tpl_path}' not found" unless tpl_path.exist?

  # --- read markdown and extract first heading ---------------------------
  lines = File.readlines(md_path, encoding: "utf-8")

  # --- create temp files --------------------------------------------------
  Dir.mktmpdir("taaluma_") do |tmp_dir|
    tmp_path = Pathname.new(tmp_dir)
    
    md_tmp   = tmp_path + "body.md"
    tpl_tmp  = tmp_path + "template.tex"

    # Find the first H1 line
    h1_line = lines.find { |ln| ln.lstrip.start_with?("# ") }
    tpl = tpl_path

    if h1_line
      h1_text = h1_line.lstrip.delete_prefix("# ").strip
      part, subtitle = split_title(h1_text)

      title_block = <<~LATEX
        \\begin{center}
        {\\headingfont\\fontsize{47}{19}\\selectfont #{part}\\par}
        {\\headingfont\\fontsize{20}{19}\\selectfont #{subtitle}\\par}
        \\end{center}\\vspace{1cm}
      LATEX

      File.open(tpl_tmp, "w", encoding: "utf-8") do |f_out|
        File.foreach(tpl_path) do |line|
          puts line
          f_out.write(line)
          if line.strip == "% <subtitle>"
            f_out.write(title_block)
          end
        end
      end
      tpl = tpl_tmp
    end

    # remove the H1 from markdown body
    body_lines = lines.reject { |ln| ln == h1_line }
    File.write(md_tmp, body_lines.join, encoding: "utf-8")

    # --- run pandoc ---------------------------------------------------------
    pdf_out = md_path.sub_ext(".pdf")
    cmd = [
      "pandoc", to_linux_path(md_tmp.to_s),
      "--template", to_linux_path(tpl.to_s),
      "--pdf-engine", "xelatex",
      "-o", pdf_out.to_s
    ]

    puts "Running Pandoc..."
    puts cmd.join(" ")
    system(*cmd) || abort("Pandoc failed to generate PDF")

    # --- open the PDF -------------------------------------------------------
    puts "Created #{pdf_out}"
    case RbConfig::CONFIG['host_os']
    when /mswin|msys|mingw|cygwin|bccwin|wince|emc/
      system("start", pdf_out.to_s)
    when /darwin/
      system("open", pdf_out.to_s)
    else # linux, freebsd, etc.
      system("xdg-open", pdf_out.to_s)
    end
  end
end

if __FILE__ == $0
  main
end
