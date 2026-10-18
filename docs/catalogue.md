# Catalogue format

A catalogue is a folder with two CSV files and an optional settings file. It is the only source of
prices, units and tax for order drafts. Check it with `pnpm chatterpilot catalogue check <folder>`.

## products.csv

| Column | Required | Example | Notes |
|---|---|---|---|
| `product_id` | yes | `CEM-UB50` | Letters, digits, `-` and `_`; unique. |
| `name` | yes | `UltraBond Cement 50kg` | |
| `aliases` | no | `cement\|ultrabond\|ub cement` | Words people use in chat, separated by `\|`. The most specific match wins; a word shared by two products makes chats using it "ambiguous". |
| `unit` | yes | `bag` | Base selling unit: bag, sqft, piece, box, roll, kg, ton, metre, litre, bundle, sheet (common spellings accepted). |
| `alt_units` | no | `box:16` | Other units and how many base units they contain, separated by `\|`. |
| `price` | yes (may be empty) | `410.00` | Price per base unit, plain number, at most 2 decimals. Empty = no price; drafts will ask for one. |
| `currency` | yes | `INR` | 3-letter code. Lines in different currencies are never totalled together. |
| `price_effective_from` | no | `2026-01-01` | `YYYY-MM-DD`. Orders dated earlier are flagged. |
| `price_confirmed_on` | no | `2026-01-10` | When the price was last checked. Older than the stale limit at the order date → needs review. |
| `tax_rate_percent` | no | `18` | Empty = unknown; tax is never guessed. |

## customers.csv

| Column | Required | Example |
|---|---|---|
| `customer_id` | yes | `KB-01` |
| `name` | yes | `Kumar Builders` |
| `aliases` | no | `kumar builders site 2\|kb site` |

## catalogue.json (optional)

```json
{ "maintainer": "Name of the person who keeps prices up to date", "stalePriceDays": 30 }
```

Every catalogue file set gets a version (a fingerprint of the files). Each draft records the version
it was priced with, and the files are stored in the workspace so any draft can be re-checked later.

## lexicon.json (optional): your shop's own words

ChatterPilot already understands common English and romanised Hindi (Hinglish) order words: units
such as *bori/bora/katta* (bag), *peti/carton* (case), *nag/pcs* (piece), *dabba* (tin),
*darjan/dozen*; number words such as *ek, do, teen … bees, pachas, sau*, *dedh* (1.5), *dhai*
(2.5), *sawa/paune/sadhe* (+¼, −¼, +½), *hazaar, lakh*; and digits in Devanagari, Bengali/Assamese,
Gujarati, Gurmukhi, Tamil, Telugu, Kannada, Malayalam and other scripts. Quantities written in words
are always flagged for a person to confirm, and a number word only counts when a unit follows it
("do bori" = 2 bags; "bhej do" = "send it").

Add the words your customers use in `lexicon.json` next to `products.csv`. Entries are added to
the defaults; nothing is removed:

```json
{
  "units": { "than": ["than", "thaan"], "case": ["कार्टन"] },
  "numbers": { "dus": 10 },
  "nonOrderPhrases": ["sample bhejo"]
}
```

- `units`: canonical unit code (lowercase) → spellings. Use the code in `products.csv` (`unit`,
  `alt_units`). Pack sizes belong in `alt_units` (`case:48`), never in the lexicon.
- `numbers`, `modifiers`, `scales`: extra number words (values may be fractional).
- `multipliers`: counting units, e.g. `{ "gross": { "unit": "piece", "factor": 144 } }`.
- `nonOrderPhrases`: phrases that mark a message as not an order (questions, references).

The lexicon is part of the catalogue version, so every draft records exactly which words were used.
Product and customer names may be written in any script (for example `सीमेंट` as an alias).
