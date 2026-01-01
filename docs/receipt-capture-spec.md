# Receipt Capture App Requirements & Architecture Draft

## Requirements (captured from stakeholder responses)
- **Input**: JPEG file uploads from camera roll/desktop (no in-app camera), single-user.
- **AI extraction**: Use OpenAI for OCR + entity extraction. Handwritten receipts will be entered manually. Auto-infer categories suitable for tax purposes.
- **Required fields**: Amount, location/merchant, date; currency fixed to USD.
- **Duplicates**: Keep duplicates; mark duplicate rows with a red theme in the sheet.
- **Storage**: Cloud object storage (any provider with low/no-cost tier acceptable).
- **Spreadsheet destination**: Google Sheets; one file per year with one tab per month. Rows go to the tab for the receipt date. No separate export endpoint needed.
- **Dashboard UX**: Search/filter by date, amount range, category, merchant. No pre-save editing UI needed.
- **Deployment**: Next.js app hosted on Vercel.

## Proposed architecture
- **Frontend (Next.js / React, deployed on Vercel)**
  - Upload form for JPEG files with client-side size/type validation.
  - Dashboard page listing receipts with filters (date range, amount range, category, merchant) driven by server data.
  - Duplicate rows displayed with a red row background to mirror sheet styling.
- **API routes (Next.js Route Handlers on Vercel)**
  - `POST /api/upload`: accepts multipart/form-data, streams JPEG to object storage, enqueues AI extraction.
  - `POST /api/manual`: allows manual entry for hard-to-read/handwritten receipts; accepts metadata plus optional image reference.
  - `GET /api/receipts`: paginated/filterable list for the dashboard.
- **AI extraction pipeline**
  - Upload image is stored first, then passed to an OpenAI vision-capable model to extract amount, date, merchant/location, inferred category, currency=USD.
  - Normalize date to ISO (UTC) and amount to cents to avoid floating-point issues.
  - Confidence thresholds: if required fields missing/low confidence, flag the record for manual entry.
- **Duplication handling**
  - Detect duplicate by hashing the uploaded image bytes and by fuzzy matching on (amount, date, merchant). Duplicates are still stored; mark records as `duplicate=true` for sheet styling.
- **Google Sheets integration**
  - Maintain a yearly spreadsheet named `Receipts-<year>`. Auto-create monthly tabs named `YYYY-MM` if absent.
  - Rows include: receipt date, upload date, merchant/location, category, amount (USD), storage URL, duplicate flag, AI confidence scores, hash.
  - Apply red row formatting for `duplicate=true` via the Sheets API.
- **Object storage**
  - Use S3-compatible storage with free tier (e.g., Cloudflare R2/AWS S3 with lifecycle rules). Store public-read or signed-URL access as required.
- **Config & secrets**
  - Use Vercel environment variables for OpenAI keys, storage keys, Google service account (with Sheets/Drive scopes), and optional webhook signing secrets.

## Data model (proposed)
```
Receipt {
  id: string;
  storageUrl: string;
  uploadHash: string; // for duplicate detection
  merchant: string;
  location: string;
  category: string;
  amountCents: number;
  currency: 'USD';
  receiptDate: string; // ISO 8601
  uploadDate: string;  // ISO 8601
  duplicate: boolean;
  aiConfidence: number;
  notes?: string; // manual flag/reason
}
```

## Monthly rollover rules
- Determine target sheet tab from `receiptDate` (not upload date).
- If the year changes, auto-create/find the new yearly file and monthly tab before appending.

## Open questions / next decisions
- Preferred storage provider (Cloudflare R2 vs AWS S3 vs Supabase storage) and region.
- Desired max file size and retention policy.
- Should manual review queue appear in the dashboard when AI confidence is low?
- Any need for CSV export in addition to the Google Sheet?

## Next implementation steps
1) Set up env config and service clients (OpenAI, Sheets API, storage SDK) with mock adapters for local dev.
2) Build `POST /api/upload` with streaming to storage, hash computation, and OpenAI extraction.
3) Implement Sheets writer that ensures yearly file and monthly tab exist, applies red formatting to duplicates, and appends rows.
4) Create dashboard UI with filters, pagination, duplicate highlighting, and download link for stored image.
5) Add basic auth gate (single-user token/password) to protect uploads and dashboard on Vercel.
6) Add monitoring (logging and error reporting) around AI calls and Sheets writes.
