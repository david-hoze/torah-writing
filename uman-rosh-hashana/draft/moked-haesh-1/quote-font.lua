function BlockQuote(el)
  return pandoc.RawBlock('latex',
    '\\begingroup\n' ..
    '\\quotefont\\small\\itshape\n' ..  -- הפונט שונה + גודל קטן
    pandoc.utils.stringify(el.content) ..
    '\\endgroup\n')
end
