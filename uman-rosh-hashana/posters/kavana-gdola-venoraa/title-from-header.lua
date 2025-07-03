-- title-from-header.lua
-- לוקח את ה‑Header הראשון (H1) והופך אותו למטא־דאטה 'title'.
local first_h1 = nil

function Header (el)
  if el.level == 1 and not first_h1 then
    first_h1 = pandoc.utils.stringify(el.content)
    return {}            -- מוחק את הכותרת מה‑body
  end
end

function Meta (meta)
  if first_h1 then
    meta.title = first_h1
  end
  return meta
end
