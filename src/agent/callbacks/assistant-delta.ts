function decodeJsonEscape(value: string): string {
  switch (value) {
    case "\"":
      return "\"";
    case "\\":
      return "\\";
    case "/":
      return "/";
    case "b":
      return "\b";
    case "f":
      return "\f";
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    default:
      return value;
  }
}

export function createJsonStringFieldDeltaExtractor(fieldName: string) {
  const fieldPattern = `"${fieldName}"`;
  let buffer = "";
  let isReading = false;
  let isDone = false;
  let isEscaped = false;
  let unicodeEscape = "";

  return (chunk: string): string => {
    if (isDone || !chunk) {
      return "";
    }

    let output = "";

    for (const char of chunk) {
      if (!isReading) {
        buffer += char;

        const fieldIndex = buffer.indexOf(fieldPattern);
        if (fieldIndex === -1) {
          buffer = buffer.slice(-fieldPattern.length);
          continue;
        }

        const valueStartIndex = buffer.indexOf("\"", fieldIndex + fieldPattern.length);
        const colonIndex = buffer.indexOf(":", fieldIndex + fieldPattern.length);

        if (colonIndex === -1 || valueStartIndex === -1) {
          buffer = buffer.slice(fieldIndex);
          continue;
        }

        if (valueStartIndex < colonIndex) {
          buffer = buffer.slice(fieldIndex + fieldPattern.length);
          continue;
        }

        isReading = true;
        buffer = "";
        continue;
      }

      if (unicodeEscape) {
        unicodeEscape += char;

        if (unicodeEscape.length === 4) {
          output += String.fromCharCode(Number.parseInt(unicodeEscape, 16));
          unicodeEscape = "";
          isEscaped = false;
        }

        continue;
      }

      if (isEscaped) {
        if (char === "u") {
          unicodeEscape = "";
          continue;
        }

        output += decodeJsonEscape(char);
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === "\"") {
        isDone = true;
        break;
      }

      output += char;
    }

    return output;
  };
}

export function createJsonStringFieldReader(fieldName: string) {
  const fieldPattern = `"${fieldName}"`;
  let buffer = "";
  let isReading = false;
  let isComplete = false;
  let isEscaped = false;
  let unicodeEscape = "";

  return {
    read(chunk: string): string {
      if (isComplete || !chunk) {
        return "";
      }

      let output = "";

      for (const char of chunk) {
        if (!isReading) {
          buffer += char;

          const fieldIndex = buffer.indexOf(fieldPattern);
          if (fieldIndex === -1) {
            buffer = buffer.slice(-fieldPattern.length);
            continue;
          }

          const valueStartIndex = buffer.indexOf("\"", fieldIndex + fieldPattern.length);
          const colonIndex = buffer.indexOf(":", fieldIndex + fieldPattern.length);

          if (colonIndex === -1 || valueStartIndex === -1) {
            buffer = buffer.slice(fieldIndex);
            continue;
          }

          if (valueStartIndex < colonIndex) {
            buffer = buffer.slice(fieldIndex + fieldPattern.length);
            continue;
          }

          isReading = true;
          buffer = "";
          continue;
        }

        if (unicodeEscape) {
          unicodeEscape += char;

          if (unicodeEscape.length === 4) {
            output += String.fromCharCode(Number.parseInt(unicodeEscape, 16));
            unicodeEscape = "";
            isEscaped = false;
          }

          continue;
        }

        if (isEscaped) {
          if (char === "u") {
            unicodeEscape = "";
            continue;
          }

          output += decodeJsonEscape(char);
          isEscaped = false;
          continue;
        }

        if (char === "\\") {
          isEscaped = true;
          continue;
        }

        if (char === "\"") {
          isComplete = true;
          break;
        }

        output += char;
      }

      return output;
    },
    isComplete(): boolean {
      return isComplete;
    },
  };
}
