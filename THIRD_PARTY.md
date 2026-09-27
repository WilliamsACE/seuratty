# Third-party notices

Seuratty itself is MIT licensed (see [LICENSE](LICENSE)). It also ships third-party code and
data. The notices below are copied from the notices that live in the project: the
"Third-party notices" block at the end of [js/main.js](js/main.js), the credits shown in the
app's Image to ASCII and Text panels, and the comment headers of the fonts inside
[data/fonts.json](data/fonts.json).

Entries marked **TODO: verify** are things the project does not record; they need to be checked
against the upstream source before publishing.

---

## asciify-them (MIT)

- Source: https://github.com/ndrscalia/asciify-them
- Used in: [js/image.js](js/image.js) — the Image to ASCII converter is a JavaScript port of
  its brightness ramp, charset presets, Sobel angles and Canny edge detection.

```
MIT License
Copyright (c) 2026 Andrea Scalia
Partially based on ascii-view by Xander Gouws, Copyright (c) 2025 Xander Gouws

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## ascii-view (MIT)

- Source: https://github.com/gouwsxander/ascii-view
- Used in: [js/image.js](js/image.js), indirectly — asciify-them is partially based on it.
- The project's notice records it as: "ascii-view (https://github.com/gouwsxander/ascii-view)
  is also MIT licensed, Copyright (c) 2025 Xander Gouws."

```
MIT License
Copyright (c) 2025 Xander Gouws

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## figlet.js (MIT)

- Source: https://github.com/patorjk/figlet.js (Patrick Gillespie and contributors).
- Bundled as: [js/figlet.js](js/figlet.js), a classic script that exposes `globalThis.__figlet`.
  It is used by [js/tools/text.js](js/tools/text.js) to render the Text tool.

```
The MIT License (MIT)

Copyright (C) 2014-present Patrick Gillespie and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## FIGlet fonts

[data/fonts.json](data/fonts.json) contains **83 FIGlet fonts by many different authors**. Each
font keeps its own comment header inside the JSON, with the credits its author wrote there; the
table below lists the author credits from those headers (trimmed to the author line where the
extracted text was not a credit). Every font listed has a credit line in its header.

Licensing notes that appear in the headers themselves:

- Most of the classic fonts carry the standard FIGlet permission line: "Permission is hereby
  given to modify this font, as long as the modifier's name is placed on a comment line."
- **ANSI Compact** states: "This font is free to use and distribute / MIT License".
- **Emboss** is not MIT: its header places it under the Do What The Fuck You Want To Public
  License, Version 2, as published by Sam Hocevar (http://sam.zoy.org/wtfpl/COPYING).
- **Efti Robot** states: "This font is (c) Michel Eftimakis 1995 -- Version 1.0 -- 11 may 1995".
  It does not grant permission explicitly; consider removing it if that is a concern.

The overall terms for the fonts are **TODO: verify**: the headers give credits, not a
single licence for the collection.

| Font | Credits, from the font header |
|---|---|
| Standard | Standard by Glenn Chappell & Ian Chai 3/93 -- based on Frank's .sig · Modified for figlet 2.2 by John Cowan &lt;cowan@ccil.org&gt; · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| Slant | Slant by Glenn Chappell 3/93 -- based on Standard · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| Big | Big by Glenn Chappell 4/93 -- based on Standard · Greek characters by Bruce Jakeway &lt;pbjakeway@neumann.uwaterloo.ca&gt; · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| Banner3 | banner3 by Merlin Greywolf merlin@brahms.udel.edu |
| Doom | DOOM by Frans P. de Vries &lt;fpv@xymph.iaf.nl&gt;  18 Jun 1996 · based on Big by Glenn Chappell 4/93 -- based on Standard |
| ANSI Compact | Font Author: Loic Cressot · This font is free to use and distribute / MIT License |
| Bloody | Figlet conversion by patorjk, April 17, 2008 |
| Colossal | Font modified June 17, 2007 by patorjk |
| Graffiti | This figlet font designed by Leigh Purdie (purdie@zeus.usq.edu.au) · 'fig-fonted' by Leigh Purdie and Tim Maggio (tim@claremont.com) · Font modified May 20, 2012 by patorjk |
| Larry 3D | larry3d.flf by Larry Gelberg (larryg@avs.com) · tweaked by Glenn Chappell &lt;ggc@uiuc.edu&gt; |
| Ogre | Standard by Glenn Chappell & Ian Chai 3/93 -- based on .sig of Frank Sheeran |
| Small | Small by Glenn Chappell 4/93 -- based on Standard · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| Speed | Speed by Claude Martins 2/95 -- based on Slant |
| Star Wars | starwars.flf by Ryan Youck (youck@cs.uregina.ca) Dec 25/1994 · Based on Big.flf by Glenn Chappell |
| Isometric1 | Figlet conversion by Kent Nassen (kentn@cyberspace.org), 8-10-94, based on the fonts posted by Lennert Stock |
| Epic | Epic by Claude Martins 12/94 |
| Block | Block by Glenn Chappell 4/93 -- straight version of Lean · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| DOS Rebel | Rebel by Valerie Mates (popcorn@cyberspace.org), based on a font by Ron Bliss · (who sometimes goes by the name "rebel" because his initials are REB). |
| Delta Corps Priest 1 | Font Author: CoSMiC cHiLD |
| Sub-Zero | "Sub-Zero" font by Sub-Zero · -&gt; Conversion to FigLet font by MEPH. (Part of ASCII Editor Service Pack I) |
| Poison | poison.flf composed into figlet by Vinney Thai &lt;ssfiit@eris.cc.umb.edu&gt; · poison font (numbers & puntuation marks) composed by Vinney Thai · poison font (uppercase characters) composed David Issel &lt;dissel@nunic.nu.edu&gt; |
| Rectangles | rectangles.flf by David Villegas &lt;mnementh@netcom.com&gt; 12/94 |
| Rozzo | rozzo.flf font by Mike Rosulek [unar2@sfa.ope.ed.gov] 1/12/95 |
| Roman | Roman by Nick Miners N.M.Miners@durham.ac.uk · Font modified June 17, 2007 by patorjk |
| Shadow | Shadow by Glenn Chappell 6/93 -- based on Standard & SmShadow · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter · Font modified June 17, 2007 by patorjk |
| Stop | Stop by David Walton &lt;walton@cs.ucdavis.edu&gt; · Derived from Rounded by Nick Miners N.M.Miners@durham.ac.uk |
| 3-D | 3-D font created by Daniel Henninger &lt;dahennin@eos.ncsu.edu&gt; · Font modified June 17, 2007 by patorjk |
| Alligator | Alligator by Simon Bradley &lt;syb3@aber.ac.uk&gt; |
| Crawford | Figlet conversion by Kent Nassen, knassen@umich.edu, 1/2/95 |
| Cyberlarge | Figlet conversion by Kent Nassen, kentn@cyberspace.org, 8-10-94 |
| Cybermedium | Figlet conversion by Kent Nassen, kentn@cyberspace.org, 8-11-94 |
| Chunky | Square by Chris Gill, 30-JUN-94 -- based on .sig of Jeb Hagan. · Font modified June 17, 2007 by patorjk |
| Electronic | Font Author: Derek Lemay &lt;THe PHaRCYDe&gt; |
| Lean | Lean by Glenn Chappell 4/93 -- based on various .sig's · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| Mini | Mini by Glenn Chappell 4/93 · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| Script | Script by Glenn Chappell 4/93 · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| Slant Relief | Mega-relief by Nick Bryant 12/9, dmc1@st-and.ac.uk for the moment. |
| Small Slant | SmSlant by Glenn Chappell 6/93 - based on Small & Slant · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| Train | Author :myflix · Changed 2012-05-21: Update to "!" character by patorjk |
| Univers | Univers by Normand Veilleux &lt;nveilleu@emr.ca&gt; · figletized by Glenn Chappell &lt;ggc@uiuc.edu&gt; January 12, 1994 |
| Merlin1 | Author : LG Beard · Font modified June 17, 2007 by patorjk |
| Nancyj-Fancy | Modified to make tabs blanks by Paul Burton &lt;solution@earthlink.net&gt; |
| Bulbhead | Bulbhead by Jef Poskanzer, 23jun94 · Update February 12, 2002 by Markus Gebhard markus@jave.de |
| Basic | basic.flf by Craig O'Flaherty &lt;cofl@it.ntu.edu.au&gt; · Font modified June 17, 2007 by patorjk |
| Broadway | Figlet translation by Kent Nassen, kentn@cyberspace.org, 1/2/95 |
| Fuzzy | fuzzy.flf by Juan Car (jc@juguete.quim.ucm.es) |
| Graceful | Graceful-6x4 by Mikhael Goikhman, http://migo.n3.net/, 20/Jan/2002. |
| Henry 3D | Characters by Henry Segerman henryseg@email.com, · Converted to FIGlet font by Markus Gebhard markus@jave.de |
| Rebel | Rebel by Valerie Mates (popcorn@cyberspace.org), based on a font by Ron Bliss · (who sometimes goes by the name "rebel" because his initials are REB). · UTF-8 conversion by Claudio Matsuoka (cmatsuoka@gmail.com) |
| Blocks | Author : myflix |
| Banner | banner.flf version 2 by Ryan Youck (youck@cs.uregina.ca) · Katakana characters by Vinney Thai &lt;ssfiit@eris.cs.umb.edu&gt; · Merged by John Cowan &lt;cowan@ccil.org&gt; |
| Bright | Bright Font by Dennis Monk  7/94 |
| Contessa | Contessa by Christopher Joseph Pirillo (pirillc2770@cobra.uni.edu) |
| Cricket | Cricket by Leslie Bates  Jan. 1, 1996 |
| DiamFont | Font Author: Diamond Planet |
| Dancing Font | Author : Myflix · Font modified June 17, 2007 by patorjk |
| Fire Font-k | Author : MJP · Based on Small.flf by Glenn Chappell 4/93 -- based on Standard · Font modified May 26, 2012 by patorjk |
| Fire Font-s | Author : MJP · Based on Small.flf by Glenn Chappell 4/93 -- based on Standard · Font modified May 26, 2012 by patorjk |
| Georgia11 | Georgia 11 by Richard Sabey &lt;cryptic_fan@hotmail.com&gt; 9.2003 |
| Kban | Kban by Randy Jae Weinstein |
| Keyboard | keyboard.flf composed by Vinney Thai &lt;ssfiit@eris.cc.umb.edu&gt; |
| Puffy | puffy.flf by Juan Car (jc@juguete.quim.ucm.es) |
| Pepper | pepper.flf by Dr. Pepper (mcscs1jcwj@dct.ac.uk) · Completed and ported to figlet by Juan Car (jc@juguete.quim.ucm.es) |
| Sweet | Author : myflix |
| Tinker-Toy | Tinker-toy by Wendell Hicken 11/93 (whicken@parasoft.com) |
| Whimsy | Figlet conversion by Kent Nassen, knassen@umich.edu |
| Wavy | Wavy by Brian Krog 10/05 |
| Varsity | Author : myflix |
| Tubular | TUBULAR by Ron Fritz 8/94 · Font modified June 17, 2007 by patorjk |
| Twisted | Author : LG Beard |
| Soft | Author : myflix · Font modified June 17, 2007 by patorjk · Font modified May 26, 2012 by patorjk |
| Swamp Land | Author : bpg |
| Stellar | STELLAR by Ron Fritz 8/94 · Font modified June 17, 2007 by patorjk |
| Ghost | Author : myflix · Font modified June 17, 2007 by patorjk · Font modified May 26, 2012 by patorjk |
| Fender | Fender by Scooter 8/94 (jkratten@law.georgetown.edu) |
| Efti Robot | This font is (c) Michel Eftimakis 1995 -- Version 1.0 -- 11 may 1995 · Font modified June 17, 2007 by patorjk |
| Emboss | Emboss by Sam Hocevar &lt;sam@hocevar.net&gt;, created September 30th, 2006. Licence: WTFPL v2 (not MIT) |
| Digital | Digital by Glenn Chappell 1/94 -- based on Bubble · Enhanced for Latin-2,3,4 by John Cowan &lt;cowan@ccil.org&gt; · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| Dot Matrix | dotmatrix.flf by Curtis Wanner (cwanner@acs.bu.edu) |
| Def Leppard | Def Leppard by Hanspeter Niederstrasser 2003-06-29 -- based on Standard · Font modified June 17, 2007 by patorjk |
| Cards | Author : myflix · Font Edited: Aug. 5, 2007 by PAT or JK |
| Bubble | Bubble by Glenn Chappell 4/93 · Enhanced for Latin-2,3,4 by John Cowan &lt;cowan@ccil.org&gt; · Modified by Paul Burton &lt;solution@earthlink.net&gt; 12/96 to include new parameter |
| Alpha | Alpha font by Lennert Stock · -&gt; Conversion to FigLet font by MEPH. (Part of ASCII Editor Service Pack I) · Font modified June 17, 2007 by patorjk |

---

## Acknowledgments

Thanks to everyone whose work made this project possible, including where no licence text is required. <3