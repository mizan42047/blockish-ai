/**
 * Migration v2: Replace QUICK REFERENCE sections with richer attribute
 * descriptions, explicit JSON examples, and ✓/✗ wrong-vs-right guidance
 * targeting the specific mistakes Gemma 4 / small models make.
 */

import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: "postgres://postgres:admin@localhost:5432/blockish_ai",
});

// ─── New QUICK REFERENCE sections ─────────────────────────────────────────────

const QR = {};

// ─── Container ────────────────────────────────────────────────────────────────
QR["Container"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/container\`
**Accepts inner blocks:** all blocks (universal wrapper)

---

### Attributes

**\`isVariationPicked\`** — boolean
Always set to \`true\` in generated schemas. Skips the editor placeholder screen.
✓ \`"isVariationPicked": true\`

**\`tagName\`** — \`{label: string, value: string}\`
The HTML tag output. Must be an object — never a plain string.
✓ \`"tagName": { "label": "Section", "value": "section" }\`
✗ \`"tagName": "section"\` ← wrong, must be object
Values: div · section · article · header · footer · main · aside

**\`containerWidth\`** — string
Controls the width class of the container.
✓ \`"containerWidth": "alignfull"\`
Values: \`alignfull\` (full width) · \`alignwide\` (wide) · \`align-custom-width\` (custom)

**\`customWidthContainer\`** — responsive string object
Only use when \`containerWidth\` is \`"align-custom-width"\`.
✓ \`"customWidthContainer": { "Desktop": "1200px", "Mobile": "100%" }\`

**\`layout\`** — responsive \`{label, value}\` object
Sets the layout mode. Responsive — use Desktop/Tablet/Mobile keys.
✓ \`"layout": { "Desktop": { "label": "Flex", "value": "flex" } }\`
✗ \`"layout": "flex"\` ← wrong, must be responsive {label,value} object
Values: block · flex · grid

**\`flexDirection\`** — responsive \`{label, value}\` object
Only meaningful when layout is flex.
✓ \`"flexDirection": { "Desktop": { "label": "Row", "value": "row" } }\`
Values: row · column · row-reverse · column-reverse

**\`justifyContent\`** — responsive \`{label, value}\` object
Only meaningful when layout is flex or grid.
✓ \`"justifyContent": { "Desktop": { "label": "Center", "value": "center" } }\`
Values: flex-start · center · flex-end · space-between · space-around · space-evenly

**\`alignItems\`** — responsive \`{label, value}\` object
✓ \`"alignItems": { "Desktop": { "label": "Center", "value": "center" } }\`
Values: flex-start · center · flex-end · stretch · baseline

**\`gap\`** — responsive CSS string object
Gap between child items when layout is flex or grid.
✓ \`"gap": { "Desktop": "24px", "Mobile": "16px" }\`
✗ \`"gap": "24px"\` ← wrong, must be wrapped in device key

**\`classManager\`** — array of \`{id, title}\`
Attaches root Class Manager classes to this block.
✓ \`"classManager": [{ "id": 101, "title": "bk-hero-section" }]\`
✗ \`"classNames": ["bk-hero-section"]\` ← wrong key name

**\`classManagerSubselector\`** — array of \`{id, title, parent}\`
Attaches subselector classes. Each must have a parent id pointing to a root class.
✓ \`"classManagerSubselector": [{ "id": 102, "title": ".bk-hero-title", "parent": 101 }]\`

### Minimal Schema
\`\`\`json
{
  "name": "blockish/container",
  "attributes": {
    "isVariationPicked": true,
    "tagName": { "label": "Section", "value": "section" },
    "containerWidth": "alignfull",
    "layout": { "Desktop": { "label": "Flex", "value": "flex" } },
    "flexDirection": { "Desktop": { "label": "Column", "value": "column" } },
    "alignItems": { "Desktop": { "label": "Center", "value": "center" } }
  },
  "innerBlocks": []
}
\`\`\`

---
`;

// ─── Heading ──────────────────────────────────────────────────────────────────
QR["Heading"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/heading\`
**Inner blocks:** none — headings have no children

---

### Attributes

**\`content\`** — string
The heading text. Plain string — no HTML tags, no child blocks.
✓ \`"content": "Build WordPress Pages Faster"\`
✗ \`"innerBlocks": [{ "name": "Text" ... }]\` ← wrong, text goes in content attribute

**\`tag\`** — \`{label: string, value: string}\`
The HTML tag. Must be an object — never a level number.
✓ \`"tag": { "label": "H1", "value": "h1" }\`
✗ \`"level": 1\` ← wrong, Blockish uses tag not level
✗ \`"tag": "h1"\` ← wrong, must be object
Values: h1 · h2 · h3 · h4 · h5 · h6 · p · span · div

**\`alignment\`** — responsive plain-string object
Text alignment per device. Values are plain strings — NOT {label,value} objects.
✓ \`"alignment": { "Desktop": "center", "Mobile": "left" }\`
✗ \`"alignment": { "Desktop": { "label": "Center", "value": "center" } }\` ← wrong for this control
✗ \`"alignment": "center"\` ← wrong, must be wrapped in device key
Values: left · center · right

**\`typography\`** — string (Group Control)
Serialised typography string. Leave as empty string — do not invent a value.
✓ \`"typography": ""\`
✗ \`"typography": { "fontSize": "56px" }\` ← wrong, this is a group control string

### Styling headings
Use Class Manager to style headings — not inline style attributes.
✓ Use \`classManager\` with Class Manager attributes (fontSize, color, margin, etc.)
✗ \`"style": { "fontSize": "56px" }\` ← not a valid heading attribute

### Minimal Schema
\`\`\`json
{
  "name": "blockish/heading",
  "attributes": {
    "content": "Build WordPress Pages Faster",
    "tag": { "label": "H1", "value": "h1" },
    "alignment": { "Desktop": "center" }
  },
  "innerBlocks": []
}
\`\`\`

---
`;

// ─── Button ───────────────────────────────────────────────────────────────────
QR["Button"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/button\`
**Inner blocks:** none

---

### Attributes

**\`text\`** — string
The button label text.
✓ \`"text": "Get Started"\`

**\`url\`** — object with url, newTab, noFollow, customAttributes
Always use the full object shape — not a plain string.
✓ \`"url": { "url": "#", "newTab": false, "noFollow": false, "customAttributes": [] }\`
✗ \`"url": "#"\` ← wrong, must be the full url object
✗ \`"href": "#"\` ← wrong key name

**\`icon\`** — \`{viewBox: number[], path: string}\`
Only set when a valid SVG icon is provided in assets. Never invent SVG path data.
✓ \`"icon": { "viewBox": [0, 0, 24, 24], "path": "M5 12h14..." }\`
✗ invent a path string ← never do this

**\`iconPosition\`** — responsive \`{label, value}\` object
Position of the icon relative to the text.
✓ \`"iconPosition": { "Desktop": { "label": "Row", "value": "row" } }\`
Values: row (icon right) · row-reverse (icon left) · column (icon above) · column-reverse (icon below)

### Styling buttons
Use Class Manager for all visual styling — not inline style attributes.
✓ Use Class Manager with \`padding\`, \`borderRadius\`, \`customCss\`, etc.
✗ \`"style": { "background": "#2563eb" }\` ← not a valid button attribute

### Minimal Schema
\`\`\`json
{
  "name": "blockish/button",
  "attributes": {
    "text": "Get Started",
    "url": { "url": "#", "newTab": false, "noFollow": false, "customAttributes": [] }
  },
  "innerBlocks": []
}
\`\`\`

---
`;

// ─── Image ────────────────────────────────────────────────────────────────────
QR["Image"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/image\`
**Inner blocks:** none

---

### Attributes

**\`image\`** — object
Stores all image data. For external/provided URLs use the simple shape.
✓ External image: \`"image": { "url": "https://example.com/photo.jpg", "alt": "Description" }\`
✓ WP attachment: \`"image": { "id": 123, "url": "...", "alt": "...", "width": 1200, "height": 800 }\`
✗ \`"src": "..."\` ← wrong key, use image.url
✗ invent a URL ← never invent URLs; only use provided asset URLs

**\`alt\`** — string
Alt text override. Optional if already set in image object.
✓ \`"alt": "Team working together"\`

**\`caption\`** — string
Caption text below the image.
✓ \`"caption": "Photo credit: Unsplash"\`

**\`displayCaption\`** — boolean
Whether to show the caption.
✓ \`"displayCaption": true\`

### Minimal Schema
\`\`\`json
{
  "name": "blockish/image",
  "attributes": {
    "image": { "url": "https://provided-url.com/image.jpg", "alt": "Alt text" }
  },
  "innerBlocks": []
}
\`\`\`

---
`;

// ─── Icon ─────────────────────────────────────────────────────────────────────
QR["Icon"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/icon\`
**Inner blocks:** none

---

### Attributes

**\`icon\`** — \`{viewBox: number[], path: string}\`
The SVG icon data. Only use icons from provided assets — never invent path data.
✓ \`"icon": { "viewBox": [0, 0, 24, 24], "path": "M5 12h14M12 5l7 7-7 7" }\`
✗ invent or guess an SVG path ← never do this

**\`url\`** — object (optional)
Makes the icon a link. Same shape as Button url.
✓ \`"url": { "url": "https://example.com", "newTab": true, "noFollow": false, "customAttributes": [] }\`

**\`iconSize\`** — responsive CSS string object
Icon dimensions. Plain CSS string per device — NOT a {value, unit} object.
✓ \`"iconSize": { "Desktop": "40px", "Mobile": "28px" }\`
✗ \`"iconSize": { "Desktop": { "value": 40, "unit": "px" } }\` ← wrong shape

**\`iconColor\`** — string
Hex color for the icon fill.
✓ \`"iconColor": "#2563eb"\`

### Minimal Schema
\`\`\`json
{
  "name": "blockish/icon",
  "attributes": {
    "icon": { "viewBox": [0, 0, 24, 24], "path": "..." },
    "iconSize": { "Desktop": "40px" },
    "iconColor": "#2563eb"
  },
  "innerBlocks": []
}
\`\`\`

---
`;

// ─── Icon List ────────────────────────────────────────────────────────────────
QR["Icon List"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/icon-list\`
**Child block:** \`blockish/icon-list-item\` — must only be used inside this block

---

### Parent Attributes

**\`layout\`** — string
Direction of the list.
✓ \`"layout": "column"\`
Values: column · row

**\`gap\`** — responsive CSS string object
Space between items.
✓ \`"gap": { "Desktop": "12px" }\`

**\`iconSize\`** — responsive CSS string object
Sets icon size for all items.
✓ \`"iconSize": { "Desktop": "20px" }\`

**\`iconColor\`** — string
Hex color applied to all item icons.
✓ \`"iconColor": "#2563eb"\`

---

### Child Attributes (blockish/icon-list-item)

**\`text\`** — string
The item label text.
✓ \`"text": "Fast page load times"\`

**\`icon\`** — \`{viewBox: number[], path: string}\`
Icon for this item. Only use provided assets.
✓ \`"icon": { "viewBox": [0, 0, 24, 24], "path": "..." }\`

**\`url\`** — object (optional)
Makes the item a link.
✓ \`"url": { "url": "#", "newTab": false, "noFollow": false, "customAttributes": [] }\`

### Minimal Schema
\`\`\`json
{
  "name": "blockish/icon-list",
  "attributes": { "layout": "column" },
  "innerBlocks": [
    {
      "name": "blockish/icon-list-item",
      "attributes": { "text": "First benefit" },
      "innerBlocks": []
    },
    {
      "name": "blockish/icon-list-item",
      "attributes": { "text": "Second benefit" },
      "innerBlocks": []
    }
  ]
}
\`\`\`

---
`;

// ─── Video ────────────────────────────────────────────────────────────────────
QR["Video"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/video\`
**Inner blocks:** none

---

### Attributes

**\`sourceType\`** — \`{label: string, value: string}\`
The video source type. Must be an object — never a plain string.
✓ \`"sourceType": { "label": "YouTube", "value": "youtube" }\`
✗ \`"sourceType": "youtube"\` ← wrong, must be object
Values: youtube · vimeo · selfHosted

**\`youtubeUrl\`** — string
YouTube video URL. Only set when sourceType is youtube.
✓ \`"youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID"\`

**\`vimeoUrl\`** — string
Vimeo video URL. Only set when sourceType is vimeo.
✓ \`"vimeoUrl": "https://vimeo.com/VIDEO_ID"\`

**\`selfHostedVideo\`** — object
Self-hosted video data. Only set when sourceType is selfHosted. Only use provided assets.
✓ \`"selfHostedVideo": { "url": "https://provided-url.com/video.mp4", "alt": "Demo video" }\`
✗ invent a video URL ← never do this

**\`autoplay\`** — boolean · **\`muted\`** — boolean · **\`loop\`** — boolean · **\`controls\`** — boolean
Playback behaviour flags.
✓ \`"autoplay": false, "muted": false, "loop": false, "controls": true\`

### Minimal Schema
\`\`\`json
{
  "name": "blockish/video",
  "attributes": {
    "sourceType": { "label": "YouTube", "value": "youtube" },
    "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
    "controls": true
  },
  "innerBlocks": []
}
\`\`\`

---
`;

// ─── Google Map ───────────────────────────────────────────────────────────────
QR["Google Map"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/google-map\`
**Inner blocks:** none

---

### Attributes

**\`mapUrl\`** — string
The Google Maps embed URL (the iframe src value).
✓ \`"mapUrl": "https://www.google.com/maps/embed?pb=ENCODED_PARAMS"\`
✗ \`"mapUrl": "https://maps.google.com/..."\` ← wrong, must be the embed URL format

**\`mapHeight\`** — responsive CSS string object
Height of the map iframe.
✓ \`"mapHeight": { "Desktop": "450px", "Mobile": "300px" }\`
✗ \`"mapHeight": "450px"\` ← wrong, must be wrapped in device key

### Minimal Schema
\`\`\`json
{
  "name": "blockish/google-map",
  "attributes": {
    "mapUrl": "https://www.google.com/maps/embed?pb=ENCODED_LOCATION",
    "mapHeight": { "Desktop": "450px" }
  },
  "innerBlocks": []
}
\`\`\`

---
`;

// ─── Rating ───────────────────────────────────────────────────────────────────
QR["Rating"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/rating\`
**Inner blocks:** none

---

### Attributes

**\`rating\`** — number
The current rating value. Supports 0.5 increments. Must not exceed scale.
✓ \`"rating": 4.5\`

**\`scale\`** — number (1–10)
Total number of rating icons shown. Default is 5.
✓ \`"scale": 5\`

**\`icon\`** — \`{viewBox: number[], path: string}\`
The icon used for each rating unit. Only use provided assets.
✓ \`"icon": { "viewBox": [0, 0, 24, 24], "path": "..." }\`
✗ invent SVG path data ← never do this

**\`iconSize\`** — responsive CSS string object
Size of each rating icon.
✓ \`"iconSize": { "Desktop": "24px" }\`
✗ \`"iconSize": { "Desktop": { "value": 24, "unit": "px" } }\` ← wrong shape

**\`activeColor\`** — string
Color of filled/active icons.
✓ \`"activeColor": "#facc15"\`

**\`inactiveColor\`** — string
Color of empty/inactive icons.
✓ \`"inactiveColor": "#e5e7eb"\`

### Minimal Schema
\`\`\`json
{
  "name": "blockish/rating",
  "attributes": {
    "rating": 4.5,
    "scale": 5,
    "activeColor": "#facc15"
  },
  "innerBlocks": []
}
\`\`\`

---
`;

// ─── Counter ──────────────────────────────────────────────────────────────────
QR["Counter"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/counter\`
**Inner blocks:** none

---

### Attributes

**\`startNumber\`** — number
Animation start value. Usually 0.
✓ \`"startNumber": 0\`

**\`endNumber\`** — number
The final number displayed after animation.
✓ \`"endNumber": 500\`

**\`prefix\`** — string
Text shown before the number.
✓ \`"prefix": "$"\` or \`"prefix": ""\`

**\`suffix\`** — string
Text shown after the number.
✓ \`"suffix": "+"\` or \`"suffix": "k"\`

**\`thousandSeparator\`** — boolean
Whether to show comma separators for thousands.
✓ \`"thousandSeparator": true\`

**\`decimals\`** — number
Number of decimal places.
✓ \`"decimals": 0\`

**\`animationDuration\`** — number
Duration of count-up animation in seconds.
✓ \`"animationDuration": 2\`

**\`title\`** — string
Label shown next to or below the number.
✓ \`"title": "Happy Clients"\`

**\`titlePosition\`** — string
Where the title appears relative to the number.
✓ \`"titlePosition": "before"\`
Values: before · after · start · end

**\`titleTag\`** — \`{label: string, value: string}\`
HTML tag for the title element. Must be an object.
✓ \`"titleTag": { "label": "H3", "value": "h3" }\`
✗ \`"titleTag": "h3"\` ← wrong, must be object

### Minimal Schema
\`\`\`json
{
  "name": "blockish/counter",
  "attributes": {
    "endNumber": 500,
    "suffix": "+",
    "title": "Happy Clients",
    "titleTag": { "label": "H3", "value": "h3" }
  },
  "innerBlocks": []
}
\`\`\`

---
`;

// ─── Progress Bar ─────────────────────────────────────────────────────────────
QR["Progress Bar"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/progress-bar\`
**Inner blocks:** none

---

### Attributes

**\`title\`** — string
Label shown above or beside the bar.
✓ \`"title": "Web Design"\`

**\`percentage\`** — number (0–100)
The fill level of the progress bar.
✓ \`"percentage": 90\`

**\`innerText\`** — string
Text shown inside the filled portion of the bar. Optional.
✓ \`"innerText": "Web Designer"\` or \`"innerText": ""\`

**\`showPercentage\`** — boolean
Whether to show the percentage value at the end of the fill.
✓ \`"showPercentage": true\`

**\`animationDuration\`** — number
Duration of fill animation in seconds.
✓ \`"animationDuration": 2\`

**\`titlePosition\`** — string
Where the title appears relative to the bar.
✓ \`"titlePosition": "before"\`
Values: before · after · start · end

**\`titleTag\`** — \`{label: string, value: string}\`
HTML tag for the title. Must be an object.
✓ \`"titleTag": { "label": "H4", "value": "h4" }\`
✗ \`"titleTag": "h4"\` ← wrong, must be object

**\`trackHeight\`** — responsive CSS string object
Height of the progress bar track.
✓ \`"trackHeight": { "Desktop": "12px" }\`

### Minimal Schema
\`\`\`json
{
  "name": "blockish/progress-bar",
  "attributes": {
    "title": "Web Design",
    "percentage": 90,
    "showPercentage": true,
    "titleTag": { "label": "H4", "value": "h4" }
  },
  "innerBlocks": []
}
\`\`\`

---
`;

// ─── Social Icons ─────────────────────────────────────────────────────────────
QR["Social Icons"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/social-icons\`
**Child block:** \`blockish/social-icon-item\` — must only be used inside this block

---

### Parent Attributes

**\`shape\`** — string
Shape of the icon container.
✓ \`"shape": "circle"\`
Values: circle · square · rounded

**\`colorType\`** — string
Whether to use official brand colors or a custom color.
✓ \`"colorType": "official"\`
Values: official · custom

**\`size\`** — responsive CSS string object
Size of the icon container (the circle/square wrapper).
✓ \`"size": { "Desktop": "40px" }\`
✗ \`"size": "40px"\` ← wrong, must be wrapped in device key

**\`gap\`** — responsive CSS string object
Gap between social icon items.
✓ \`"gap": { "Desktop": "12px" }\`

**\`iconSize\`** — responsive CSS string object
Size of the SVG icon inside the container.
✓ \`"iconSize": { "Desktop": "20px" }\`

---

### Child Attributes (blockish/social-icon-item)

**\`platform\`** — string
The social platform identifier. Determines the default icon and brand color.
✓ \`"platform": "facebook"\`
Common values: facebook · twitter · instagram · linkedin · youtube · github · tiktok

**\`url\`** — object
The profile link. Use the same url object shape as Button.
✓ \`"url": { "url": "https://facebook.com/yourpage", "newTab": true }\`

**\`icon\`** — \`{viewBox: number[], path: string}\`
Custom icon override. Leave unset to use the default platform icon.

**\`customColor\`** — string
Custom icon color. Only used when parent colorType is custom.
✓ \`"customColor": "#2563eb"\`

### Minimal Schema
\`\`\`json
{
  "name": "blockish/social-icons",
  "attributes": { "shape": "circle", "colorType": "official", "size": { "Desktop": "40px" } },
  "innerBlocks": [
    {
      "name": "blockish/social-icon-item",
      "attributes": {
        "platform": "facebook",
        "url": { "url": "https://facebook.com", "newTab": true }
      },
      "innerBlocks": []
    }
  ]
}
\`\`\`

---
`;

// ─── Accordion ────────────────────────────────────────────────────────────────
QR["Accordion"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/accordion\`
**Child block:** \`blockish/accordion-item\` — must only be used inside this block

---

### Parent Attributes

**\`maxItemExpanded\`** — string
Controls how many items can be open at once.
✓ \`"maxItemExpanded": "one"\`
Values: one · multiple

**\`faqSchema\`** — boolean
When true, outputs FAQ JSON-LD structured data for SEO.
✓ \`"faqSchema": false\`

**\`itemPosition\`** — responsive \`{label, value}\` object
Direction of the trigger row (icon position relative to title).
✓ \`"itemPosition": { "Desktop": { "label": "Row", "value": "row" } }\`
Values: row (icon right) · row-reverse (icon left)

---

### Child Attributes (blockish/accordion-item)

**\`title\`** — string
The clickable toggle heading text.
✓ \`"title": "What is Blockish?"\`

**\`defaultOpen\`** — boolean
Whether this item is expanded on load.
✓ \`"defaultOpen": true\`
Note: only one item should have defaultOpen: true when maxItemExpanded is "one"

**\`closedIcon\`** / **\`openIcon\`** — \`{viewBox: number[], path: string}\`
Custom icons for the toggle. Only use provided assets.
✓ \`"closedIcon": { "viewBox": [0, 0, 24, 24], "path": "..." }\`
✗ invent SVG path data ← never do this

### Content inside accordion-item
Inner content blocks (headings, paragraphs via heading with tag p, etc.) go inside
accordion-item's innerBlocks — not inside accordion's innerBlocks directly.

### Minimal Schema
\`\`\`json
{
  "name": "blockish/accordion",
  "attributes": { "maxItemExpanded": "one" },
  "innerBlocks": [
    {
      "name": "blockish/accordion-item",
      "attributes": { "title": "What is Blockish?", "defaultOpen": true },
      "innerBlocks": [
        {
          "name": "blockish/heading",
          "attributes": {
            "content": "Blockish is a WordPress block plugin.",
            "tag": { "label": "P", "value": "p" }
          },
          "innerBlocks": []
        }
      ]
    }
  ]
}
\`\`\`

---
`;

// ─── Tab ──────────────────────────────────────────────────────────────────────
QR["Tab"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/tab\`
**Child block:** \`blockish/tab-item\` — must only be used inside this block

---

### Parent Attributes

**\`direction\`** — responsive plain-string object
Layout direction of the tab nav relative to content.
✓ \`"direction": { "Desktop": "column", "Mobile": "column" }\`
✗ \`"direction": { "Desktop": { "label": "Column", "value": "column" } }\` ← wrong, plain string not {label,value}
Values: column (tabs above) · column-reverse (tabs below) · row (tabs left) · row-reverse (tabs right)

**\`justify\`** — responsive plain-string object
Alignment of the tab nav buttons.
✓ \`"justify": { "Desktop": "flex-start" }\`
Values: flex-start · center · flex-end · space-between

**\`alignTitle\`** — responsive plain-string object
Text alignment within each tab button.
✓ \`"alignTitle": { "Desktop": "left" }\`
Values: left · center · right

**\`defaultActiveTab\`** — number
Zero-based index of the initially active tab. Must match the tab-item with defaultActive: true.
✓ \`"defaultActiveTab": 0\`

**\`navGap\`** — responsive CSS string object
Gap between tab buttons.
✓ \`"navGap": { "Desktop": "10px" }\`

**\`distanceFromContent\`** — responsive CSS string object
Space between the tab nav and the content area.
✓ \`"distanceFromContent": { "Desktop": "20px" }\`

**\`tabsPadding\`** — responsive spacing object
Padding inside each tab button.
✓ \`"tabsPadding": { "Desktop": { "top": "12px", "right": "18px", "bottom": "12px", "left": "18px" } }\`

**\`tabsBorderRadius\`** — responsive corner object
Border radius of tab buttons.
✓ \`"tabsBorderRadius": { "Desktop": { "topLeft": "8px", "topRight": "8px", "bottomRight": "8px", "bottomLeft": "8px" } }\`

**\`titleColorNormal\`** / **\`titleColorHover\`** / **\`titleColorActive\`** — string
Tab title colors for each state.
✓ \`"titleColorNormal": "#475569", "titleColorActive": "#2563eb"\`

**\`contentPadding\`** — responsive spacing object
Padding inside the content area of each tab panel.
✓ \`"contentPadding": { "Desktop": { "top": "24px", "right": "24px", "bottom": "24px", "left": "24px" } }\`

**\`contentColor\`** — string
Text color inside the tab content area.
✓ \`"contentColor": "#475569"\`

---

### Child Attributes (blockish/tab-item)

**\`title\`** — string
The tab button label.
✓ \`"title": "Features"\`

**\`defaultActive\`** — boolean
Whether this tab is active on load. Only ONE item should have true.
✓ \`"defaultActive": true\`

**\`tabIcon\`** — \`{viewBox: number[], path: string}\`
Optional icon for the tab button. Only use provided assets.

### Rules
- Only one tab-item should have \`defaultActive: true\`
- Parent \`defaultActiveTab\` index must match the active item's position

### Minimal Schema
\`\`\`json
{
  "name": "blockish/tab",
  "attributes": {
    "direction": { "Desktop": "column" },
    "defaultActiveTab": 0
  },
  "innerBlocks": [
    {
      "name": "blockish/tab-item",
      "attributes": { "title": "Tab One", "defaultActive": true },
      "innerBlocks": []
    },
    {
      "name": "blockish/tab-item",
      "attributes": { "title": "Tab Two", "defaultActive": false },
      "innerBlocks": []
    }
  ]
}
\`\`\`

---
`;

// ─── Class Manager ────────────────────────────────────────────────────────────
QR["Class Manager"] = `
## ⚡ QUICK REFERENCE — Class Manager

Class Manager creates reusable style classes stored globally in \`schema.extensions.classManager\`.
Blocks reference classes via \`classManager\` and \`classManagerSubselector\` attributes.

---

### Class Record Shape

Every class record must have these fields:

| Field | Type | Required | Description |
|---|---|---|---|
| \`id\` | number | ✓ | Unique ID. Use numbers starting at 101 for new classes |
| \`title\` | string | ✓ | Class name (root: no dot) or CSS selector (subselector: with dot, colon, etc.) |
| \`action\` | string | ✓ | \`"create"\` for new · \`"update"\` for existing |
| \`parent\` | number | subselector only | ID of the root class this belongs to |
| \`attributes\` | object | ✓ | Style attributes (see safe keys below) |

---

### Root Class
A root class styles the block wrapper directly. Title = class name WITHOUT a dot.
✓ \`{ "id": 101, "title": "bk-hero-section", "action": "create", "attributes": {} }\`
✗ \`{ "name": "bk-hero-section" }\` ← wrong field names
✗ \`{ "title": ".bk-hero-section" }\` ← wrong, root title must not have a dot

### Subselector Class
Targets a child element or pseudo-state. Must have a \`parent\` pointing to root class id.
✓ \`{ "id": 102, "parent": 101, "title": ".bk-hero-title", "action": "create", "attributes": {} }\`
✓ \`{ "id": 103, "parent": 101, "title": ":hover", "action": "create", "attributes": {} }\`
✗ \`{ "title": ".bk-hero-section:hover" }\` ← wrong, do not write full selector — use ":hover" only

---

### Attribute Value Shapes inside Class Manager

**Responsive select (display, flexDirection, justifyContent, alignItems, textAlign, overflow, position):**
✓ \`"display": { "Desktop": { "label": "Flex", "value": "flex" } }\`
✗ \`"display": "flex"\` ← wrong, must be responsive {label,value}

**Responsive CSS string (fontSize, width, height, maxWidth, gap, lineHeight, letterSpacing):**
✓ \`"fontSize": { "Desktop": "56px", "Mobile": "36px" }\`
✗ \`"fontSize": { "Desktop": { "value": 56, "unit": "px" } }\` ← wrong, use full CSS string

**Spacing (padding, margin):**
✓ \`"padding": { "Desktop": { "top": "80px", "right": "24px", "bottom": "80px", "left": "24px" } }\`
✗ \`"padding": "80px 24px"\` ← wrong, must be the spacing object

**Plain color (color):**
✓ \`"color": "#111827"\`

**Responsive number (opacity, scale, rotate, transitionDuration):**
✓ \`"opacity": { "Desktop": 0.9 }\`

**Custom CSS (for gradients, box-shadow, background-color, etc.):**
✓ \`"customCss": "{{SELECTOR}} { background: linear-gradient(135deg, #6366f1, #8b5cf6); }"\`
✗ \`"backgroundColor": "#ffffff"\` ← not a valid key, use customCss

---

### Safe Attribute Keys
\`\`\`
display · flexDirection · flexWrap · justifyContent · alignItems · columnGap · rowGap
padding · margin
width · height · minWidth · maxWidth · minHeight · maxHeight · overflow · aspectRatio
position · top · right · bottom · left · zIndex
fontSize · fontWeight · lineHeight · letterSpacing · color · textAlign · textTransform
borderRadius · opacity
translateX · translateY · rotate · scale
transitionProperty · transitionDuration · transitionTimingFunction · transitionDelay
customCss
\`\`\`
✗ \`backgroundColor\` — NOT a valid key, use \`customCss\`
✗ \`paddingTop\` — NOT a valid key, use \`padding\` object
✗ \`font_size\` — NOT a valid key, use \`fontSize\`

---

### Complete Example
\`\`\`json
{
  "extensions": {
    "classManager": [
      {
        "id": 101,
        "title": "bk-hero",
        "action": "create",
        "attributes": {
          "display": { "Desktop": { "label": "Flex", "value": "flex" } },
          "flexDirection": { "Desktop": { "label": "Column", "value": "column" } },
          "alignItems": { "Desktop": { "label": "Center", "value": "center" } },
          "padding": {
            "Desktop": { "top": "96px", "right": "24px", "bottom": "96px", "left": "24px" },
            "Mobile": { "top": "56px", "right": "16px", "bottom": "56px", "left": "16px" }
          },
          "customCss": "{{SELECTOR}} { background: #ffffff; }"
        }
      },
      {
        "id": 102,
        "parent": 101,
        "title": ".bk-hero-title",
        "action": "create",
        "attributes": {
          "fontSize": { "Desktop": "56px", "Mobile": "36px" },
          "fontWeight": { "Desktop": { "label": "700", "value": "700" } },
          "color": "#111827"
        }
      }
    ]
  },
  "blocks": [
    {
      "name": "blockish/container",
      "attributes": {
        "isVariationPicked": true,
        "classManager": [{ "id": 101, "title": "bk-hero" }],
        "classManagerSubselector": [{ "id": 102, "title": ".bk-hero-title", "parent": 101 }]
      },
      "innerBlocks": []
    }
  ]
}
\`\`\`

---
`;

// ─── Advanced Controls ────────────────────────────────────────────────────────
QR["Advanced Controls"] = `
## ⚡ QUICK REFERENCE — Advanced Controls

Advanced Controls are block-level layout attributes available on all Blockish blocks.
Use them for spacing, sizing, positioning, and background on individual blocks.
For reusable/shared styles, prefer Class Manager instead.

---

### Responsive Value Formats

**Spacing (margin, padding):**
✓ \`"padding": { "Desktop": { "top": "80px", "right": "24px", "bottom": "80px", "left": "24px" } }\`
✗ \`"padding": "80px 24px"\`

**CSS string (width, height, gap, fontSize):**
✓ \`"width": { "Desktop": "100%", "Mobile": "100%" }\`
✗ \`"width": { "Desktop": { "value": 100, "unit": "%" } }\` ← wrong shape

**Select (display, position, overflow, objectFit):**
✓ \`"display": { "Desktop": { "label": "Flex", "value": "flex" } }\`
✗ \`"display": "flex"\`

---

### Key Attributes

**\`margin\`** — responsive spacing object
Block outer spacing.
✓ \`"margin": { "Desktop": { "top": "0px", "right": "0px", "bottom": "32px", "left": "0px" } }\`

**\`padding\`** — responsive spacing object
Block inner spacing.
✓ \`"padding": { "Desktop": { "top": "80px", "right": "24px", "bottom": "80px", "left": "24px" } }\`

**\`width\`** / **\`maxWidth\`** / **\`height\`** — responsive CSS string
✓ \`"maxWidth": { "Desktop": "1200px" }\`

**\`customCss\`** — string
Custom CSS using {{SELECTOR}} placeholder.
✓ \`"customCss": "{{SELECTOR}} { background: #f9fafb; }"\`
✗ \`"customCss": ".my-block { ... }"\` ← always use {{SELECTOR}}

---
`;

// ─── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  await client.connect();
  console.log("Connected.");

  const { rows } = await client.query(
    "SELECT id, title, content FROM documents ORDER BY id"
  );

  for (const row of rows) {
    const { id, title, content } = row;
    const newQR = QR[title];
    if (!newQR) {
      console.log(`  — skipping ${title} (no updated QR)`);
      continue;
    }

    // Remove old QUICK REFERENCE block and replace with new one
    const qrStart = content.indexOf("## ⚡ QUICK REFERENCE");
    let stripped = content;

    if (qrStart !== -1) {
      // Find where the next top-level heading starts after the QR block
      const afterQR = content.indexOf("\n## ", qrStart + 10);
      const qrEnd = afterQR !== -1 ? afterQR : content.length;
      stripped = content.slice(0, qrStart) + content.slice(qrEnd);
    }

    // Insert new QR after the first --- separator
    const insertAt = stripped.indexOf("\n---\n");
    let newContent;
    if (insertAt !== -1) {
      newContent =
        stripped.slice(0, insertAt + 5) +
        "\n" + newQR +
        stripped.slice(insertAt + 5);
    } else {
      const firstNewline = stripped.indexOf("\n");
      newContent = stripped.slice(0, firstNewline + 1) + "\n" + newQR + stripped.slice(firstNewline + 1);
    }

    await client.query(
      "UPDATE documents SET content = $1, updated_at = NOW() WHERE id = $2",
      [newContent, id]
    );
    console.log(`  ✓ Updated: ${title}`);
  }

  console.log("\nDone.");
  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
