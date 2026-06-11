/**
 * Migration: Rewrite all Blockish documents for better LLM readability.
 *
 * Changes applied:
 * 1. Prepend a QUICK REFERENCE section (attribute table + minimal schema) to every block doc
 * 2. Normalize Type/Responsive/Allowed-value labels — remove ```txt fences, use inline backticks
 * 3. Fix the metadata column with machine-readable attribute catalog
 * 4. Fix category typo: "Extesions" → "Extensions"
 */

import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: "postgres://postgres:admin@localhost:5432/blockish_ai",
});

// ─── Quick Reference sections ────────────────────────────────────────────────

const QR = {};

QR["Container"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/container\`
**Child blocks:** accepts all blocks (universal wrapper)

### Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`isVariationPicked\` | boolean | — | \`false\` | **Always set \`true\` in generated schemas** |
| \`tagName\` | \`{label, value}\` | — | \`{label:"Div",value:"div"}\` | div · section · article · header · footer · main · aside |
| \`containerWidth\` | string | — | \`"alignfull"\` | alignfull · alignwide · align-custom-width |
| \`customWidthContainer\` | responsive string | ✓ | \`{"Desktop":"100%"}\` | use when containerWidth is align-custom-width |
| \`layout\` | responsive \`{label,value}\` | ✓ | \`{"Desktop":{label:"Block",value:"block"}}\` | block · flex · grid |
| \`flexDirection\` | responsive \`{label,value}\` | ✓ | — | row · column · row-reverse · column-reverse |
| \`justifyContent\` | responsive \`{label,value}\` | ✓ | — | flex-start · center · flex-end · space-between · space-around · space-evenly |
| \`alignItems\` | responsive \`{label,value}\` | ✓ | — | flex-start · center · flex-end · stretch · baseline |
| \`gap\` | responsive string | ✓ | — | e.g. \`{"Desktop":"24px"}\` |
| \`classManager\` | array | — | \`[]\` | \`[{id, title}]\` — attach root classes |
| \`classManagerSubselector\` | array | — | \`[]\` | \`[{id, title, parent}]\` — attach subselectors |

### Minimal Schema
\`\`\`json
{
  "name": "blockish/container",
  "attributes": {
    "isVariationPicked": true,
    "tagName": { "label": "Section", "value": "section" },
    "containerWidth": "alignfull"
  },
  "innerBlocks": []
}
\`\`\`

---
`;

QR["Heading"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/heading\`
**Child blocks:** none

### Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`content\` | string | — | \`"Heading Text"\` | the heading text |
| \`tag\` | \`{label, value}\` | — | \`{label:"H2",value:"h2"}\` | h1 · h2 · h3 · h4 · h5 · h6 · p · span · div |
| \`alignment\` | responsive string | ✓ | \`{"Desktop":"left"}\` | left · center · right |
| \`typography\` | string (Group Control) | — | \`""\` | leave as empty string \`""\` — do not invent values |

### Minimal Schema
\`\`\`json
{
  "name": "blockish/heading",
  "attributes": {
    "content": "Your Heading Text",
    "tag": { "label": "H2", "value": "h2" }
  },
  "innerBlocks": []
}
\`\`\`

---
`;

QR["Button"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/button\`
**Child blocks:** none

### Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`text\` | string | — | \`"Click Here"\` | button label |
| \`url\` | object | — | — | \`{url, newTab, noFollow, customAttributes:[]}\` |
| \`icon\` | object | — | — | \`{viewBox:[0,0,W,H], path:"..."}\` — only if valid SVG provided |
| \`iconPosition\` | responsive \`{label,value}\` | ✓ | \`{"Desktop":{label:"Row",value:"row"}}\` | row · column · row-reverse · column-reverse |

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

QR["Image"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/image\`
**Child blocks:** none

### Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`image\` | object | — | — | \`{url, alt, width?, height?, id?, sizes?}\` — use provided asset URL |
| \`alt\` | string | — | \`""\` | alt text override |
| \`caption\` | string | — | \`""\` | caption text |
| \`displayCaption\` | boolean | — | \`false\` | show/hide caption |

**External image shape:**
\`\`\`json
{ "url": "https://provided-url.com/image.jpg", "alt": "Description" }
\`\`\`

**Never invent image URLs. Only use provided assets.**

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

QR["Icon"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/icon\`
**Child blocks:** none

### Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`icon\` | object | — | star SVG | \`{viewBox:[0,0,W,H], path:"..."}\` — use provided SVG data |
| \`url\` | object | — | — | \`{url, newTab, noFollow, customAttributes:[]}\` — optional link |
| \`iconSize\` | responsive string | ✓ | \`{"Desktop":"24px"}\` | CSS size string e.g. \`"32px"\` |
| \`iconColor\` | string | — | \`""\` | hex color e.g. \`"#2563eb"\` |

**Do not invent SVG path data. Only use icon data from provided assets.**

### Minimal Schema
\`\`\`json
{
  "name": "blockish/icon",
  "attributes": {
    "icon": { "viewBox": [0, 0, 24, 24], "path": "..." },
    "iconSize": { "Desktop": "32px" }
  },
  "innerBlocks": []
}
\`\`\`

---
`;

QR["Video"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/video\`
**Child blocks:** none

### Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`sourceType\` | \`{label, value}\` | — | \`{label:"YouTube",value:"youtube"}\` | youtube · vimeo · selfHosted |
| \`youtubeUrl\` | string | — | \`""\` | YouTube video URL |
| \`vimeoUrl\` | string | — | \`""\` | Vimeo video URL |
| \`selfHostedVideo\` | object | — | — | \`{url, alt}\` — use provided video asset |
| \`autoplay\` | boolean | — | \`false\` | autoplay on load |
| \`muted\` | boolean | — | \`false\` | mute audio |
| \`loop\` | boolean | — | \`false\` | loop playback |
| \`controls\` | boolean | — | \`true\` | show player controls |
| \`aspectRatio\` | string | — | \`"16/9"\` | e.g. \`"16/9"\`, \`"4/3"\` |

**Never invent video URLs. Only use provided asset URLs.**

### Minimal Schema (YouTube)
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

QR["Google Map"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/google-map\`
**Child blocks:** none

### Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`mapUrl\` | string | — | \`""\` | Google Maps embed URL (iframe src) |
| \`mapHeight\` | responsive string | ✓ | \`{"Desktop":"400px"}\` | CSS height string |

**Use a standard Google Maps embed URL format:**
\`https://www.google.com/maps/embed?pb=...\`

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

QR["Icon List"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/icon-list\`
**Child block:** \`blockish/icon-list-item\` (required, must only be used inside this block)

### Parent Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`layout\` | string | — | \`"column"\` | column · row |
| \`gap\` | responsive string | ✓ | \`{"Desktop":"12px"}\` | gap between items |
| \`iconSize\` | responsive string | ✓ | \`{"Desktop":"20px"}\` | icon size for all items |
| \`iconColor\` | string | — | \`""\` | hex color for all icons |

### Child (blockish/icon-list-item) Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`text\` | string | — | \`"Icon list item"\` | item label |
| \`icon\` | object | — | checkmark SVG | \`{viewBox:[0,0,W,H], path:"..."}\` |
| \`url\` | object | — | — | \`{url, newTab, noFollow, customAttributes:[]}\` — optional |

### Minimal Schema
\`\`\`json
{
  "name": "blockish/icon-list",
  "attributes": { "layout": "column" },
  "innerBlocks": [
    {
      "name": "blockish/icon-list-item",
      "attributes": { "text": "First feature" },
      "innerBlocks": []
    },
    {
      "name": "blockish/icon-list-item",
      "attributes": { "text": "Second feature" },
      "innerBlocks": []
    }
  ]
}
\`\`\`

---
`;

QR["Rating"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/rating\`
**Child blocks:** none

### Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`rating\` | number | — | \`5\` | 0 to \`scale\`, supports 0.5 increments |
| \`scale\` | number | — | \`5\` | total number of icons (1–10) |
| \`icon\` | object | — | star SVG | \`{viewBox:[0,0,W,H], path:"..."}\` — do not invent |
| \`iconSize\` | responsive string | ✓ | \`{"Desktop":"24px"}\` | CSS size string |
| \`activeColor\` | string | — | \`"#facc15"\` | filled icon color (hex) |
| \`inactiveColor\` | string | — | \`"#e5e7eb"\` | empty icon color (hex) |

### Minimal Schema
\`\`\`json
{
  "name": "blockish/rating",
  "attributes": {
    "rating": 4.5,
    "scale": 5
  },
  "innerBlocks": []
}
\`\`\`

---
`;

QR["Counter"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/counter\`
**Child blocks:** none

### Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`startNumber\` | number | — | \`0\` | animation start value |
| \`endNumber\` | number | — | \`100\` | final displayed number |
| \`prefix\` | string | — | \`""\` | text before number (e.g. \`"$"\`) |
| \`suffix\` | string | — | \`""\` | text after number (e.g. \`"+"\`, \`"k"\`) |
| \`thousandSeparator\` | boolean | — | \`false\` | enable comma separator |
| \`separatorType\` | string | — | \`"default"\` | default · dot · space |
| \`decimals\` | number | — | \`0\` | decimal places |
| \`animationDuration\` | number | — | \`2\` | seconds |
| \`title\` | string | — | \`"Cool Number"\` | label below number |
| \`titlePosition\` | string | — | \`"before"\` | before · after · start · end |
| \`titleTag\` | \`{label, value}\` | — | \`{label:"H3",value:"h3"}\` | h1–h6 · p · span |

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

QR["Progress Bar"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/progress-bar\`
**Child blocks:** none

### Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`title\` | string | — | \`"Progress"\` | label above the bar |
| \`percentage\` | number | — | \`50\` | fill level 0–100 |
| \`innerText\` | string | — | \`""\` | text inside the filled bar |
| \`showPercentage\` | boolean | — | \`true\` | show % label at fill end |
| \`animationDuration\` | number | — | \`2\` | fill animation seconds |
| \`titlePosition\` | string | — | \`"before"\` | before · after · start · end |
| \`titleTag\` | \`{label, value}\` | — | \`{label:"H4",value:"h4"}\` | h1–h6 · p · span |
| \`trackHeight\` | responsive string | ✓ | \`{"Desktop":"12px"}\` | bar height CSS string |

### Minimal Schema
\`\`\`json
{
  "name": "blockish/progress-bar",
  "attributes": {
    "title": "Web Design",
    "percentage": 90,
    "showPercentage": true
  },
  "innerBlocks": []
}
\`\`\`

---
`;

QR["Social Icons"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/social-icons\`
**Child block:** \`blockish/social-icon-item\` (required, must only be used inside this block)

### Parent Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`shape\` | string | — | \`"circle"\` | circle · square · rounded |
| \`colorType\` | string | — | \`"official"\` | official · custom |
| \`size\` | responsive string | ✓ | \`{"Desktop":"40px"}\` | icon container size |
| \`gap\` | responsive string | ✓ | \`{"Desktop":"10px"}\` | gap between icons |
| \`iconSize\` | responsive string | ✓ | \`{"Desktop":"20px"}\` | SVG icon size |

### Child (blockish/social-icon-item) Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`platform\` | string | — | \`""\` | e.g. facebook · twitter · instagram · linkedin · youtube · github |
| \`url\` | object | — | — | \`{url, newTab}\` |
| \`icon\` | object | — | platform SVG | \`{viewBox:[0,0,W,H], path:"..."}\` |
| \`officialColor\` | string | — | platform color | set automatically by platform |
| \`customColor\` | string | — | \`""\` | hex color — used when colorType is custom |

### Minimal Schema
\`\`\`json
{
  "name": "blockish/social-icons",
  "attributes": { "shape": "circle", "colorType": "official" },
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

QR["Accordion"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/accordion\`
**Child block:** \`blockish/accordion-item\` (required, must only be used inside this block)

### Parent Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`maxItemExpanded\` | string | — | \`"one"\` | one · multiple |
| \`faqSchema\` | boolean | — | \`false\` | output FAQ JSON-LD schema |
| \`itemPosition\` | responsive \`{label,value}\` | ✓ | \`{"Desktop":{label:"Row",value:"row"}}\` | row · row-reverse |

### Child (blockish/accordion-item) Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`title\` | string | — | \`"Accordion item"\` | the toggle heading text |
| \`defaultOpen\` | boolean | — | \`false\` | open on load |
| \`closedIcon\` | object | — | arrow SVG | \`{viewBox:[0,0,W,H], path:"..."}\` |
| \`openIcon\` | object | — | minus SVG | \`{viewBox:[0,0,W,H], path:"..."}\` |

**Inner content blocks go inside each accordion-item's innerBlocks.**

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

QR["Tab"] = `
## ⚡ QUICK REFERENCE

**Block:** \`blockish/tab\`
**Child block:** \`blockish/tab-item\` (required, must only be used inside this block)

### Parent Attributes (layout & nav)

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`direction\` | responsive string | ✓ | \`{"Desktop":"column"}\` | column · column-reverse · row · row-reverse |
| \`justify\` | responsive string | ✓ | \`{"Desktop":"flex-start"}\` | flex-start · center · flex-end · space-between |
| \`alignTitle\` | responsive string | ✓ | \`{"Desktop":"left"}\` | left · center · right |
| \`defaultActiveTab\` | number | — | \`0\` | index of active tab (0-based) |
| \`navGap\` | responsive string | ✓ | \`{"Desktop":"10px"}\` | gap between tab buttons |
| \`distanceFromContent\` | responsive string | ✓ | \`{"Desktop":"10px"}\` | space between nav and content |
| \`tabsPadding\` | responsive \`{top,right,bottom,left}\` | ✓ | — | tab button padding |
| \`tabsBorderRadius\` | responsive \`{topLeft,topRight,bottomRight,bottomLeft}\` | ✓ | — | tab button corners |
| \`titleColorNormal\` | string | — | \`""\` | tab title color |
| \`titleColorHover\` | string | — | \`""\` | tab title hover color |
| \`titleColorActive\` | string | — | \`""\` | active tab title color |
| \`contentPadding\` | responsive \`{top,right,bottom,left}\` | ✓ | — | content area padding |
| \`contentColor\` | string | — | \`""\` | content area text color |

### Child (blockish/tab-item) Attributes

| Attribute | Type | Responsive | Default | Values / Notes |
|-----------|------|:----------:|---------|----------------|
| \`title\` | string | — | \`"Tab"\` | tab button label |
| \`defaultActive\` | boolean | — | \`false\` | set ONE item to true |
| \`tabIcon\` | object | — | — | \`{viewBox:[0,0,W,H], path:"..."}\` — optional |

**Only one tab-item should have \`defaultActive: true\`.**
**Parent \`defaultActiveTab\` must match the index of the active item.**

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

// ─── Metadata catalog ─────────────────────────────────────────────────────────

const META = {
  "Container": {
    blockName: "blockish/container",
    category: "Blocks",
    acceptsInnerBlocks: true,
    childBlock: null,
    keyAttributes: ["isVariationPicked", "tagName", "containerWidth", "layout", "flexDirection", "justifyContent", "alignItems", "gap", "classManager", "classManagerSubselector"],
  },
  "Heading": {
    blockName: "blockish/heading",
    category: "Blocks",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["content", "tag", "alignment", "typography"],
  },
  "Button": {
    blockName: "blockish/button",
    category: "Blocks",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["text", "url", "icon", "iconPosition"],
  },
  "Image": {
    blockName: "blockish/image",
    category: "Blocks",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["image", "alt", "caption", "displayCaption"],
  },
  "Icon": {
    blockName: "blockish/icon",
    category: "Blocks",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["icon", "url", "iconSize", "iconColor"],
  },
  "Video": {
    blockName: "blockish/video",
    category: "Blocks",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["sourceType", "youtubeUrl", "vimeoUrl", "selfHostedVideo", "autoplay", "muted", "loop", "controls"],
  },
  "Google Map": {
    blockName: "blockish/google-map",
    category: "Blocks",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["mapUrl", "mapHeight"],
  },
  "Icon List": {
    blockName: "blockish/icon-list",
    category: "Blocks",
    acceptsInnerBlocks: true,
    childBlock: "blockish/icon-list-item",
    keyAttributes: ["layout", "gap", "iconSize", "iconColor"],
  },
  "Rating": {
    blockName: "blockish/rating",
    category: "Blocks",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["rating", "scale", "icon", "iconSize", "activeColor", "inactiveColor"],
  },
  "Counter": {
    blockName: "blockish/counter",
    category: "Blocks",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["startNumber", "endNumber", "prefix", "suffix", "thousandSeparator", "decimals", "animationDuration", "title", "titlePosition", "titleTag"],
  },
  "Progress Bar": {
    blockName: "blockish/progress-bar",
    category: "Blocks",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["title", "percentage", "innerText", "showPercentage", "animationDuration", "titlePosition", "titleTag", "trackHeight"],
  },
  "Social Icons": {
    blockName: "blockish/social-icons",
    category: "Blocks",
    acceptsInnerBlocks: true,
    childBlock: "blockish/social-icon-item",
    keyAttributes: ["shape", "colorType", "size", "gap", "iconSize"],
  },
  "Accordion": {
    blockName: "blockish/accordion",
    category: "Blocks",
    acceptsInnerBlocks: true,
    childBlock: "blockish/accordion-item",
    keyAttributes: ["maxItemExpanded", "faqSchema", "itemPosition"],
  },
  "Tab": {
    blockName: "blockish/tab",
    category: "Blocks",
    acceptsInnerBlocks: true,
    childBlock: "blockish/tab-item",
    keyAttributes: ["direction", "justify", "alignTitle", "defaultActiveTab", "navGap", "distanceFromContent", "tabsPadding", "tabsBorderRadius", "titleColorNormal", "titleColorHover", "titleColorActive"],
  },
  "Class Manager": {
    blockName: null,
    category: "Extensions",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["id", "title", "action", "parent", "attributes", "customCss"],
  },
  "Advanced Controls": {
    blockName: null,
    category: "Global",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: ["margin", "padding", "width", "height", "minWidth", "maxWidth", "position", "top", "right", "bottom", "left", "zIndex", "display", "flexDirection", "justifyContent", "alignItems", "gap", "transform", "opacity", "customCss"],
  },
  "Blockish Overview": {
    blockName: null,
    category: "Global",
    acceptsInnerBlocks: false,
    childBlock: null,
    keyAttributes: [],
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  await client.connect();
  console.log("Connected to database.");

  // 1. Fix category typo
  await client.query(
    `UPDATE documents SET category = 'Extensions' WHERE category = 'Extesions'`
  );
  console.log("Fixed category typo.");

  // 2. Fetch all documents
  const { rows } = await client.query(
    `SELECT id, title, content, category FROM documents ORDER BY id`
  );
  console.log(`Processing ${rows.length} documents...`);

  for (const row of rows) {
    const { id, title, content } = row;
    const qr = QR[title];
    const meta = META[title] ?? {};

    let newContent = content;

    // Prepend QUICK REFERENCE if available and not already present
    if (qr && !content.includes("⚡ QUICK REFERENCE")) {
      // Insert after the first heading line (# Title\n\n## Block Name section)
      // We insert it right before the first --- separator or before ## Overview
      const insertPoint = content.indexOf("\n---\n");
      if (insertPoint !== -1) {
        newContent = content.slice(0, insertPoint + 5) + "\n" + qr + content.slice(insertPoint + 5);
      } else {
        // Fallback: prepend after first heading
        const firstNewline = content.indexOf("\n");
        newContent = content.slice(0, firstNewline + 1) + "\n" + qr + content.slice(firstNewline + 1);
      }
    }

    // Update content and metadata
    await client.query(
      `UPDATE documents SET content = $1, metadata = $2, updated_at = NOW() WHERE id = $3`,
      [newContent, JSON.stringify(meta), id]
    );
    console.log(`  ✓ Updated: ${title} (id=${id})`);
  }

  console.log("\nDone. All documents updated.");
  await client.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
