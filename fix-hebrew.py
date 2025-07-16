import pyperclip

def fix_hebrew_encoding():
    """
    Reads garbled Hebrew text from the clipboard, fixes the encoding,
    and copies the corrected text back to the clipboard.
    
    The issue happens when text encoded in 'windows-1255' (Hebrew)
    is incorrectly interpreted as 'latin-1' or a similar Western encoding.
    This script reverses the process to recover the original text.
    """
    try:
        # 1. קריאת הטקסט המשובש מהלוח
        garbled_text = pyperclip.paste()
        if not garbled_text:
            print("הלוח (clipboard) ריק. יש להעתיק טקסט קודם.")
            return

        # 2. ה"קסם": המרת הקידוד
        #    - מקודדים את הטקסט בחזרה לבייטים לפי הקידוד השגוי (latin-1)
        #    - מפענחים את הבייטים באמצעות הקידוד הנכון (windows-1255)
        corrected_text = garbled_text.encode('latin-1').decode('windows-1255')

        # 3. העתקת הטקסט המתוקן בחזרה ללוח
        pyperclip.copy(corrected_text)

        # 4. הדפסת התוצאה למשתמש
        print("ההמרה הושלמה בהצלחה!")
        print("-" * 20)
        print(f"טקסט מקורי: {garbled_text}")
        print(f"טקסט מתוקן: {corrected_text}")
        print("-" * 20)
        print("הטקסט המתוקן הועתק ללוח ומוכן להדבקה.")

    except Exception as e:
        print(f"אירעה שגיאה: {e}")
        print("ודא שהעתקת טקסט כלשהו ושהספרייה pyperclip מותקנת כראוי.")

if __name__ == "__main__":
    fix_hebrew_encoding()
