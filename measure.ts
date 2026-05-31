import { wcwidth } from "./wcwidth.ts";

export interface WrapTextOptions {
  mode?: "words" | "newlines" | "none";
}

export interface WrappedLine {
  text: string;
  width: number;
}

export function measureCellWidth(text: string): number {
  let width = 0;
  for (let char of text) width += cellWidth(char);
  return width;
}

export function wrapText(
  text: string,
  width: number,
  options: WrapTextOptions = {},
): WrappedLine[] {
  assertValidWidth(width);
  if (text.length === 0) return [];

  let mode = options.mode ?? "words";
  switch (mode) {
    case "none": {
      let collapsed = text.replaceAll("\n", "");
      return collapsed === "" ? [] : line(collapsed);
    }
    case "newlines":
      return text.split("\n").flatMap((part) => part === "" ? [] : line(part));
    case "words":
      return wrapWords(text, width);
  }
}

export function measureWrappedHeight(
  text: string,
  width: number,
  options: WrapTextOptions = {},
): number {
  assertValidWidth(width);
  if (text.length === 0) return 0;

  let mode = options.mode ?? "words";
  switch (mode) {
    case "none":
      return text.replaceAll("\n", "") === "" ? 0 : 1;
    case "newlines":
      return countNonEmptyNewlineParts(text);
    case "words":
      return countWrappedWords(text, width);
  }
}

function line(text: string): WrappedLine[] {
  return [{ text, width: measureCellWidth(text) }];
}

function assertValidWidth(width: number): void {
  if (!Number.isFinite(width) || width < 0) {
    throw new RangeError(
      `width must be a finite non-negative number: ${width}`,
    );
  }
}

function wrapWords(text: string, maxWidth: number): WrappedLine[] {
  let out: WrappedLine[] = [];
  for (let paragraph of text.split("\n")) {
    if (paragraph === "") continue;
    let current = "";
    let currentWidth = 0;

    for (let token of tokens(paragraph)) {
      let tokenWidth = measureCellWidth(token);
      if (current !== "" && currentWidth + tokenWidth > maxWidth) {
        out.push({
          text: current.trimEnd(),
          width: measureCellWidth(current.trimEnd()),
        });
        current = token.trimStart();
        currentWidth = measureCellWidth(current);
      } else {
        current += token;
        currentWidth += tokenWidth;
      }

      if (current !== "" && currentWidth > maxWidth && token.trim() !== "") {
        out.push({
          text: current.trimEnd(),
          width: measureCellWidth(current.trimEnd()),
        });
        current = "";
        currentWidth = 0;
      }
    }

    if (current !== "") {
      let text = current.trimEnd();
      if (text !== "") out.push({ text, width: measureCellWidth(text) });
    }
  }
  return out;
}

function countWrappedWords(text: string, maxWidth: number): number {
  let count = 0;
  for (let paragraph of text.split("\n")) {
    if (paragraph === "") continue;
    let current = "";
    let currentWidth = 0;

    for (let token of tokens(paragraph)) {
      let tokenWidth = measureCellWidth(token);
      if (current !== "" && currentWidth + tokenWidth > maxWidth) {
        let trimmed = current.trimEnd();
        if (trimmed !== "") count++;
        current = token.trimStart();
        currentWidth = measureCellWidth(current);
      } else {
        current += token;
        currentWidth += tokenWidth;
      }

      if (current !== "" && currentWidth > maxWidth && token.trim() !== "") {
        count++;
        current = "";
        currentWidth = 0;
      }
    }

    if (current.trimEnd() !== "") count++;
  }
  return count;
}

function countNonEmptyNewlineParts(text: string): number {
  let count = 0;
  for (let part of text.split("\n")) if (part !== "") count++;
  return count;
}

function* tokens(text: string): IterableIterator<string> {
  let re = /\S+\s*/g;
  for (let match of text.matchAll(re)) yield match[0];
}

function cellWidth(char: string): number {
  let code = char.codePointAt(0)!;
  if (code >= 0xD800 && code <= 0xDFFF) code = 0xFFFD;
  let width = wcwidth(code);
  return width > 0 ? width : 0;
}
