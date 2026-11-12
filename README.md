# RW Grading Estimates

RW Grading Estimates prepares a customer estimate in the browser and downloads a PDF. Rates, markups, deposit terms, and validity are editable on each job. There is no account, and estimate data stays in the browser unless you export it.

This repository is a fork of [Invoify](https://github.com/al1abb/invoify) by Ali Abbasov. The invoice builder from that project is still in the app. New estimate work lives at `/en/estimate`. The GitHub repository name remains `Rwooldridge2020/invoify`.

## Table of Contents

- [RW Grading Estimates](#rw-grading-estimates)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Your data stays in your browser](#your-data-stays-in-your-browser)
  - [Languages](#languages)
  - [Technologies](#technologies)
    - [Core Technologies](#core-technologies)
    - [Additional Dependencies](#additional-dependencies)
  - [Demo](#demo)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Environment variables](#environment-variables)
  - [Development](#development)
    - [Scripts](#scripts)
    - [Tests](#tests)
  - [License](#license)
  - [Discord](#discord)

## Features

- **13 invoice templates:** Classic, Modern, Sidebar, Bold Header, Minimal, Letterhead, Compact, Two-Tone, Bordered, Left Rail, Statement, Corner and Column.
- **Live preview:** edit the form and watch the invoice update as you type.
- **Real PDFs:** rendered with headless Chromium, not a screenshot of the page.
- **Email delivery:** send the finished PDF straight to your client.
- **Save and reload:** keep invoices in your browser and load them back later.
- **Address book:** save senders and clients once, reuse them on every invoice.
- **Export:** download the invoice data as JSON, CSV or XML.
- **Signatures, logos and custom line items,** including per-invoice tax, discount and shipping.
- **18 languages,** for both the interface and the generated PDF.
- **Responsive:** works on a phone as well as a desktop.

A walkthrough of the invoice builder is on the guide page when you run the app (`/en/guide`).

An exported estimate job file is JSON with `"kind": "rwg-estimate"`. `estimate.pdfTemplate` is optional. Leave it out, or set it to `1`, for the current letter layout. `2` through `13` use the invoice layouts, in the same order as the invoice picker: Modern, Sidebar, Bold Header, Minimal, Letterhead, Compact, Two-Tone, Bordered, Left Rail, Statement, Corner, and Column. Older files with no `pdfTemplate` still import as template 1.

## Your data stays in your browser

The app has no accounts and no database. Everything you enter (the address book, the autosave draft, saved invoices, and saved estimates) is stored locally, and it is encrypted at rest with AES-GCM 256 under a key the browser generates as non-extractable, so the key cannot be copied out of the origin.

Two things worth being clear about:

- This protects you against someone **reading the browser profile off disk**: a shared or stolen machine, a filesystem backup, a synced profile, another OS account.
- It does **not** protect against a script injected into the page, which holds the same key handle the app does. Defending against that would need a passphrase the app never stores.

The only time invoice data leaves your machine is when you generate a PDF or send one by email, and it is not retained afterwards.

## Languages

Arabic, Azerbaijani, Catalan, Chinese (Simplified), English, French, German, Hebrew, Indonesian, Italian, Japanese, Norwegian (Bokmål), Norwegian (Nynorsk), Polish, Portuguese (Brazil), Serbian, Spanish and Turkish.

Right-to-left layouts are supported for Arabic and Hebrew. Some PDF translations are still incomplete and fall back to English.

## Technologies

### Core Technologies

- **Next.js 15:** React framework for SSR and client-side navigation.
- **TypeScript:** JavaScript superset with static typing.
- **Shadcn-UI:** UI library for enhanced visuals.
- **Tailwind:** Utility-first CSS framework.
- **React Hook Form:** Form management for React.
- **Zod:** TypeScript-first schema validation.
- **Puppeteer:** PDF generation with headless browsers.
- **next-intl:** Internationalized routing and messages.

### Additional Dependencies

- **Nodemailer:** Node.js module for sending emails.
- **Lucide Icons:** Collection of customizable SVG icons.
- **Playwright:** End-to-end tests.

## Demo

> [!NOTE]
> [Upstream issue #11](https://github.com/al1abb/invoify/issues/11) reports PDF generation problems in Mozilla Firefox and is still open. The automated tests run against Chromium only, so the current state in Firefox is untested.

Run the app locally and open `/en/estimate`. The upstream Invoify demo is [invoify.vercel.app](https://invoify.vercel.app); that site is not this fork.

## Getting Started

Follow these instructions to run RW Grading Estimates locally.

### Prerequisites

- Node.js 20 or later, and npm.

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Rwooldridge2020/invoify.git
   cd invoify
   ```
2. Install dependencies

   ```bash
   npm install
   ```
3. Create an `.env.local` file. See [Environment variables](#environment-variables) below. You can skip this if you do not need the "send PDF by email" feature.
4. Start development server

   ```bash
   npm run dev
   ```
5. Open your web browser and access the application at [http://localhost:3000](http://localhost:3000)

### Environment variables

Mail settings are optional. `APP_PASSWORD` is optional in development and required in production.

| Variable | Required for | Notes |
| --- | --- | --- |
| `APP_PASSWORD` | Opening the app in production | HTTP Basic password for every page and `/api` route. The username is ignored. When this is set, a missing or wrong password gets `401` with `WWW-Authenticate: Basic`. When it is unset, development stays open and production refuses every request. |
| `NODEMAILER_EMAIL` | Sending invoices by email | The Gmail address that sends the mail. |
| `NODEMAILER_PW` | Sending invoices by email | A [Gmail **App Password**](https://support.google.com/accounts/answer/185833), **not** your account password. Requires 2-Step Verification. |

## Development

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | Production build. |
| `npm run start` | Serve the production build. |
| `npm run lint` | ESLint. |
| `npm run format` | Prettier, writing in place. |
| `npm run test:e2e` | Playwright end-to-end tests. |
| `npm run test:e2e:ui` | The same tests in Playwright's UI mode. |
| `npm run analyze` | Production build with the bundle analyzer. |
| `npx tsc --noEmit` | Typecheck. |

`predev` and `prebuild` run `scripts/build-pdf-css.mjs`, which compiles the stylesheet the PDF renderer inlines. It runs automatically, so you only need `npm run build:pdf-css` if you change PDF styling and want to rebuild it on its own.

### Tests

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

The suite builds and serves the production bundle, then runs against it in a desktop and a mobile viewport. CI runs the same typecheck, lint and test steps on every push and pull request. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## License

Distributed under the MIT License. Copyright (c) 2023 Ali Abbasov. See [`LICENSE`](LICENSE). Keep that copyright notice with any substantial copy. This fork does not change the license.

## Upstream

Invoify: [github.com/al1abb/invoify](https://github.com/al1abb/invoify). Upstream Discord: [discord.gg/uhXKHbVKHZ](https://discord.gg/uhXKHbVKHZ).
