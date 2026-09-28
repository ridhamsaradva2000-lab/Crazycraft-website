import { Fragment, type ReactNode } from "react";

/**
 * Small dependency-free renderer for product-authored content.
 *
 * All product content remains plain React string children.
 * React escapes those strings automatically.
 *
 * Supported controlled syntax:
 *
 * # / ## / ###... headings
 * - item / * item    unordered lists
 * 1. item / 1) item  ordered lists
 * **text**           bold emphasis
 * blank lines        block spacing
 *
 * Plain text remains plain paragraphs.
 * Single line breaks inside a paragraph are preserved.
 *
 * No sections or headings are invented automatically.
 */

type Block =
  | {
      kind: "heading";
      level: number;
      text: string;
    }
  | {
      kind: "paragraph";
      lines: string[];
    }
  | {
      kind: "ul";
      items: string[];
    }
  | {
      kind: "ol";
      start: number;
      items: string[];
    };

const HEADING_RE =
  /^\s{0,3}(#{1,6})\s+(.+?)\s*$/;

const UL_RE =
  /^\s*[-*\u2022]\s+(.+?)\s*$/;

const OL_RE =
  /^\s*(\d{1,3})[.)]\s+(.+?)\s*$/;


function parseBlocks(source: string): Block[] {

  const lines = source
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const blocks: Block[] = [];

  let open:
    | "paragraph"
    | "ul"
    | "ol"
    | null = null;


  for (const rawLine of lines) {

    if (rawLine.trim() === "") {

      open = null;
      continue;
    }


    const heading = HEADING_RE.exec(rawLine);

    if (heading) {

      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "").length,
        text: heading[2] ?? "",
      });

      open = null;
      continue;
    }


    const ulMatch = UL_RE.exec(rawLine);

    if (ulMatch) {

      const lastBlock =
        blocks[blocks.length - 1];

      if (
        open === "ul" &&
        lastBlock &&
        lastBlock.kind === "ul"
      ) {

        lastBlock.items.push(
          ulMatch[1] ?? ""
        );

      } else {

        blocks.push({
          kind: "ul",
          items: [
            ulMatch[1] ?? ""
          ],
        });
      }

      open = "ul";
      continue;
    }


    const olMatch = OL_RE.exec(rawLine);

    if (olMatch) {

      const lastBlock =
        blocks[blocks.length - 1];

      if (
        open === "ol" &&
        lastBlock &&
        lastBlock.kind === "ol"
      ) {

        lastBlock.items.push(
          olMatch[2] ?? ""
        );

      } else {

        blocks.push({
          kind: "ol",
          start: Number.parseInt(
            olMatch[1] ?? "1",
            10
          ),
          items: [
            olMatch[2] ?? ""
          ],
        });
      }

      open = "ol";
      continue;
    }


    const text =
      rawLine.trim();

    const lastBlock =
      blocks[blocks.length - 1];

    if (
      open === "paragraph" &&
      lastBlock &&
      lastBlock.kind === "paragraph"
    ) {

      lastBlock.lines.push(text);

    } else {

      blocks.push({
        kind: "paragraph",
        lines: [text],
      });
    }

    open = "paragraph";
  }

  return blocks;
}


function renderInline(
  text: string
): ReactNode[] {

  const nodes: ReactNode[] = [];

  const boldRe =
    /\*\*(.+?)\*\*/g;

  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;


  while (
    (match = boldRe.exec(text)) !== null
  ) {

    if (match.index > lastIndex) {

      nodes.push(
        text.slice(
          lastIndex,
          match.index
        )
      );
    }

    nodes.push(
      <strong
        key={`bold-${key++}`}
        className="font-semibold text-brand-900"
      >
        {match[1]}
      </strong>
    );

    lastIndex =
      match.index +
      match[0].length;
  }


  if (lastIndex < text.length) {

    nodes.push(
      text.slice(lastIndex)
    );
  }

  return nodes;
}


const DEFAULT_STYLES = {

  container:
    "mt-3 space-y-4 font-body text-ink-muted",

  h3:
    "pt-2 font-display text-lg text-brand-900 first:pt-0",

  h4:
    "pt-1 font-display text-base text-brand-900 first:pt-0",

  ul:
    "list-disc space-y-1 pl-5 marker:text-brand-900",

  ol:
    "list-decimal space-y-1 pl-5 marker:text-brand-900",

} as const;


const COMPACT_STYLES = {

  container:
    "mt-1 space-y-2 font-body text-sm text-ink-muted",

  h3:
    "font-display text-base text-brand-900",

  h4:
    "font-display text-sm text-brand-900",

  ul:
    "list-disc space-y-0.5 pl-5 marker:text-brand-900",

  ol:
    "list-decimal space-y-0.5 pl-5 marker:text-brand-900",

} as const;


interface ProductContentProps {

  content: string;

  variant?:
    | "default"
    | "compact";
}


export function ProductContent({
  content,
  variant = "default",
}: ProductContentProps) {

  const blocks =
    parseBlocks(content);

  if (blocks.length === 0) {
    return null;
  }


  const styles =
    variant === "compact"
      ? COMPACT_STYLES
      : DEFAULT_STYLES;


  const rendered: ReactNode[] = [];

  let blockKey = 0;


  for (const block of blocks) {

    const key =
      `block-${blockKey++}`;


    if (block.kind === "heading") {

      const inline =
        renderInline(block.text);

      rendered.push(

        block.level <= 2 ? (

          <h3
            key={key}
            className={styles.h3}
          >
            {inline}
          </h3>

        ) : (

          <h4
            key={key}
            className={styles.h4}
          >
            {inline}
          </h4>

        )
      );

      continue;
    }


    if (block.kind === "paragraph") {

      const parts: ReactNode[] = [];

      let lineKey = 0;


      for (const line of block.lines) {

        if (lineKey > 0) {

          parts.push(
            <br
              key={`br-${lineKey}`}
            />
          );
        }

        parts.push(
          <Fragment
            key={`line-${lineKey}`}
          >
            {renderInline(line)}
          </Fragment>
        );

        lineKey++;
      }


      rendered.push(
        <p key={key}>
          {parts}
        </p>
      );

      continue;
    }


    if (block.kind === "ul") {

      const items: ReactNode[] = [];

      let itemKey = 0;


      for (const item of block.items) {

        items.push(
          <li
            key={`item-${itemKey++}`}
          >
            {renderInline(item)}
          </li>
        );
      }


      rendered.push(
        <ul
          key={key}
          className={styles.ul}
        >
          {items}
        </ul>
      );

      continue;
    }


    const items: ReactNode[] = [];

    let itemKey = 0;


    for (const item of block.items) {

      items.push(
        <li
          key={`item-${itemKey++}`}
        >
          {renderInline(item)}
        </li>
      );
    }


    rendered.push(
      <ol
        key={key}
        start={
          block.start !== 1
            ? block.start
            : undefined
        }
        className={styles.ol}
      >
        {items}
      </ol>
    );
  }


  return (
    <div className={styles.container}>
      {rendered}
    </div>
  );
}
