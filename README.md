# Classroom Studio
Business Spreadsheet Excel variant generator and QR attendance, extending the existing Financial Accounting Studio repository.

## Features
- Paired .xlsx task/solution upload, structure and source-number matching.
- Formula dependency analysis with teacher confirmation of editable inputs, ranges and precision.
- 1–40 unique seeded variants; formulas recalculated with HyperFormula.
- Student workbooks preserve ordinary sheet structure, styles, merged cells and blank answers.
- Individual downloads, student-only ZIP, and a separate Answer_Key.xlsx with all results, formulas and changed inputs.
- QR class sessions: authenticated teachers, rotating signed QR tokens, expiry, manual closure, unique student IDs/accounts, live records and Excel export.
- Persistent Cloudflare D1 records; every teacher query is scoped to the session creator.
- Uploaded spreadsheets are processed in the teacher's browser, never uploaded to the server.

## Run
Node.js >=22.13.0.
1. Run npm ci.
2. Run npm run build.
3. Apply each pending SQL file in drizzle/ in order using the local D1 command below.
4. Run npm run dev and open http://127.0.0.1:5173.
5. Use /signin-with-chatgpt?return_to=/ for the documented localhost-only mock identity. Hosted sign-in is handled by Sites, not this mock.

Local D1:
    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_melted_runaways.sql

## Tests
    npm test
    npx tsc --noEmit
    TEST_BASE_URL=http://127.0.0.1:5173 node --test tests/attendance.test.mjs

The Excel acceptance suite creates 40 variants, independently calculates results, checks preserved text/styles/merged cells and empty answers, verifies seeded reproducibility and cross-sheet answer-key references, and exercises invalid inputs, hardcoded answers, unsupported formulas and hidden content.

The optional attendance integration test creates test data only on loopback. It checks unauthenticated denial, class creation, signed tokens, persistent check-in, duplicate denial and closure.

## Template contract and limitations
Task and solution must have identical sheet names/order, labels, source numbers and merged cells. Formula answers must occupy blank task cells. Hardcoded answers cannot be reliably regenerated and are rejected. Editable numeric cells are proposed by dependency analysis: the teacher must confirm which numbers may change and their valid bounds once per template, not once per variant.

Business constraints described only in prose cannot be inferred safely. Encode dependent calculations as formulas or keep those fields fixed. Recalculation errors abort the entire generation, with no partial downloads offered.

Only .xlsx is accepted. Named ranges, macros, charts, drawings, pivots, external workbooks, embedded objects, hidden task content and volatile/dynamic formulas are rejected. Advanced Excel fidelity is not promised. Cached source answers are compared when present; missing cached values do not count as a native Excel validation. HyperFormula supports a subset of Excel functions and is not Microsoft Excel.

QR check-in is self-reported attendance, not identity or physical presence verification. A QR link can be forwarded while valid. It rotates every 30 seconds, accepts the current and previous time slots (up to 60 seconds), and requires an authenticated account. Users cannot inspect another teacher's attendee list. A private hosted Site admits only users allowed by the hosting access policy; student access must be configured before classroom use.

## Hosting
The application uses the maintained Sites Vinext/Cloudflare starter and its sites() Vite integration. .openai/hosting.json declares the DB binding; deployment applies Drizzle migrations. Do not deploy this Cloudflare-specific runtime directly as a Vercel function without adapting the database and authentication layer.

The previous static dashboard is retained under legacy-demo/ as historical reference.

## License
GPL-3.0-or-later; see LICENSE. HyperFormula is used under its GPLv3 option. Third-party copyright and license notices remain in their packages. Source: https://github.com/Bocci7/financial-accounting-studio
