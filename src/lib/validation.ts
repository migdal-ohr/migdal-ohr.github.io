/** Israeli ID (Teudat Zehut) check-digit validation (Luhn variant). */
export const isValidIsraeliId = (raw: string | undefined | null): boolean => {
  const id = (raw ?? "").replace(/\D/g, "");
  if (id.length < 5 || id.length > 9) return false;
  if (/^0+$/.test(id)) return false; // "000000000" = placeholder, not a real ID
  const padded = id.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
};

/** Normalise an ID for comparisons (digits only, padded to 9). */
export const normalizeId = (raw: string | undefined | null): string => {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d || /^0+$/.test(d)) return ""; // placeholder zeros are treated as "no ID"
  return d.padStart(9, "0");
};

/** Hebrew-aware text normalisation for search: drops niqqud, geresh, quotes, extra spaces. */
export const normalizeText = (s: string | undefined | null): string =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[֑-ׇ]/g, "") // niqqud & cantillation
    .replace(/["'״׳`]/g, "")
    .replace(/[-_.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const onlyDigits = (s: string | undefined | null): string => (s ?? "").replace(/\D/g, "");
