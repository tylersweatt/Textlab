# TextLab

TextLab is a Bible bracketing and phrasing workbook for sermon preparation. It runs in the browser on an iPhone and a Mac. Studies stay on that device. The site is a set of static files, with no server of its own.

The public address is [https://tylersweatt.github.io/Textlab/](https://tylersweatt.github.io/Textlab/).

## Turn on GitHub Pages

The site appears only after this pull request is merged and Pages is switched on.

1. Review and merge the pull request into `main`.
2. On GitHub, open the Textlab repository and click **Settings**, then **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open the **Actions** tab. The workflow **Deploy GitHub Pages** runs on every update to `main`. Wait until the deploy job is green.
5. Open [https://tylersweatt.github.io/Textlab/](https://tylersweatt.github.io/Textlab/).

The first visit needs a network connection so the phone or computer can store the app. After that, saved studies open with no connection. Looking up a new ESV passage still needs a connection.

## Get a free ESV API key

1. Open [Create an ESV API application](https://api.esv.org/account/create-application/) and sign in with a free Crossway account.
2. Create an application and copy the key it gives you.
3. In TextLab, open **Settings**, paste the key, and tap **Save settings**.

The key is saved only in that browser. It is sent to `api.esv.org` when you look up a passage. It is not stored in this repository, and an exported study does not contain it. Enter the key once on the phone and once on the Mac.

Crossway allows an app to keep at most 500 ESV verses on a device, and not more than half of any one book. TextLab refuses to save a lookup that would pass 500 verses. Delete or export an older ESV study to make room. Every ESV study shows the copyright notice returned with the text, or Crossway’s standard notice, and a link to [ESV.org](https://www.esv.org/).

You can ignore the key completely. Choose **Paste text** when you create a study and work from whatever you paste. A public-domain KJV sample of John 3:16 is already there so you can try the tools first.

## Install on iPhone

1. Open **Safari**. The home-screen install uses Safari.
2. Go to [https://tylersweatt.github.io/Textlab/](https://tylersweatt.github.io/Textlab/).
3. Tap the **Share** button (the square with the arrow).
4. Tap **Add to Home Screen**.
5. Leave the name as TextLab and tap **Add**.
6. Open TextLab from the new icon. It opens full screen. Studies stay on the phone.

## Install on Mac

1. Open **Safari**.
2. Go to [https://tylersweatt.github.io/Textlab/](https://tylersweatt.github.io/Textlab/).
3. Click the **Share** button in the toolbar, then **Add to Dock**. On some macOS versions the same command is in the **File** menu.
4. Open TextLab from the Dock.

## Move studies between phone and Mac

1. Open the study and tap **File**.
2. Tap **Export this study**. To move every study, tap **Export all studies**.
3. On iPhone, the share sheet opens. Tap **AirDrop** and choose the Mac, or tap **Save to Files** and choose a folder in iCloud Drive.
4. On the other device, open TextLab, tap **Studies** or **File**, then **Import**, and choose that JSON file.

If a share sheet does not appear, the browser downloads the file instead. From the Files app, AirDrop it or copy it through iCloud Drive the same way.

The API key does not travel inside the file. Add it in Settings on each device when you want ESV lookup there.

## Studying a passage

1. Tap **Studies**, then **New study**. Look up a reference, or paste the text. **Divide into clauses** splits at conjunctions such as for, but, because, and so that.
2. Tap any later word in a line to start a new proposition there. **Merge with next** joins it back. On a pasted study you can also edit the wording. An ESV study keeps the wording Crossway sent. Put your own words in notes.
3. Tap the circle beside a line, then the circle beside the next adjacent line. Tap **Bracket**.
4. Choose one of the eighteen relationships used in Biblearc bracketing. Series, Progression, and Alternative are coordinate, so they start out marked equal. The others support a main point.
5. Mark **Main is first**, **Main is last**, or **Both equal**. You can change that whenever you want.
6. Keep bracketing groups the same way until one bracket covers the passage. Notes sit on propositions and on brackets.
7. **Phrasing** is a separate view. Indent a line under the line it supports. There are no arrows.
8. **File**, then **Print or save as PDF**, for a page you can take into the pulpit. On a Mac, the print dialog can save a PDF. On iPhone, use the share button in the print preview and choose Save to Files. **Download diagram** saves an SVG image. **Copy outline** puts an indented text outline on the clipboard.

**Undo** and **Redo** apply to the work in this visit. The study itself is saved on the device as you go.

Light and dark follow the phone or computer until you choose one in Settings, or with the Light / Dark button.

## Tests

From the project folder:

```bash
node --test
```

The tests cover bracketing, dominant and equal marking, undo, clause splitting, the ESV request and the documented passage response, the 500-verse limit, and import and export. A browser check confirms the page renders when Chrome is installed.
