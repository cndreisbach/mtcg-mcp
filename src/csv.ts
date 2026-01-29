import type { Card } from "./types.ts";

const EXPECTED_COLUMNS = 17;

/**
 * Parse a single CSV line into fields, respecting double-quoted values.
 * Handles commas inside quotes (e.g. "Ezuri, Renegade Leader").
 */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;

    if (inQuotes) {
      if (char === '"') {
        // Peek ahead: doubled quote is an escaped literal quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip the second quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Parse a ManaBox CSV export into an array of Card objects.
 * Skips the header row. Logs warnings for malformed rows and continues.
 */
export function parseCollectionCSV(content: string): Card[] {
  // Normalize CRLF (Windows) line endings to LF
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    console.error("CSV has no data rows");
    return [];
  }

  // Skip header (line 0)
  const cards: Card[] = [];

  for (let idx = 1; idx < lines.length; idx++) {
    const fields = parseLine(lines[idx]!);

    if (fields.length !== EXPECTED_COLUMNS) {
      console.error(
        `Row ${idx + 1}: expected ${EXPECTED_COLUMNS} columns, got ${fields.length} -- skipping`
      );
      continue;
    }

    const binderType = fields[1]!;
    if (binderType !== "binder" && binderType !== "deck") {
      console.error(
        `Row ${idx + 1}: unknown binder type "${binderType}" -- skipping`
      );
      continue;
    }

    cards.push({
      binderName: fields[0]!,
      binderType,
      name: fields[2]!,
      setCode: fields[3]!,
      setName: fields[4]!,
      collectorNumber: fields[5]!,
      foil: fields[6]!,
      rarity: fields[7]!,
      quantity: parseInt(fields[8]!, 10) || 0,
      manaboxId: parseInt(fields[9]!, 10) || 0,
      scryfallId: fields[10]!,
      purchasePrice: parseFloat(fields[11]!) || 0,
      misprint: fields[12] === "true",
      altered: fields[13] === "true",
      condition: fields[14]!,
      language: fields[15]!,
      purchasePriceCurrency: fields[16]!,
    });
  }

  return cards;
}
