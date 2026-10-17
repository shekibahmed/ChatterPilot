# Research note: how Indian small businesses write orders

Collected on 2026-10-17 by a research agent (web search over papers, product pages and Unicode
references) for ChatterPilot's default lexicon. **The lexicon tables are general knowledge, not a
validated corpus**: treat them as starting defaults to test against real (consented) exports.
Implementation: `packages/orders/src/lexicon.ts`; how to extend: `docs/catalogue.md`.

## Key findings

- **Corpora exist for romanized Hinglish, but none covers commerce or orders.**
  - L3Cube-HingCorpus has 52.93M sentences and 1.04B tokens of romanized Hindi-English from Twitter (WILDRE 2022): https://arxiv.org/pdf/2204.08398. Its HingBERT models and a language-ID dataset are at github.com/l3cube-pune/code-mixed-nlp (named in the search result, not opened).
  - COMI-LINGUA has 100,970 expert-annotated instances in both Devanagari and Roman script (arXiv 2025): https://arxiv.org/abs/2503.21670
  - A Mendeley Hinglish corpus mixes LLM-generated and manual sentences (v3, June 2024): https://data.mendeley.com/datasets/vdtcp2yt9n
  - Implication: spelling in the wild is not standardised, so ChatterPilot needs fuzzy and variant matching. The lexicon below is not backed by a paper.
- **I found no primary source on how kirana, hardware or pharma wholesalers write orders.** The searches returned only vendor pages.
  - Shopaver describes orders arriving as text, image or voice note, which the owner then keys into a POS: https://glasp.ai/posts/2ea058c1-2b77-4f4d-b624-4112a23571b2 (vendor blog, treat as marketing).
  - AiSensy offers a kirana order-bot template: https://aisensy.com/whatsapp-chatbot-template/kirana-order-bot (capability page only).
  - JioMart's 2020 WhatsApp pilot was catalogue-based: https://www.thenewsminute.com/article/reliance-s-e-grocery-offering-jiomart-goes-live-whatsapp-here-s-how-it-works-123417 (old; current status not checked).
- **Devanagari and Bengali digits are ordinary decimal digits.**
  - U+0966 to U+096F is Devanagari 0-9, and U+09E6 to U+09EF is Bengali 0-9. Both are category Nd with a numeric value, per https://codepoints.net/U+0966 and https://codepoints.net/U+09E6.
  - Normalise them with `\p{Nd}` and a code-point offset, or `Intl`/`parseInt` after mapping. I did not confirm the Numeric_Type property in a source. It is normally Decimal for Nd.
- **The best-supported design is to store pack size per SKU in the catalogue.** A line like "2 peti" then resolves to a defined number of pieces. The no-code vendor blog says catalogue-based ordering captures product, quantity, address and payment: https://www.rocket.new/blog/how-to-build-a-whatsapp-order-management-app-without-code

## Concrete specs / examples

All lexicon entries below come from my own knowledge, not from a verified source. Treat the values as proposed defaults and test them with real exports later. Items marked ambiguous must stay in review, never silently resolved.

**Number words (romanised, with variants)**

| Token variants | Value |
|---|---|
| ek, aik | 1 |
| do, 2 | 2 |
| teen, tin | 3 |
| char, chaar | 4 |
| paanch, panch, paach | 5 |
| chhe, chah, che | 6 |
| saat, sat | 7 |
| aath, ath | 8 |
| nau | 9 |
| das, dus | 10 |
| gyarah | 11 |
| barah | 12 |
| pandrah, pandra | 15 |
| bees | 20 |
| pachees | 25 |
| tees | 30 |
| chalis | 40 |
| pachas, pachaas | 50 |
| saath | 60 |
| sattar | 70 |
| assi | 80 |
| nabbe | 90 |
| sau, so | 100 |
| dedh | 1.5 |
| dhai, dhaai | 2.5 |
| sawa | +0.25 (sawa ek = 1.25) |
| paune | -0.25 (paune do = 1.75) |
| sadhe | +0.5 (sadhe teen = 3.5) |
| aadha, adha, aadhi | 0.5 |
| paav | 0.25 |
| hazaar, hazar, hajar | 1000 |
| lakh, lac | 100000 |
| crore | 10^7 |

- Compound forms like "pachas hazaar" multiply. Hindi 1-99 are irregular, so use a full table rather than rules.
- Multiplier units: dozen, darjan, darjan = 12; gross = 144 (ambiguous, see below).
- Ambiguous: "do" can be the number 2 or a verb ("do" = give). "sau" or "so" can also mean "so". "char" and "saath" also collide with ordinary words. Require a following unit or product noun before treating them as numbers.
- Also "aur" means "and". "ya" means "or", so a line with "ya" is a flagged alternative, not two items.

**Unit words**

| Tokens | Canonical unit | Note |
|---|---|---|
| bori, bora, boru, katta, kattha, bag, sack | BAG | cement, grain, fertiliser. Weight per bag is SKU-specific (cement is commonly 50 kg, a guess). |
| peti, carton, ctn, case, box | CASE | pieces per case from catalogue. |
| dabba, dibba, tin, jar | TIN / CONTAINER | |
| thaila, thaili, bag (small) | POUCH / BAG | ambiguous with BAG, keep the raw token. |
| nag, pcs, pc, piece, nos, no, num, unit | PIECE | |
| pkt, packet, pack | PACK | |
| strip, patta | STRIP | pharma. |
| tab, tabs | TABLET | |
| cap | CAPSULE | |
| btl, bottle, shishi | BOTTLE | |
| kg, kilo, kgs | KG | |
| gm, gram, g | GRAM | |
| ser, seer | about 0.933 kg (regional, guess) | ambiguous, flag. |
| quintal, qtl | 100 KG | |
| ton, tonne, mt | 1000 KG | |
| ltr, litre, liter, l | LITRE | |
| ml | ML | |
| ft, feet, foot | FOOT | |
| sqft, sq ft, sft | SQFT | |
| rft, rmt | RUNNING_FT, RUNNING_M | |
| mtr, meter, m | METRE | |
| than | THAN (roll of fabric) | length is SKU-specific. |
| bundle, bndl, gaddi | BUNDLE | |
| coil, roll | ROLL | |
| set | SET | |
| pair, jodi | PAIR | |
| dozen, dz, darjan | 12 PIECE | |

- "m" and "l" are risky single letters. Accept them only directly after a digit.
- "g" is risky for the same reason.

**Price phrasing**
- Patterns: `rs 450`, `Rs.450/-`, `₹450`, `450/-`, `450 rs`, `rate 450`, `bhav 450`, `450 ka maal`.
- A price after "per" or "/" refers to a unit, e.g. `450/bori`, `38 per kg`.
- "Bhav" means rate. "Rate kya hai?" is a question, not an order.

**Delivery and urgency**
- Day words: aaj = today, kal = tomorrow or yesterday (ambiguous, use tense or context), parso = day after tomorrow or day before.
- "Kal" is ambiguous. When it cannot be resolved, flag it for human review rather than guessing.
- Urgency: urgent, jaldi, abhi, immediately, asap.
- Other: subah = morning, shaam = evening, dopahar = afternoon.

**Synthetic example lines and expected parse** (illustrative values)
1. `ACC cement 50 bori kal bhej dena` gives product "ACC cement", qty 50, unit BAG, delivery "kal" (ambiguous, review).
2. `2 peti Parle-G aur ek peti Maggi` gives two lines: Parle-G 2 CASE, Maggi 1 CASE.
3. `tmt 12mm 5 ton rate 62000/-` gives TMT 12mm, 5 TON, price 62000 per unit (unit unclear, flag).
4. `paracetamol 500 10 strip + azithro 250 5 strip` gives two lines, each in STRIP.
5. `chawal 25 kg 3 bori` gives qty 3 BAG with a 25 kg pack size.
6. `dedh dozen pen` gives 1.5 DOZEN, so 18 PIECE.
7. `₹२५० /- ka 2 dabba paint urgent` gives 2 TIN, price 250 (Devanagari digits normalised), urgent flag.
8. `२ पेटी साबुन` gives 2 CASE, soap.
9. `tiles 1200 sq ft parso` gives 1200 SQFT, delivery parso (ambiguous).
10. `bees nag switch, pachas mtr wire` gives two lines: 20 PIECE and 50 METRE.
11. `sawa do kg` gives 2.25 kg, which is an edge case with a mistyped quantity.
12. `kal wala maal bhej do` is not an order line. It is a reference to an earlier order (do = give), so it needs review.

## Recommendations for ChatterPilot

1. **Digit normalisation (S).** Map all `\p{Nd}` to ASCII before parsing. It covers Devanagari, Bengali, Gujarati and Tamil digits cheaply and has the clearest source support.
2. **Deterministic lexicon with variant lists (S/M).** Put number words, unit words and price patterns in a data file (JSON), not in code, so businesses can extend it with their agentic harness.
3. **Per-SKU pack-size catalogue (M).** Keep `unit`, `pieces_per_case` and `kg_per_bag` per product. Never assume what a bori or peti holds. This is the best-supported finding.
4. **Ambiguity flags (S).** Mark kal, parso, ser, a bare "do", a bare "m", "l" or "g", and "thaila" as ambiguous. Send them to human review, which matches the review-first design.
5. **Test corpus (M).** Turn the synthetic lines above into golden tests. Keep them synthetic.
6. **Regional variants (M/L).** Add Bengali, Assamese, Marathi and Tamil romanised number and unit words once a native speaker can validate them. I did not find sources for those, and I left them out rather than guess.
7. **Optional fuzzy matching and language-ID (L).** Use the HingBERT or LID resources for noisy spelling. This is not needed for the baseline.

## Uncertainties

- I found no primary source (paper, product doc or trade guide) on real WhatsApp order phrasing for hardware, building materials, pharma, textiles or kirana. The lexicon is my own knowledge and needs validation by speakers and by real data.
- Regional unit sizes (ser, maund, than lengths, bori weight) vary and I could not verify them.
- Bengali, Assamese, Marathi and Tamil number words are not covered. I did not research them.
- I did not open the Unicode Character Database files, so Numeric_Type is unconfirmed.
- I did not check whether the HingCorpus, COMI-LINGUA or Mendeley licences allow use, or what they contain beyond their abstracts. No commerce content is confirmed.