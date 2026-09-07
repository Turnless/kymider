# Kymider Frontend

Single React app with borrower/lender role toggle.

## Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- React Router v7
- QR Scanner (`@yudiel/react-qr-scanner`)

## Development

```sh
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:3000`.

## Build

```sh
npm run build
```

Output in `dist/`.

## Structure

```
src/
├── main.tsx              # Entry point
├── App.tsx               # Router + role toggle
├── index.css             # Tailwind + custom styles
├── lib/
│   ├── colors.ts         # Theme tokens
│   ├── format.ts         # Address/currency formatting
│   └── kymiderClient.ts  # Client integration layer
├── components/
│   ├── Layout.tsx         # Main layout shell
│   ├── Navbar.tsx         # Navigation + role toggle
│   ├── StatusBadge.tsx    # PASS/FAIL/PENDING badges
│   ├── PrivacyBanner.tsx  # "Data stays on device" banner
│   └── QRScanner.tsx      # QR code scanner modal
├── borrower/
│   ├── Landing.tsx        # Hero + how-it-works
│   ├── Dashboard.tsx      # Stats + instance info
│   ├── FactsForm.tsx      # Private financial data input
│   ├── ClaimsInbox.tsx    # Lender requests + attestations
│   └── AuthorizeLender.tsx # Grant lender access
└── lender/
    ├── Landing.tsx        # Hero + how-it-works
    ├── Registry.tsx       # Browse borrowers (table + cards)
    ├── BorrowerDetail.tsx # View borrower + request claim
    └── ClaimsDashboard.tsx # Track all claims
```

## Color Tokens

| Token | Borrower | Lender |
|---|---|---|
| Background | `#FFF7EB` | `#F9F0E0` |
| Surface | `#000000` | `#000000` |
| Primary | `#000000` | `#000000` |
| Secondary | `#D46D25` | `#D46D25` |
| Text | `#0F172A` | `#0F172A` |
| Text Light | `#F8FAFC` | `#F8FAFC` |

## Integration

The `src/lib/kymiderClient.ts` module exports a `MockKymiderClient` for development.
To wire up the real client, import `KymiderClient` from the root project's `client/index.ts`
and replace the mock calls.
